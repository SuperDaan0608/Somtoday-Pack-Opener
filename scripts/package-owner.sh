#!/usr/bin/env bash
# Maakt de EIGENAARSVERSIE (Chrome): de gewone extensie plus de beheerpagina en een tab 'Beheer' in de hub.
# Uitvoer: dist/somtoday-pack-opener-<versie>-OWNER.zip. Deze zip nooit delen of uploaden.
# De beheersleutel zit er niet in: de beheerpagina vraagt hem één keer en bewaart hem in chrome.storage.local.
# Gebruik: ./scripts/package-owner.sh v1.4
set -euo pipefail

VERSIE="${1:?gebruik: package-owner.sh <versie, bijv. v1.4>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAAM="somtoday-pack-opener"
UIT="$ROOT/dist"
ZIP="$UIT/$NAAM-$VERSIE-OWNER.zip"

WERK="$(mktemp -d)"
trap 'rm -rf "$WERK"' EXIT
cp -R "$ROOT/extension" "$WERK/$NAAM"
D="$WERK/$NAAM"
rm -f "$D/motor/openingen/proef.js" "$D/motor/openingen/LEESMIJ.md"
sed -i '/openingen\/proef\.js/d' "$D/stage.html"
for f in beheer.html beheer.js beheer.css; do [ -f "$D/$f" ] || { echo "$f ontbreekt in extension/" >&2; exit 1; }; done

# Tab 'Beheer' in de hub (alleen in deze build): pictogram, tabknop en paneel, en 'beheer' in de lijst van tabs.
python3 - "$D" <<'PY'
import sys, re
d = sys.argv[1]
h = open(d + '/hub.html', encoding='utf-8').read()
sym = '<symbol id="i-beheer" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></symbol>\n    '
assert '<symbol id="i-sluiten"' in h
h = h.replace('<symbol id="i-sluiten"', sym + '<symbol id="i-sluiten"', 1)
tab = '<div class="groep" role="presentation">Eigenaar</div>\n        <button type="button" role="tab" id="tab-beheer" data-tab="beheer" aria-controls="paneel-beheer"><svg class="ico" aria-hidden="true"><use href="#i-beheer"/></svg><span>Beheer</span></button>\n      '
m = re.search(r'</div>\s*<p class="zij-voet">', h)
assert m, 'tabs niet gevonden'
h = h[:m.start()] + '  ' + tab.rstrip() + '\n      ' + h[m.start():]
pan = '<section class="paneel kader" id="paneel-beheer" role="tabpanel" aria-labelledby="tab-beheer" hidden data-src="beheer.html?embed=1" data-titel="Beheer"><p class="laden" aria-hidden="true">Laden…</p></section>\n      '
assert '<!-- Proberen -->' in h
h = h.replace('<!-- Proberen -->', pan + '<!-- Proberen -->', 1)
open(d + '/hub.html', 'w', encoding='utf-8').write(h)
j = open(d + '/hub.js', encoding='utf-8').read()
m = re.search(r"const TABS = \[[^\]]*?\];", j)
assert m, 'TABS niet gevonden'
j = j[:m.end() - 2] + ", 'beheer'" + j[m.end() - 2:]
open(d + '/hub.js', 'w', encoding='utf-8').write(j)
# Chrome blokkeert een extensiepagina in een iframe op Somtoday als hij niet in web_accessible_resources staat.
import json
m = json.load(open(d + '/manifest.json', encoding='utf-8'))
for w in m['web_accessible_resources']:
    if 'hub.html' in w['resources'] and 'beheer.html' not in w['resources']:
        w['resources'].append('beheer.html')
json.dump(m, open(d + '/manifest.json', 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
PY
cat > "$D/LEESMIJ.txt" <<TXT
Somtoday Pack Opener $VERSIE (EIGENAARSVERSIE)

Alleen voor de eigenaar: bevat de beheerpagina (tab "Beheer"). Niet delen of uploaden.
De beheersleutel (beheer_sleutel uit config.php op de server) zit er niet in; de pagina vraagt hem één keer.

Installeren: chrome://extensions, Ontwikkelaarsmodus aan, "Uitgepakte extensie laden" en kies deze map.
TXT

mkdir -p "$UIT"
rm -f "$ZIP"
(cd "$WERK" && zip -rqX "$ZIP" "$NAAM")
echo "$ZIP"
