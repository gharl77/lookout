#!/bin/zsh
# Compile l'app et produit build/Lookout.app
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${1:-release}"
swift build -c "$CONFIG"
BIN="$(swift build -c "$CONFIG" --show-bin-path)/Lookout"

APP="build/Lookout.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Lookout"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

codesign --force --sign - "$APP" >/dev/null
echo "✅ $APP"
