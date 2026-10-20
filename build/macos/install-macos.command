#!/bin/bash
# Copies JoyChromium.app (from the disk image this script came in) to /Applications and clears the
# quarantine flag so the unsigned alpha can be opened. Nothing else is touched.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
app="$here/JoyChromium.app"
target="/Applications/JoyChromium.app"

if [ ! -d "$app" ]; then
  echo "JoyChromium.app not found next to this script ($here)."
  exit 1
fi

echo "Copying JoyChromium.app to /Applications…"
rm -rf "$target"
cp -R "$app" "$target"
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true

echo "Done. Opening JoyChromium."
open "$target"
