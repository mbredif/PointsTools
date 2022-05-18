#!/bin/bash
echo "Folder pathMetadata: $2"
echo "Folder LIDAR: $1"

inputFile="$1"
pathMetadata="$2"
folder="${inputFile%"${inputFile##*[!/]}"}" # extglob-free multi-trailing-/ trim
folder="${folder##*/}"                  # remove everything before the last /

infoFilesName="$pathMetadata/pdalInfoFiles.json"

echo "infoFilesName $infoFilesName"
echo "[" > $infoFilesName

# Create info files
ls "$1" | parallel -I{} "pdal info -i "$1"/{/.}.las --summary && echo ","" >> $infoFilesName

sed -i '$ d' $infoFilesName

echo "]" >> $infoFilesName

