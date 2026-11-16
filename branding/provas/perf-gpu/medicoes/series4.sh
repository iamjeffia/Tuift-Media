#!/bin/bash
TAG=$1; OUT=results-$TAG.jsonl
Q_TURN="chat=demo-focus-ring&feedbackScene=helper"
Q_BOTH="chat=demo-focus-ring&motion=demo-focus-ring:motion&feedbackScene=helper"
BREATHE='.motion-cast[data-running] .motion-cast__member[data-current] .motion-cast__head::before,.motion-cast__member[data-working] .motion-cast__head::before{animation:motion-cast-breathe 1.6s steps(6) infinite !important}'
run() { echo "[$(date +%T)] $1"; python measure.py "$1" --gpu --seconds 60 --settle 16 --trace --query "$2" --css "$3" --out $OUT > log-$TAG-$1.txt 2>&1; }
run d-turn-plain "$Q_TURN" ""
run e-turn-motion "$Q_BOTH" ""
run e2-turn-motion-breathe-stepped "$Q_BOTH" "$BREATHE"
echo done
