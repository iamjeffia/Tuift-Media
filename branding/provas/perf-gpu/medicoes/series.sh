#!/bin/bash
# usage: series.sh <tag> [gpu|soft]
TAG=$1; MODE=${2:-gpu}
G=""; [ "$MODE" = gpu ] && G="--gpu"
OUT=results-$TAG.jsonl
Q_CHAT="chat=demo-focus-ring"
Q_MOTION="chat=demo-focus-ring&motion=demo-focus-ring:motion"
Q_TURN="chat=demo-focus-ring&feedbackScene=helper"
Q_BOTH="chat=demo-focus-ring&motion=demo-focus-ring:motion&feedbackScene=helper"
BOXP='.composer__design-beam > :is([data-beam-glow],[data-beam-stroke],[data-beam-bloom])'
BTNP='.composer__design-button-beam > :is([data-beam-glow],[data-beam-stroke],[data-beam-bloom])'
run() { # label query css
  FREE=$(powershell -c "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1)")
  echo "[$(date +%T)] $1 (free ${FREE} GB)"
  python measure.py "$1" $G --seconds 60 --trace --query "$2" --css "$3" --out $OUT > log-$TAG-$1.txt 2>&1
}
run a-baseline "$Q_CHAT" ""
run b-motion-idle "$Q_MOTION" ""
run c-motion-paused "$Q_MOTION" '[data-beam-turn],[data-beam-still]{animation-play-state:paused !important}'
run d-turn-plain "$Q_TURN" ""
run e-turn-motion "$Q_BOTH" ""
run p-stroke "$Q_MOTION" "$BOXP{display:none !important}.composer__design-beam > [data-beam-stroke]{display:block !important}$BTNP{display:none !important}"
run p-glow "$Q_MOTION" "$BOXP{display:none !important}.composer__design-beam > [data-beam-glow]{display:block !important}$BTNP{display:none !important}"
run p-bloom "$Q_MOTION" "$BOXP{display:none !important}.composer__design-beam > [data-beam-bloom]{display:block !important}$BTNP{display:none !important}"
run p-button "$Q_MOTION" "$BOXP{display:none !important}"
echo done
