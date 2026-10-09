#!/usr/bin/env bash
# Maakt de DEBUG-BUILD voor de eigenaar: de gewone extensie plus een testmenu (tab "Debug" in de hub).
# Uitvoer: dist/somtoday-pack-opener-<versie>-debug.zip (Chrome) en dist/somtoday-pack-opener-<versie>-debug-firefox.zip
# Deze zips nooit delen of in een release zetten. De debugbestanden staan in scripts/debug/ en dus niet in extension/;
# package.sh, package-firefox.sh en package-owner.sh weigeren bovendien een zip te maken als er toch debugcode in zit.
# De server-versie blijft gewoon 2.4.0 ("version"), zodat de versiecontrole met vrienden klopt; alleen "version_name" zegt -debug.
# Gebruik: ./scripts/package-debug.sh [versie, bijv. v2.4]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST_VERSIE="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/extension/manifest.json" | head -1)"
VERSIE="${1:-v$MANIFEST_VERSIE}"
NAAM="somtoday-pack-opener"
UIT="$ROOT/dist"
DBG="$ROOT/scripts/debug"
for f in debug.html debug.css debug.js debug-somtoday.js; do [ -f "$DBG/$f" ] || { echo "$f ontbreekt in scripts/debug/" >&2; exit 1; }; done

WERK="$(mktemp -d)"
trap 'rm -rf "$WERK"' EXIT

# bouw <map> <chrome|firefox>: kopieert de extensie, haalt de ontwikkelaarsbestanden weg en bouwt het testmenu erin.
bouw() {
  local D="$1" DOEL="$2"
  mkdir -p "$D"
  cp -R "$ROOT/extension/." "$D/"
  rm -f "$D"/beheer.html "$D"/beheer.js "$D"/beheer.css
  rm -f "$D/motor/openingen/proef.js" "$D/motor/openingen/LEESMIJ.md"
  sed -i '/openingen\/proef\.js/d' "$D/stage.html"
  find "$D" -name '.DS_Store' -delete
  cp "$DBG/debug.html" "$DBG/debug.css" "$DBG/debug.js" "$DBG/debug-somtoday.js" "$D/"
  python3 - "$D" "$DOEL" <<'PY'
import sys, re, json
d, doel = sys.argv[1], sys.argv[2]

def lees(p): return open(d + '/' + p, encoding='utf-8').read()
def schrijf(p, t): open(d + '/' + p, 'w', encoding='utf-8').write(t)
def vervang(p, oud, nieuw):
    t = lees(p)
    assert t.count(oud) == 1, f'{p}: patroon niet (precies één keer) gevonden: {oud[:50]!r}'
    schrijf(p, t.replace(oud, nieuw, 1))

# 1. Haakjes in bestaande bestanden (alleen in deze build): de functie toon/feest bloot, 'slaapt' te forceren, extra velden voor de proef.
vervang('meldingen.js', '  async function vraag() {', '  window.__spoDebugToon = toon; // debug-build\n  async function vraag() {')
vervang('rooster.js', '  function confetti(canvas, gestopt) {', '  window.__spoDebugFeest = feest; // debug-build\n  function confetti(canvas, gestopt) {')
vervang('huisdier.js', "const slaapt = (d) => { const u = (d || new Date()).getHours(); return u >= 22 || u < 7; };",
        "const slaapt = (d) => { if (typeof globalThis.__spoDebugSlaap === 'boolean') return globalThis.__spoDebugSlaap; /* debug-build */ const u = (d || new Date()).getHours(); return u >= 22 || u < 7; };")
vervang('content.js', '      direct: true, // de klik in het paneel is er al geweest\n',
        '      direct: true, // de klik in het paneel is er al geweest\n'
        '      valsAlarm: d.valsAlarm, upgrade: d.upgrade, // debug-build: vals alarm en upgrade vastzetten\n'
        '      opOnthuld() { if (d.vloek === true) setTimeout(toonVloek, 450); }, // debug-build: de vloek-glitch\n')
# Debugkaarten (id 'debug:...') gaan niet naar vrienden, tenzij het vinkje in het testmenu dat toestaat.
vervang('vriendenlib.js', '  async function zetBlob(st, vriend, galerij) {\n',
        '  async function zetBlob(st, vriend, galerij) {\n'
        "    { const dbg = await lees('spo_debug'); /* debug-build */\n"
        "      if (!(dbg && dbg.deelDebug === true)) galerij = (galerij || []).filter((e) => !(e && typeof e.id === 'string' && e.id.startsWith('debug:'))); }\n")

# 2. Tab 'Debug' in de hub.
h = lees('hub.html')
sym = '<symbol id="i-debug" viewBox="0 0 24 24"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></symbol>\n    '
assert '<symbol id="i-sluiten"' in h
h = h.replace('<symbol id="i-sluiten"', sym + '<symbol id="i-sluiten"', 1)
tab = '<div class="groep" role="presentation">Debug</div>\n        <button type="button" role="tab" id="tab-debug" data-tab="debug" aria-controls="paneel-debug"><svg class="ico" aria-hidden="true"><use href="#i-debug"/></svg><span>Testmenu</span></button>\n      '
m = re.search(r'</div>\s*<p class="zij-voet">', h)
assert m, 'tabs niet gevonden'
h = h[:m.start()] + '  ' + tab.rstrip() + '\n      ' + h[m.start():]
pan = '<section class="paneel kader" id="paneel-debug" role="tabpanel" aria-labelledby="tab-debug" hidden data-src="debug.html?embed=1" data-titel="Debug"><p class="laden" aria-hidden="true">Laden…</p></section>\n      '
assert '<!-- Proberen -->' in h
h = h.replace('<!-- Proberen -->', pan + '<!-- Proberen -->', 1)
h = h.replace('<title>Pack Opener</title>', '<title>Pack Opener (DEBUG)</title>', 1)
schrijf('hub.html', h)
j = lees('hub.js')
m = re.search(r"const TABS = \[[^\]]*?\];", j)
assert m, 'TABS niet gevonden'
schrijf('hub.js', j[:m.end() - 2] + ", 'debug'" + j[m.end() - 2:])

# 3. Manifest: naam, version_name, de ontvanger op Somtoday en debug.html bereikbaar voor het hub-paneel.
mf = json.load(open(d + '/manifest.json', encoding='utf-8'))
mf['name'] = 'Somtoday Pack Opener DEBUG'
mf['version_name'] = mf['version'] + '-debug'
mf['content_scripts'][1]['js'].append('debug-somtoday.js')
for w in mf['web_accessible_resources']:
    if 'hub.html' in w['resources'] and 'debug.html' not in w['resources']:
        w['resources'].append('debug.html')
if doel == 'firefox':
    mf.pop('version_name', None)  # Firefox kent dit veld niet; de naam zegt al DEBUG
    mf['host_permissions'] = ['https://leerling.somtoday.nl/*', 'https://api.github.com/*']
    mf['background'] = {'scripts': ['account.js', 'vriendenlib.js', 'update.js']}
    mf['browser_specific_settings'] = {'gecko': {
        'id': 'pack-opener-debug@superdaan0608.github.io',
        'strict_min_version': '140.0',
        'data_collection_permissions': {'required': ['none'], 'optional': ['personallyIdentifyingInfo']},
    }, 'gecko_android': {'strict_min_version': '142.0'}}
json.dump(mf, open(d + '/manifest.json', 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
PY
}

mkdir -p "$UIT"

# Chrome
bouw "$WERK/chrome/$NAAM" chrome
cat > "$WERK/chrome/$NAAM/LEESMIJ.txt" <<TXT
Somtoday Pack Opener $VERSIE DEBUG-BUILD

Alleen voor de eigenaar. Niet delen, niet uploaden, niet in een release zetten.
Bevat het testmenu (tab "Testmenu" in de hub, of debug.html in een los tabblad).
Debugkaarten krijgen het id "debug:..." en worden standaard niet met vrienden gedeeld.

Installeren: chrome://extensions, Ontwikkelaarsmodus aan, "Uitgepakte extensie laden" en kies deze map.
Haal de gewone versie eerst weg (zelfde opslag), of gebruik een apart Chrome-profiel.
TXT
ZIP="$UIT/$NAAM-$VERSIE-debug.zip"
rm -f "$ZIP"
(cd "$WERK/chrome" && zip -rqX "$ZIP" "$NAAM")
echo "$ZIP"

# Firefox (bestanden direct in de zip)
bouw "$WERK/firefox" firefox
cat > "$WERK/firefox/LEESMIJ.txt" <<TXT
Somtoday Pack Opener $VERSIE DEBUG-BUILD (Firefox)

Alleen voor de eigenaar. Niet delen, niet uploaden, niet in een release zetten.
Tijdelijk laden: about:debugging#/runtime/this-firefox, "Tijdelijke add-on laden", kies manifest.json.
TXT
ZIPF="$UIT/$NAAM-$VERSIE-debug-firefox.zip"
rm -f "$ZIPF"
(cd "$WERK/firefox" && zip -rqX "$ZIPF" .)
INHOUD="$(unzip -Z1 "$ZIPF")"
grep -qx 'manifest.json' <<<"$INHOUD" || { echo "manifest.json staat niet bovenaan in de Firefox-zip" >&2; exit 1; }
echo "$ZIPF"
