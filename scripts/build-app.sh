#!/bin/bash
# Assemble a minimal macOS .app bundle that invokes scripts/launch.sh.
# Drops the result at ~/Desktop/ScaleSync.app — double-click to start the
# dev server and open the app in a chromeless Chrome window.

set -e

APP_DIR="/Users/h2ocrib/Desktop/OHAUSE SCALE APP"
OUT="${HOME}/Desktop/ScaleSync.app"
LAUNCHER="${APP_DIR}/scripts/launch.sh"

if [ ! -f "${LAUNCHER}" ]; then
  echo "launcher script missing at ${LAUNCHER}" >&2
  exit 1
fi

# Make sure the underlying launcher is executable.
chmod +x "${LAUNCHER}"

# Start fresh if a previous bundle is there.
rm -rf "${OUT}"

mkdir -p "${OUT}/Contents/MacOS" "${OUT}/Contents/Resources"

# The bundle executable — a tiny shim that just forwards to the repo script.
# Keeping the logic in the repo means edits survive rebuilds.
cat > "${OUT}/Contents/MacOS/ScaleSync" <<EOF
#!/bin/bash
exec "${LAUNCHER}"
EOF
chmod +x "${OUT}/Contents/MacOS/ScaleSync"

# Info.plist — bare minimum metadata for macOS to treat this as an app.
cat > "${OUT}/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>ScaleSync</string>
  <key>CFBundleDisplayName</key>
  <string>ScaleSync</string>
  <key>CFBundleExecutable</key>
  <string>ScaleSync</string>
  <key>CFBundleIdentifier</key>
  <string>com.scalesync.launcher</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSUIElement</key>
  <false/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

# Copy icon if present; otherwise the app uses the generic macOS icon.
ICON_SRC="${APP_DIR}/scripts/AppIcon.icns"
if [ -f "${ICON_SRC}" ]; then
  cp "${ICON_SRC}" "${OUT}/Contents/Resources/AppIcon.icns"
fi

# Clear Gatekeeper quarantine so it launches without the "from the internet"
# prompt, since we built it locally.
xattr -cr "${OUT}" 2>/dev/null || true

echo "Built: ${OUT}"
echo "Double-click it on the Desktop to launch ScaleSync."
