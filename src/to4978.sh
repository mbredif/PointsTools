inFolder=$1
outFolder=$2
pdalPipeline_File=$3

echo > progress.txt
echo '\n'
echo $inFolder
echo $outFolder

inFiles=$inFolder/*.las

ls $inFiles | \
parallel -I{} pdal -v 8 pipeline --progress progress.txt $pdalPipeline_File  \
 --readers.las.filename={} \
 --writers.las.filename=$outFolder'/{/.}.las' \