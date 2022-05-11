require('./common.js');
const itowns = require('itowns');
const proj4 = require('proj4');

const { spawn } = require('node:child_process');

const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const processFolder = process.cwd();

// get configuration file
const configFile = path.resolve(processFolder, args[0]);
const config = require(configFile);
const outputFolder = path.resolve(processFolder, config.outputFolder);

const { crs, defs } = config.projection;
if (!crs) {
    throw new Error('No projection crs');
}

// define projection
proj4.defs(crs, defs);

// create folder metadata output
const pathMetadata = path.resolve(outputFolder, './metadata/');

// Read info files and compute global extent
const nodesFiles = fs.readFileSync(path.resolve(pathMetadata, './pdalInfoFiles.json'));

const nodes = JSON.parse(nodesFiles);

let emprises = ""
const buffer = 0;

nodes.forEach((n) => {
    const bbox = n.summary.bounds;

    const min = new itowns.Coordinates(crs, bbox.minx - buffer, bbox.miny - buffer).as('EPSG:4326');
    const max = new itowns.Coordinates(crs, bbox.maxx + buffer, bbox.maxy + buffer).as('EPSG:4326');
    emprises += '(' + min.x + ", " + min.y + ', ' + max.x + ', ' + max.y + ')\n';
});

const child_process = spawn(path.resolve(__dirname,'bbox2geojson.sh'), []);
child_process.stdin.write(emprises);
child_process.stdin.end();

child_process.on('close', (code) => {
    if (code !== 0) {
      console.log(`bbox2geojson process exited with code ${code}`);
    }
});

child_process.stdout.on('data', (data) => {
    console.log(data.toString());
});



