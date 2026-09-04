#!/usr/bin/env bash
# Re-copy Khayt's pure business modules into the Mac app's bundle.
#
# lib/ is the one source of truth. These copies exist only because SPM resources
# must live inside the package. BundledLogicIsNotAForkTests fails if they drift,
# and this is how you fix that — never by editing the copy.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="mac/KhaytCore/Sources/KhaytCore/JS"
mkdir -p "$DEST"
MODULES=$(sed -n '/static let modules = \[/,/\]/p' mac/KhaytCore/Sources/KhaytCore/KhaytEngine.swift \
          | grep -oE '"[a-z-]+"' | tr -d '"')
[ -z "$MODULES" ] && { echo "could not read the module list from KhaytEngine.swift" >&2; exit 1; }
for m in $MODULES; do
  cp "lib/$m.js" "$DEST/$m.js"
  echo "  synced $m.js"
done

# Khayt's own translations, from renderer/locales/. Not lib/, and not named the
# way modules are — nine files all assigning onto one global — so they are copied
# by their own list rather than bent into the rule above.
LOCALES=$(sed -n '/static let locales = \[/,/\]/p' mac/KhaytCore/Sources/KhaytCore/KhaytEngine.swift \
          | grep -oE '"[a-zA-Z-]+"' | tr -d '"')
for l in $LOCALES; do
  cp "renderer/locales/$l.js" "$DEST/locale-$l.js"
  echo "  synced locale $l"
done

echo "$(echo "$MODULES" | wc -w | tr -d ' ') modules and $(echo "$LOCALES" | wc -w | tr -d ' ') locales synced"
