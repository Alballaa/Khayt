#!/usr/bin/env bash
# Build Khayt.app — a real, double-clickable Mac application.
#
# `swift run` is fine for working on the app and useless for testing it: no
# bundle, so no icon, no name in the menu bar, no Dock entry that survives a
# relaunch, and an activation policy the code has to set by hand. This assembles
# the same binary into the bundle macOS expects, ad-hoc signed so it opens.
#
#   ./mac/make-app.sh            # build, put it in mac/dist/Khayt.app
#   ./mac/make-app.sh --open     # …and launch it
#   ./mac/make-app.sh --install  # …and copy it to /Applications
#
# NOT the shipping build. Ad-hoc signing means this Mac will run it and no other
# will: notarisation, a Developer ID and a hardened runtime are what makes it
# something a shop can download, and none of that is here yet.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
PKG="$REPO/mac/KhaytCore"
DIST="$REPO/mac/dist"
APP="$DIST/Khayt.app"

VERSION="$(node -p "require('$REPO/package.json').version" 2>/dev/null || echo "0.0.0")"
# CFBundleVersion must be digits and dots only — "3.7.0-beta.25" is rejected and
# the app silently refuses to launch. The marketing string keeps the real name.
BUILD_VERSION="$(printf '%s' "$VERSION" | sed 's/[^0-9.].*$//' | sed 's/\.$//')"
[ -n "$BUILD_VERSION" ] || BUILD_VERSION="0.0.0"

echo "Building Khayt $VERSION (release)…"
swift build -c release --product Khayt --package-path "$PKG"
BIN="$PKG/.build/release/Khayt"
[ -x "$BIN" ] || { echo "no binary at $BIN"; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Khayt"

# SwiftPM's resource bundles. `Bundle.module` looks in Bundle.main.resourceURL
# first, so Contents/Resources is where they have to be — left beside the binary
# they are found in a `swift run` and not in the app, which fails as a missing
# module at the first call into the engine.
for b in "$PKG"/.build/release/*.bundle; do
  [ -e "$b" ] && cp -R "$b" "$APP/Contents/Resources/"
done

cp "$REPO/assets/icon.icns" "$APP/Contents/Resources/Khayt.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Khayt</string>
  <key>CFBundleDisplayName</key><string>Khayt</string>
  <key>CFBundleExecutable</key><string>Khayt</string>
  <!-- NOT app.khayt.hub. That is the Electron app, and two applications
       sharing an identifier confuses Launch Services, the defaults domain and
       the Keychain's idea of who is asking. -->
  <key>CFBundleIdentifier</key><string>app.khayt.mac</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD_VERSION</string>
  <key>CFBundleIconFile</key><string>Khayt</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Khayt</string>
  <key>NSSupportsAutomaticTermination</key><false/>
</dict>
</plist>
PLIST

# Ad-hoc signature. Without one, a binary built here and then moved is killed on
# launch as damaged rather than merely refused, which reads as a broken build.
codesign --force --sign - --timestamp=none "$APP" >/dev/null 2>&1 \
  || { echo "codesign failed"; exit 1; }
codesign --verify --deep --strict "$APP" 2>&1 | sed 's/^/  /' || true

echo "Built $APP"
du -sh "$APP" | sed 's/^/  /'

case "${1:-}" in
  --open)    open "$APP" ;;
  --install) rm -rf "/Applications/Khayt Native.app"
             cp -R "$APP" "/Applications/Khayt Native.app"
             echo "Installed to /Applications/Khayt Native.app" ;;
esac
