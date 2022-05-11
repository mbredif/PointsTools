#!/bin/sh
#https://gist.github.com/hfs/2c27f40bcf26cc599910714822c23dce#file-bbox2geojson-sh
jq -nR '
{
  "type": "FeatureCollection",
  "features": [
    inputs | select(length>0) | sub("[()]"; ""; "g") | split(", *"; "") | map(tonumber) |
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Polygon",
          "coordinates":
            [
              [
                [.[0], .[1]],
                [.[2], .[1]],
                [.[2], .[3]],
                [.[0], .[3]],
                [.[0], .[1]]
              ]
            ]
          }
      }
  ]
}
'
