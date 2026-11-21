#!/bin/zsh
# Compile Lookout, l'installe dans /Applications et la relance.
set -euo pipefail
cd "$(dirname "$0")"

./build-app.sh
osascript -e 'tell application id "com.gharl77.Lookout" to quit' >/dev/null 2>&1 || true
for _ in {1..20}; do pgrep -qf "Lookout.app/Contents/MacOS" || break; sleep 0.25; done
ditto "build/Lookout.app" "/Applications/Lookout.app"
open "/Applications/Lookout.app"
echo "✅ Installée dans /Applications et relancée"
