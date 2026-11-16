#!/bin/bash
TAG=$1; OUT=results-$TAG.jsonl
Q_CHAT="chat=demo-focus-ring"
Q_MOTION="chat=demo-focus-ring&motion=demo-focus-ring:motion"
Q_TURN="chat=demo-focus-ring&feedbackScene=helper"
Q_BOTH="chat=demo-focus-ring&motion=demo-focus-ring:motion&feedbackScene=helper"
run() { echo "[$(date +%T)] $1"; python measure.py "$1" --gpu --seconds 60 --settle 16 --trace --query "$2" --css "$3" --out $OUT > log-$TAG-$1.txt 2>&1; }
run a-baseline "$Q_CHAT" ""
run b-motion-idle "$Q_MOTION" ""
run c-motion-paused "$Q_MOTION" '[data-beam-turn],[data-beam-still]{animation-play-state:paused !important}'
run d-turn-plain "$Q_TURN" ""
run e-turn-motion "$Q_BOTH" ""
echo done
