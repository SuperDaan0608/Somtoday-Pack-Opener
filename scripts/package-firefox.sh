#!/usr/bin/env bash
# Maakt de zip voor Firefox: dist/somtoday-pack-opener-<versie>-firefox.zip
# De bestanden staan direct in de zip (manifest.json bovenaan, geen tussenmap), zoals Firefox en addons.mozilla.org willen.
# Gebruik: ./scripts/package-firefox.sh v1.0
set -euo pipefail
VERSIE="${1:?gebruik: package-firefox.sh <versie, bijv. v1.0>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UIT="$ROOT/dist"
ZIP="$UIT/somtoday-pack-opener-$VERSIE-firefox.zip"
WERK="$(mktemp -d)"
trap 'rm -rf "$WERK"' EXIT

cp -R "$ROOT/extension/." "$WERK/"
# Alleen voor ontwikkelaars: horen niet in de zip.
# De beheerpagina is alleen voor de eigenaar (scripts/package-owner.sh).
rm -f "$WERK"/beheer.html "$WERK"/beheer.js "$WERK"/beheer.css
rm -f "$WERK/motor/openingen/proef.js" "$WERK/motor/openingen/LEESMIJ.md"
sed -i '/openingen\/proef\.js/d' "$WERK/stage.html"
find "$WERK" -name '.DS_Store' -delete

# Het manifest voor Firefox: zelfde extensie, plus een eigen id, hostrechten en de minimale Firefox-versie.
python3 - "$WERK/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
m.pop('version_name', None)
m['host_permissions'] = ['https://leerling.somtoday.nl/*', 'https://api.github.com/*']
m['background'] = {'scripts': ['account.js', 'vriendenlib.js', 'update.js']}
m['browser_specific_settings'] = {'gecko': {
    'id': 'pack-opener-firefox@superdaan0608.github.io',
    'strict_min_version': '140.0',
    'data_collection_permissions': {'required': ['none'], 'optional': ['personallyIdentifyingInfo']},
}, 'gecko_android': {'strict_min_version': '142.0'}}
json.dump(m, open(p, 'w'), indent=2, ensure_ascii=False)
PY

cat > "$WERK/LEESMIJ.txt" <<TXT
Somtoday Pack Opener $VERSIE (Firefox)

Proberen (tijdelijk, tot je Firefox afsluit):
1. Ga in Firefox naar about:debugging#/runtime/this-firefox
2. Klik "Tijdelijke add-on laden" en kies het bestand manifest.json uit de uitgepakte map
3. Ga naar leerling.somtoday.nl. Staat de extensie onder "Machtigingen" niet op "Toegang tot leerling.somtoday.nl", zet die dan aan via about:addons.

Blijvend installeren kan alleen met een door Mozilla ondertekende versie (addons.mozilla.org, "zelf distribueren").

Fanproject. Niet verbonden aan Somtoday of Topicus.
TXT

mkdir -p "$UIT"
rm -f "$ZIP"
(cd "$WERK" && zip -rqX "$ZIP" .)
# Controle: manifest.json moet bovenaan staan.
INHOUD="$(unzip -Z1 "$ZIP")"
grep -qx 'manifest.json' <<<"$INHOUD" || { echo "manifest.json staat niet bovenaan in de zip" >&2; exit 1; }
echo "$ZIP"
