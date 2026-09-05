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
# The range ends at the closing bracket ON ITS OWN LINE, not at the first `]`
# anywhere. A comment inside the list that mentions `settings.slicers[]` ended
# the range early and silently synced a SHORTER list — the modules below the
# comment simply stopped being copied, which is drift that reports itself as
# nothing at all. Found the day such a comment was written.
MODULES=$(sed -n '/static let modules = \[/,/^    \]$/p' mac/KhaytCore/Sources/KhaytCore/KhaytEngine.swift \
          | grep -oE '^\s*"[a-z-]+",' | grep -oE '"[a-z-]+"' | tr -d '"')
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

# The invoice's stylesheet. The html is a bundled module; this is what it looks
# like, and two copies would be two documents that agree until one is edited.
cp renderer/invoice.css "mac/KhaytCore/Sources/KhaytApp/Resources/invoice.css"
echo "  synced invoice.css"

echo "$(echo "$MODULES" | wc -w | tr -d ' ') modules and $(echo "$LOCALES" | wc -w | tr -d ' ') locales synced"
