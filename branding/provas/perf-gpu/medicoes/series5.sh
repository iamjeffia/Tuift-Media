#!/bin/bash
OUT=results-scaling.jsonl
Q="chat=demo-focus-ring&motion=demo-focus-ring:motion"
for K in 72 144 288; do
  FPS=$((K*10/24))
  CSS="[data-beam-turn],[data-beam-still]{animation:composer-design-beam-spin 2.4s steps($K) infinite !important}"
  echo "[$(date +%T)] steps $K = $FPS fps"
  python measure.py scale-beam-${FPS}fps --gpu --seconds 40 --settle 6 --trace --trace-seconds 4 --query "$Q" --css "$CSS" --out $OUT > log-scale-$K.txt 2>&1
done
CSS="[data-beam-turn],[data-beam-still]{animation:composer-design-beam-spin 2.4s linear infinite !important}"
python measure.py scale-beam-smooth --gpu --seconds 40 --settle 6 --trace --trace-seconds 4 --query "$Q" --css "$CSS" --out $OUT > log-scale-smooth.txt 2>&1
echo done
