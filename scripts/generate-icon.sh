#!/bin/bash
# Render a ScaleSync app icon using Chrome headless + macOS sips + iconutil.
# Output: scripts/AppIcon.icns — build-app.sh will pick it up on next run.

set -e

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "${CHROME}" ]; then
  echo "Google Chrome is required to generate the icon." >&2
  exit 1
fi

TMPDIR_ROOT="$(mktemp -d)"
ICON_HTML="${TMPDIR_ROOT}/icon.html"
ICON_PNG="${TMPDIR_ROOT}/icon.png"
ICONSET="${TMPDIR_ROOT}/AppIcon.iconset"
OUT_ICNS="${SCRIPTS_DIR}/AppIcon.icns"

# Source SVG rendered at 1024x1024. Midnight-Ocean background + green
# cannabis seedling (same glyph as the Wet Weight button in the app).
cat > "${ICON_HTML}" <<'HTML'
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;}
  .wrap{width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(ellipse at 30% 20%, #1A2744 0%, #0B1222 70%);
    border-radius:224px;
    box-shadow:0 0 120px rgba(34,197,94,0.25);
  }
  svg{width:640px;height:640px;filter:drop-shadow(0 10px 40px rgba(34,197,94,0.35));}
</style></head><body>
  <div class="wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22V8" />
      <path d="M12 8C12 8 12 4 16 2C20 4 18 8 14 9" />
      <path d="M12 13C12 13 12 9 8 7C4 9 6 13 10 14" />
      <path d="M12 18C12 18 12 14 16 12C20 14 18 18 14 19" />
    </svg>
  </div>
</body></html>
HTML

echo "[icon] rendering 1024x1024 via Chrome headless..."
"${CHROME}" --headless --disable-gpu --no-sandbox \
  --hide-scrollbars --default-background-color=00000000 \
  --window-size=1024,1024 \
  --screenshot="${ICON_PNG}" \
  "file://${ICON_HTML}" >/dev/null 2>&1

if [ ! -f "${ICON_PNG}" ]; then
  echo "Chrome headless failed to produce ${ICON_PNG}" >&2
  exit 1
fi

# Build a macOS iconset (multiple sizes) and compile to .icns.
mkdir -p "${ICONSET}"
for SIZE in 16 32 64 128 256 512 1024; do
  sips -z "${SIZE}" "${SIZE}" "${ICON_PNG}" --out "${ICONSET}/icon_${SIZE}x${SIZE}.png" >/dev/null
done
# @2x variants (iconutil expects these names)
cp "${ICONSET}/icon_32x32.png"     "${ICONSET}/icon_16x16@2x.png"
cp "${ICONSET}/icon_64x64.png"     "${ICONSET}/icon_32x32@2x.png"
cp "${ICONSET}/icon_256x256.png"   "${ICONSET}/icon_128x128@2x.png"
cp "${ICONSET}/icon_512x512.png"   "${ICONSET}/icon_256x256@2x.png"
cp "${ICONSET}/icon_1024x1024.png" "${ICONSET}/icon_512x512@2x.png"
rm "${ICONSET}/icon_64x64.png" "${ICONSET}/icon_1024x1024.png"

iconutil -c icns -o "${OUT_ICNS}" "${ICONSET}"

rm -rf "${TMPDIR_ROOT}"

echo "[icon] wrote ${OUT_ICNS}"
echo "Re-run scripts/build-app.sh to embed it in ScaleSync.app."
