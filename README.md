# Points Tools

This tool converts **laz files** to **Ept cache** to be displayed on the Globe (`itowns.GlobeView`).
It applies projection on points to transform them into a local space tangent to ellispoid `EPSG:4978`.

It creates a `metadata` folder containing a `pivotTHREE.json` file. 
This file could place the ept cache on the globe.

## How convert to ept cache

* Install :
	* `Node js` (https://nodejs.org or via package managers)
	* `parallel` (https://www.gnu.org/software/parallel)
	* `Pdal` (https://pdal.io/index.html)
	* `entwine` (https://entwine.io the binary build by conda works)
* Clone repository
* setup configuration files:
	```js
	module.exports = {
		// set input folder to laz files
		inputFolder: 'path to laz files',
		// set ouput folder to ept cache
		outputFolder: 'path to output',
		// set projection to proj4
		projection: {
			crs: 'EPSG:2154',
			defs: '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
		}
	}
	```
* Launch command `node` with `./src/index.js` and with your config file

	```
	node ./src/index.js ./yourconfigfile.js
	```

## How load ept cache with itowns and Potree.

```js
var datGui = new dat.GUI();

Potree.pointBudget = 10000*1000;
const viewerDiv = document.getElementById("viewerDiv");

const placement = {
	coord: new itowns.Coordinates('EPSG:4326', 0, 0, 0),
	range: 5000000,
	tilt: 29.48,
	heading: -25.11
}
const view = new itowns.GlobeView(viewerDiv, placement);
const camera = view.camera.camera3D;

itowns.Fetcher.json('./layers/JSONLayers/Ortho.json').then(function _(config) {
	config.source = new itowns.WMTSSource(config.source);
	var layer = new itowns.ColorLayer('Ortho', config);
	view.addLayer(layer);
});

// instance points THREE.Group to add cloud
const points = new THREE.Group();
view.scene.add(points);
let pointclouds = [];

// Load pivot file, create by points Tools (assuming the `outputFolder` set in the configuration file is `./Out/`).
itowns.Fetcher.json('./Out/metadata/pivotTHREE.json').then((pivot) => {
	const loader = new THREE.ObjectLoader();
	return loader.parse(pivot);
}).then((pivotTHREE) => {
	// Load ept cache with 
	Potree.loadPointCloud('./Out/EPT_4978/ept.json', "pointcloud", function(e) {
		const pointcloud = e.pointcloud;

		// Place view
		const pivot = new itowns.Coordinates('EPSG:4978', 0, 0, 0)
		pivot.setFromVector3(pivotTHREE.position);
		view.controls.lookAtCoordinate({ coord: pivot, range: 5000 }, false);

		// transform points clouds with the pivot three
		// To place cloud on Globe
		pointclouds.push(pointcloud);
		pointcloud.position.copy(pivotTHREE.position);
		pointcloud.quaternion.copy(pivotTHREE.quaternion);

		pointcloud.material = new itowns.PointsMaterial();
		pointcloud.material.clipBoxes = [];
		pointcloud.material.mode = 0;
		pointcloud.material.intensityRange = new THREE.Vector3(0, 4096);
		pointcloud.material.uniforms.octreeSize = { value: 0 };
		pointcloud.material.size = 3;
	});

});

view.addFrameRequester(itowns.MAIN_LOOP_EVENTS.BEFORE_RENDER, (a) => {
	if (points) {
		const renderer = view.mainLoop.gfxEngine.renderer;
		const octree = Potree.updatePointClouds(pointclouds, camera, renderer);

		points.children = [];

		if (octree.visibleNodes.length) {
			const sceneNodes = octree.visibleNodes.map(a => a.sceneNode)
			for (var i = sceneNodes.length - 1; i >= 0; i--) {
				const sceneNode = sceneNodes[i]
				sceneNode.geometry.attributes.classification.normalized = true;
				const rgba = sceneNode.geometry.getAttribute('rgba');
				if (rgba) {
					sceneNode.geometry.setAttribute('color', rgba);
					sceneNode.geometry.deleteAttribute('rbga');
				}
				points.add(sceneNode);
			}
		}
		view.notifyChange(camera, true);
	}
});

```


