require('./common.js');
const cliProgress = require('cli-progress');
const fs = require('fs');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const parse = require('json-templates');
const jsonPdalTemplate = require('./pdalPipelineTemplate.json');
var xml2js = require('xml2js');
const commandExistsSync = require('command-exists').sync;

const itowns = require('itowns');
const proj4 = require('proj4');
const THREE = require('three');

const mandatoryCommands = ['pdal', 'entwine', 'parallel']

function checkCommand(command) {
    if(commandExistsSync(command)) {
        console.log(`- ${command} found`);
        return true;
    } else {
        console.log(`Error: ${command} not found, please install it.`);
        return false;
    }
}

if (mandatoryCommands.some(command => checkCommand(command) == false)) {
    return;
}

const template = parse(jsonPdalTemplate);

const args = process.argv.slice(2);
const processFolder = process.cwd();

// get configuration file
const configFile = path.resolve(processFolder, args[0]);
const config = require(configFile);

// get parameters from configuration file
const inputFolder = path.resolve(processFolder, config.inputFolder);
const outputFolder = path.resolve(processFolder, config.outputFolder);
const { crs, defs } = config.projection;

if (!crs) {
    throw new Error('No projection crs');
}

// define projection
proj4.defs(crs, defs);

// create folder metadata output
const pathMetadata = path.resolve(outputFolder, './metadata/');
fs.mkdirSync(pathMetadata, { recursive: true })

// Parse all files and agregate all infos files
execSync(`${path.resolve(__dirname,'./pdal_info.sh')} ${inputFolder} ${pathMetadata}`);

// Read info files and compute global extent
const nodesFiles = fs.readFileSync(path.resolve(pathMetadata, './pdalInfoFiles.json'));

const nodes = JSON.parse(nodesFiles);

console.log('\n * Files count :\t', nodes.length);

let maxx = -Infinity;
let maxy = -Infinity;
let maxz = -Infinity;
let minx = +Infinity;
let miny = +Infinity;
let minz = +Infinity;
let totalPoints = 0;
nodes.forEach((n) => {
    const bbox = n.summary.bounds;
    totalPoints += n.summary.num_points;
    maxx = Math.max(bbox.maxx, maxx);
    maxy = Math.max(bbox.maxy, maxy);
    maxz = Math.max(bbox.maxz, maxz);
    minx = Math.min(bbox.minx, minx);
    miny = Math.min(bbox.miny, miny);
    minz = Math.min(bbox.minz, minz);
});


async function start() {
    const extent = new itowns.Extent(crs, minx, maxx, miny, maxy);
    console.log(' * Extent ', crs, '(west, east, south, north) :',`(${extent.west}, ${extent.east}, ${extent.south}, ${extent.north})`)

    var parser = new xml2js.Parser(/* options */);
    const wmsData = fs.readFileSync(path.resolve(__dirname,'./wms_template.xml'));

    const wms = await parser.parseStringPromise(wmsData)
    const dim = extent.dimensions().divideScalar(0.2);
    const dataWindow = wms.GDAL_WMS.DataWindow[0];
    dataWindow.UpperLeftX = Math.round(extent.west) - 1;
    dataWindow.UpperLeftY = Math.round(extent.north) + 1;
    dataWindow.LowerRightX = Math.round(extent.east) + 1;
    dataWindow.LowerRightY = Math.round(extent.south) - 1;

    dataWindow.SizeX = Math.round(dim.x + 2);
    dataWindow.SizeY = Math.round(dim.y + 2);

    var builder = new xml2js.Builder({ headless: true });
    var xml = builder.buildObject(wms);

    // path to xml raster
    const pathXmlRaster = path.resolve(__dirname,'./wms.xml');

    fs.writeFileSync(pathXmlRaster, xml);

    const pivot = extent.center();
    console.log(' * Center extent', crs , ' : (', pivot.x, ',', pivot.y, ')');

    const inCrs = crs;

    function computePdalPivot(pivot) {
        // Compute matrix transformation to convert 4978 to local space
        const pivot4978 = pivot.as('EPSG:4978');
        const pivotWGS84 = pivot.as('EPSG:4326');

        console.log(' * Center extent', pivotWGS84.crs , ' : (', pivotWGS84.x.toFixed(6), '°,', pivotWGS84.y.toFixed(6), '°)\n');

        const idWGGS84 = `${pivotWGS84.x}_${pivotWGS84.y}`;

        const quaternionZ = new THREE.Quaternion().setFromUnitVectors(pivotWGS84.geodesicNormal, new THREE.Vector3(0, 0, 1));
        const scale = new THREE.Vector3(1, 1, 1);

        const vectorPivot = pivot4978.toVector3().applyQuaternion(quaternionZ).negate();

        // transform matrix to apply in pdal pipeline
        const mat = new THREE.Matrix4().compose(vectorPivot, quaternionZ, scale);

        // transform matrix to apply in pdal pipeline format
        const matrixTransformation = mat.transpose().toArray().toString().replace(/,/g, ' ');
        const pdalPipeline = template({ inCrs, matrixTransformation, pathXmlRaster });

        // Generate pdal pipeline file
        const pdalPipeline_File = path.resolve(pathMetadata, `pdalPipeline_${idWGGS84}.json`);
        fs.writeFileSync(pdalPipeline_File, JSON.stringify(pdalPipeline, null, 2));

        const pivotTHREE = new THREE.Object3D();
        // THREE transform to place point cloud on globe
        pivotTHREE.position.copy(vectorPivot).negate();
        pivotTHREE.quaternion.copy(quaternionZ).invert();
        pivotTHREE.position.applyQuaternion(pivotTHREE.quaternion);
        pivotTHREE.updateMatrix();
        pivotTHREE.updateMatrixWorld();

        // Compute THREE Pivot and save in file, this must the parent of the EPT
        const fileNameTHREEPivot = path.resolve(pathMetadata, `pivotTHREE.json`);
        fs.writeFileSync(fileNameTHREEPivot, JSON.stringify(pivotTHREE.toJSON(), null, 2));

        // Verify load and parse the file
        // const verify = fs.readFileSync(fileNameTHREEPivot);
        // console.log('obj', loader.parse(JSON.parse(verify)));
        return pdalPipeline_File;
    }


    const pdalPipeline_File = computePdalPivot(pivot);

    const pathOut4978 = path.resolve(outputFolder, './4978/');
    fs.mkdirSync(pathOut4978, { recursive: true })

    // Convert to EPSG:4978 local space
    const lsToLaz4978 = spawn(path.resolve(__dirname,'./to4978.sh'),  [inputFolder, pathOut4978, pdalPipeline_File]);

    // create a new progress bar instance and use shades_classic theme
    const barPdal = new cliProgress.SingleBar({
        format: 'Convert to laz 4978 [{bar}] {percentage}% | ETA: {eta}s',
        forceRedraw: true }, cliProgress.Presets.shades_classic);

    // start the progress bar with a total value of 200 and start value of 0
    barPdal.start(100, 0);

    let progress = 0;

    lsToLaz4978.stdout.on('data', (data) => {
        // update the current value in your application..
        // console.log(`stdout: ${data}`);
    });

    lsToLaz4978.stderr.on('data', (data) => {
        const m = data.toString().match(/(?<=Wrote\s).[0-9]+/gm);

        if (m && m[0]) {
            progress += parseInt(m[0]) / totalPoints * 100;
            barPdal.update(progress);
        }
    });

    lsToLaz4978.on('error', (error) => {
        console.log(`error: ${error.message}`);
    });

    lsToLaz4978.on('close', (code) => {
        barPdal.update(progress++);
        // stop the progress bar
        barPdal.stop();

        const barEpt = new cliProgress.SingleBar({
        format: 'Convert to ept 4978 [{bar}] {percentage}% | ETA: {eta}s',
        forceRedraw: true }, cliProgress.Presets.shades_classic);
        barEpt.start(100, 0);

        const ept4978Path = path.resolve(outputFolder, './EPT_4978/');
        fs.mkdirSync(ept4978Path, { recursive: true })

        const configEPTFile = path.resolve(pathMetadata, `eptConfig.json`);

        const configEpt = {
            input: pathOut4978,
            output: ept4978Path,
            threads: [1, 1],
        }

        fs.writeFileSync(configEPTFile, JSON.stringify(configEpt, null, 2));

        const lsEPT = spawn('entwine',  ['build', '-c', configEPTFile]);
        progress = 0;
        lsEPT.stdout.on('data', (data) => {
            const m = data.toString().match(/(?<=-)(.*)(?=%)/gm);

            if (m && m[0]) {
                progress = parseInt(m[0]);
                barEpt.update(progress);
            }
        });
        lsEPT.stderr.on('data', (data) => {
            console.log('stderr.on', data.toString());

        });
        lsEPT.on('error', (error) => {
            console.log('error', error);
        });
        lsEPT.on('close', (code) => {
            barEpt.stop();
        });

    });

};

start();
