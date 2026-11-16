#!/bin/bash
TAG=$1; OUT=results-$TAG.jsonl
Q_TURN="chat=demo-focus-ring&feedbackScene=helper"
SHIM='.activity--live .activity__label{animation:none !important}'
PULSE='.activity__pulse{animation:none !important}'
SPIN='.sess__spinner,.spinner,.is-spinning{animation:none !important}'
run() { echo "[$(date +%T)] $1"; python measure.py "$1" --gpu --seconds 40 --trace --query "$2" --css "$3" --js "$4" --out $OUT > log-$TAG-$1.txt 2>&1; }
run x-turn-steps24 "$Q_TURN" '.activity--live .activity__label{animation:activity-label-shine 2.4s steps(24) infinite !important}' ""
run x-turn-no-shimmer "$Q_TURN" "$SHIM" ""
run x-turn-shimmer-only "$Q_TURN" "$PULSE$SPIN" ""
run x-turn-pulse-only "$Q_TURN" "$SHIM$SPIN" ""
run x-turn-spinner-only "$Q_TURN" "$SHIM$PULSE" ""
run x-turn-all-off "$Q_TURN" "$SHIM$PULSE$SPIN" ""
run x-floor-tiny-spinner "chat=demo-focus-ring" "" "(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;right:40px;top:40px;width:10px;height:10px;background:red;animation:fl 1s linear infinite';const s=document.createElement('style');s.textContent='@keyframes fl{to{transform:rotate(360deg)}}';document.head.append(s,d)})()"
echo done
