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
  <!-- A job being dragged across the board. Declared so the drag is this app's
       own: a board that accepted any dragged text would move a job because
       someone dropped a word on it. -->
  <key>UTExportedTypeDeclarations</key>
  <array>
    <dict>
      <key>UTTypeIdentifier</key><string>app.khayt.mac.job</string>
      <key>UTTypeDescription</key><string>Khayt job</string>
      <key>UTTypeConformsTo</key><array><string>public.data</string></array>
    </dict>
  </array>
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

# Installing over a RUNNING app is not safe, and it is quiet about it.
#
# `rm -rf` deletes the bundle a running process is still reading from. The
# executable itself survives — the kernel holds the inode — so the app carries
# on, and every resource it has not paged in yet is simply gone: the bundled
# business rules, the locale catalogues, the sample shop, the invoice
# stylesheet. What that produces is not a clean failure, it is whatever the
# first missing file happens to break, and it looks exactly like a bug in
# whatever the shop was doing at the time.
#
# It also does not do what the person running it thinks. A running app keeps
# the build it launched with; replacing the bundle changes what the NEXT launch
# gets and nothing about the one on screen.
installed="/Applications/Khayt Native.app"
install_app() {
  if pgrep -f "Khayt Native.app/Contents/MacOS/Khayt" >/dev/null 2>&1; then
    if [ "${2:-}" = "--force" ]; then
      echo "Khayt Native is running — installing over it anyway, as asked." >&2
    else
      echo "Khayt Native is RUNNING. Not installing over it." >&2
      echo "  Quit it first, then run this again. The running app would keep the" >&2
      echo "  build it launched with in any case, and replacing the bundle under" >&2
      echo "  it can break it in ways that look like something else." >&2
      echo "  ./mac/make-app.sh --install --force  overrides this." >&2
      exit 1
    fi
  fi
  rm -rf "$installed"
  cp -R "$APP" "$installed"
  echo "Installed to $installed"
  echo "If it was open, quit and reopen it — a running app keeps the build it started with."
}

case "${1:-}" in
  --open)    open "$APP" ;;
  --install) install_app "$@" ;;
esac
