#!/usr/bin/env bash
# Maakt de zip voor een release: dist/somtoday-pack-opener-<versie>.zip
# Gebruik: ./scripts/package.sh v0.1-beta
set -euo pipefail

VERSIE="${1:?gebruik: package.sh <versie, bijv. v0.1-beta>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAAM="somtoday-pack-opener"
UIT="$ROOT/dist"
ZIP="$UIT/$NAAM-$VERSIE.zip"

# De versie in manifest.json moet bij de tag passen (v0.1-beta -> 0.1.x).
MANIFEST_VERSIE="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/extension/manifest.json")"
KERN="$(echo "$VERSIE" | sed -E 's/^v//; s/-.*$//')"
case "$MANIFEST_VERSIE" in
  "$KERN" | "$KERN".*) ;;
  *) echo "manifest.json heeft versie $MANIFEST_VERSIE, maar de tag is $VERSIE" >&2; exit 1 ;;
esac

WERK="$(mktemp -d)"
trap 'rm -rf "$WERK"' EXIT
cp -R "$ROOT/extension" "$WERK/$NAAM"
# Alleen voor ontwikkelaars: het proef-voorbeeld en de handleiding voor het bouwen van openingen horen niet in de zip.
# De beheerpagina is alleen voor de eigenaar (scripts/package-owner.sh).
rm -f "$WERK/$NAAM"/beheer.html "$WERK/$NAAM"/beheer.js "$WERK/$NAAM"/beheer.css
rm -f "$WERK/$NAAM/motor/openingen/proef.js" "$WERK/$NAAM/motor/openingen/LEESMIJ.md"
sed -i '/openingen\/proef\.js/d' "$WERK/$NAAM/stage.html"
cat > "$WERK/$NAAM/LEESMIJ.txt" <<EOF
Somtoday Pack Opener $VERSIE

Installeren:
1. Ga in Chrome naar chrome://extensions
2. Zet rechtsboven Ontwikkelaarsmodus aan
3. Klik op "Uitgepakte extensie laden" en kies deze map
4. Pin de extensie en klik op het icoon (of druk op Alt+Shift+P)

Fanproject. Niet verbonden aan Somtoday of Topicus.
EOF

# Veiligheid: debugcode hoort nooit in een gewone release (alleen scripts/package-debug.sh mag die maken).
if grep -rqE '__spoDebug|spo_debug|debug-somtoday|version_name": *"[^"]*debug' "$WERK"; then
  echo "Er zit debugcode in deze build. Afgebroken." >&2; exit 1
fi
if find "$WERK" \( -name 'debug.html' -o -name 'debug.js' -o -name 'debug.css' -o -name 'debug-somtoday.js' \) | grep -q .; then
  echo "Er zitten debugbestanden in deze build. Afgebroken." >&2; exit 1
fi

mkdir -p "$UIT"
rm -f "$ZIP"
(cd "$WERK" && zip -rqX "$ZIP" "$NAAM")
echo "$ZIP"
