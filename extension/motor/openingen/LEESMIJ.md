# Een opening bouwen

Een **opening** is het stuk van de animatie vóór de kaart: het pakje dat scheurt, een kluis die opengaat, een bal die door
pennen valt. Elke opening is één bestand in deze map (`kluis.js`, `plinko.js`, `ster.js`, `raket.js`, en `proef.js` als
kleinste voorbeeld). De opening tekent alleen het stuk tot aan het moment dat de **kaart** komt. De kaart zelf (draaien,
cijfer optellen, onthulling, titel, confetti, vuurwerk, schokgolven) is voor alle openingen gelijk en staat in `scene.js`.
Je hoeft **niets in `scene.js`, `main.js`, `gl.js`, `shaders.js` of `audio.js` aan te passen**; alles wat je nodig hebt zit in `c`
(zie onder). Mist er iets? Los het in je eigen module op.

Alle tekst die de gebruiker ziet is **Nederlands**.

## Het bestand

```js
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, VS_VOL, OBJ_GEMEEN, VS_VLAK } = SPO.shaders; // GLSL-bouwstenen, zie onder

  SPO.openingen.kluis = {
    naam: 'kluis',                          // moet gelijk zijn aan de sleutel (en aan SPO.OPENINGEN in data.js)
    shaders: { deur: { vs, fs, teken: 'vol' } },   // c.prog('deur')
    tijdlijn(d) { return { E, K0, fotos: [...] }; },
    art(d, h) { return { ...canvassen }; },        // optioneel; ook een generator (function*) met yield tussendoor
    maak(c) { /* ... */ return { teken(t, dt, inv) {}, wacht(t) {}, reset() {}, verwijder() {}, schud(t) {}, sprong(t) {} }; },
  };
})();
```

Zie `proef.js` voor een kort, werkend voorbeeld.

### `shaders`
Per programma `{ vs, fs, teken }` (GLSL ES 3.00, `KOP` bevat `#version 300 es` + precisie). Ze worden pas gecompileerd als de
opening aan de beurt is (parallel, zonder de pagina vast te zetten). `teken` zegt hoe het programma 'droog' wordt opgewarmd:
`'vol'` (standaard: één grote driehoek, `VS_VOL`), `'strip'` (vierkant van 4 punten, `drawArrays(TRIANGLE_STRIP, 0, 4)`),
`'inst'` (4 punten, geïnstantieerd), `'geen'`, of een functie `(gl, programma) => {...}`. Er zijn **geen buffers**: vertex-shaders
rekenen alles uit `gl_VertexID` / `gl_InstanceID` (zie `VS_VOL`, `VS_VLAK`, `VS_PAK`, `VS_DEELTJES` in `shaders.js`). Werkt een
programma op een videokaart niet, dan valt de hele opening terug op het pakje: houd je shaders dus simpel en strikt WebGL2
(geen lussen met niet-constante grenzen in functies met `discard`, geen extensies).

### `tijdlijn(d)`
`d` = gegevens van het cijfer: `d.g` (cijfer 1,0–10,0), `d.I` (= g/10, intensiteit), `d.tier` (0 brons < 5,5 · 1 zilver 5,5–7 ·
2 goud 7–9 · 3 speciaal 9–9,95 · 4 icoon ≥ 9,95), `d.T` (naam, kleuren), `d.vak`, `d.onder` (onderwerp), `d.weging`,
`d.snel` (snelle modus: maak alles ± 40% korter), `d.cijferTekst`, `d.fmt(x)`. Geef een object terug met minimaal:
- `E` — het hoogtepunt (seconden vanaf de start), waar de spanning ontlaadt;
- `K0` — hier begint de kaart (de kaart komt vanuit het midden van het scherm, uit de diepte, naar voren; zie hieronder);
- `fotos` — een lijstje tijden voor het contactblad van de testscripts (kies de interessante momenten);
- optioneel `staart` — hoe lang na K0 jouw `teken` nog wordt aangeroepen (standaard 0,5 s).

De motor vult zelf aan: `spin` (1,35 s; snel 0,85), `telStart = K0 + 0,85·spin`, `telDuur`, `RV` (onthulling, ± K0 + 3,6 s),
`EIND` (daarna verschijnen de knoppen). Richtlijn voor de duur: E tussen 6 en 10 s (snel: 3 tot 5 s), K0 = E + 1 tot 2 s.

### Wachten op een klik (`pauzes`)
Een opening mag de gebruiker laten klikken om verder te gaan (de Schietkraam: één klik = één schot). Geef in `tijdlijn` mee:
`pauzes: [t0, t1, …]` (stijgende tijden), optioneel `klikHint` (tekst onderin, standaard 'Klik om verder te gaan') en `pauzeAuto` (seconden;
na zoveel seconden zonder klik gaat de animatie vanzelf door, standaard 12). Zodra de klok een pauzetijd bereikt staat hij stil op die tijd (je
beeld blijft dus `teken(t_pauze)`; laat er gerust iets bewegen met `uTime`-achtige eigen klokken) tot er geklikt wordt (muis, spatie of Enter); daarna loopt hij door.
Alles blijft een pure functie van `t` (de pauzes zitten in de klok, niet in jouw beeld). Een klik tijdens de animatie tussen twee pauzes roept `sprong(t)` aan: geef
dan de volgende pauzetijd terug (of `null` als je dat niet wilt). Geen pauzes in de snelle modus (`d.snel`): die speelt vanzelf.

#### Invoer tijdens een pauze (`invoer`, Kluis kraken)
Wil je dat de gebruiker tijdens een pauze écht iets doet (draaien, slepen) in plaats van alleen te klikken, geef dan het object dat `maak` teruggeeft
een eigen `invoer`. Alle drie de methoden zijn optioneel; `main.js` roept ze alleen aan **tijdens een pauze** (dus niet bij `seek`, niet in de snelle modus):
- `invoer.aanwijzer(soort, x, y, e)`: `soort` is `'down'`, `'move'`, `'up'` of `'cancel'` (pointer events: muis, aanraking en pen; er wordt maar één
  wijzer tegelijk doorgegeven, `down` krijgt pointer capture). `x`, `y` zijn genormeerd over het canvas (0…1, y naar beneden); `e` is het
  originele event (`pointerId`, `pointerType`). Het canvas heeft `touch-action: none`. De klik die een sleepbeweging afsluit telt **niet** als 'klik om verder'
  en klikken tijdens een pauze doen bij zo'n opening niets (de opening beslist zelf, bv. dubbeltikken).
- `invoer.toets(key, e)`: toetsen tijdens de pauze (de opening gebruikt de pijltjes); geef `true` als je hem hebt gebruikt. Spatie en Enter blijven
  'overslaan' en worden niet doorgegeven.
- `invoer.klaar()`: wordt **elk beeld** tijdens de pauze na `teken` aangeroepen (hier hoort ook het geluid van een gelukte stap, nooit in `teken`).

Elke methode beëindigt de pauze door iets waars terug te geven: `true` (de klok loopt door vanaf de pauzetijd), een **getal** (de klok springt naar dat tijdstip,
dat moet groter zijn dan de pauzetijd; `c.at`-gebeurtenissen daartussen worden dan overgeslagen en horen dus bij de eigen invoerstand) of `'over'` (ook alle
volgende pauzes vervallen). Spatie, Enter, de wachttijd (`pauzeAuto`, die elke doorgegeven invoer opnieuw laat beginnen) of een klik zonder invoer-opening
doen `hervat()` zonder argument: bij een opening met `invoer` betekent dat dat **alle** volgende pauzes ook vervallen en de animatie vanzelf doorloopt.
De opening ziet dat aan de klok (`t > pauzetijd`) en neemt zonder sprong de automatische variant over. De opening mag de tekst onderin tijdens de pauze
aanpassen door `c.tl.klikHint` te veranderen (alleen bij een echte wijziging, de tekst vervaagt telkens opnieuw).
Regels: `teken(t)` blijft een pure functie van `t` plus de invoerstand; `inv.afspelen === false` (seek) betekent altijd de automatische variant.

### `art(d, h)`
Maakt extra canvassen (labels, cijfers, kleine sprites, ruis). Teken met `h.art.nieuw(breedte, hoogte)` (geeft een canvas; kleine
afmetingen aanhouden: ≤ 2048) en de lettertypes `h.art.F_SPORT` (Barlow Condensed, 600/800/900, ook italic), `h.art.F_DISPLAY`
(Unbounded), `h.art.F_TEKST` (Inter): dat zijn CSS-`font`-strings met de grootte erachter te zetten, bv.
`` ctx.font = `800 120px ${h.art.F_SPORT}` ``. De lettertypes zijn al geladen. Het resultaat komt in `c.art`. Doe het zware werk in een
generator (`function* art(d, h) { ...; yield; ...; return {...}; }`): elke `yield` geeft de browser ruimte, zodat er geen hapering komt
terwijl je met de muis boven een cijfer hangt (daar wordt dit alvast gemaakt).

### `maak(c)`
Eén keer bij het opbouwen van de scène (de WebGL-context bestaat al). Registreer hier gebeurtenissen, schokken, flitsen, golven en
deeltjesbronnen, maak teksturen en haal je programma's op. Geef een object terug:
- `teken(t, dt, inv)` — tekent de wereld voor tijd `t` in het scènedoel (al gewist; blending staat op 'optel').
  `inv.tilt = [x, y]` (−1…1, de muis), `inv.afspelen` is false bij het zoeken (`seek`), dan mogen er geen geluiden starten.
- `wacht(t)` — het rustige beeld op het startscherm (achter het venstertje "Nieuw cijfer!"), `t` loopt door.
- `reset()` — optioneel; wordt aangeroepen bij Opnieuw.
- `verwijder()` — optioneel; ruim eigen FBO's/teksturen/programma's op die je niet via `c.tekstuur` hebt gemaakt.
- `schud(t)` — optioneel; continue camerabeving (amplitude in p-ruimte, ± 0,002…0,01) bovenop de stoten van `c.schok`.
- `sprong(t)` — optioneel; waar de animatie heen springt als je klikt (overslaan): `{ doel }`, `null` (nu niet) of `undefined`
  (standaard). Standaard: vóór E−0,6 naar E−0,45; rond E niet; daarna naar RV−0,5.

## De omgeving `c`

| Wat | Betekenis |
| --- | --- |
| `c.motor`, `c.gl`, `c.d`, `c.tl`, `c.art` | motor (zie `gl.js`), WebGL2-context, cijfergegevens, tijdlijn, jouw canvassen |
| `c.I`, `c.tier`, `c.T`, `c.L` | intensiteit 0,1–1, niveau 0–4, tier-gegevens (`T.kleur`, `T.kleur2`, `T.naam`), look-waarden per niveau |
| `c.kl`, `c.kl2` | **live** tierkleuren `[r,g,b]` (bij een Icoon wisselen ze van tint door een regenboog; lees ze elk beeld opnieuw) |
| `c.regenboog`, `c.reduceer` | tier 4; gebruiker wil minder beweging (dan geen flikkering, weinig schud) |
| `c.asp`, `c.visB`, `c.H_ZICHT`, `c.lod` | beeldverhouding (live), zichtbare breedte op z = 0, zichthoogte op z = 0 (± 2,18), deeltjes-factor 0,25…1 |
| `c.at(t, fn)` | eenmalige gebeurtenis (geluid, trillen). Niet voor beeld. Wordt overgeslagen als hij > 0,6 s te laat komt |
| `c.audio` | zie Geluid |
| `c.trillen(patroon)` | telefoontrilling (`navigator.vibrate`); getal of lijst |
| `c.schok(t, amp, dec)` | camera-stoot op t (amp ± 0,01…0,06, dec = uitdoving in s) |
| `c.flits(t, sterkte, dec)` | witte flits over het hele beeld (sterkte 0,2…1, dec 0,03…0,3; korte felle pop = dec 0,025) |
| `c.golf(t, snelheid, sterkte, y)` | schokgolf-ring vanuit het midden van het scherm, `y` = hoogte t.o.v. het midden in schermhoogtes (positief = omhoog) |
| `c.e({...})` | maakt een deeltjesbron (zie Deeltjes); `c.zend(t, bron)` tekent hem |
| `c.stralen(t, alpha, pow, core, haze, cx, cy, rot, donker, kleur1, kleur2, aantal)` | lichtstralen-ster (tierkleuren als je niets opgeeft) |
| `c.licht(t, cx, cy, bundel, breed, streep, ster, rot, kleur)` | gloed met bundel, streep en kruisster |
| `c.warp(t, alpha, snelheid, gloed, kleur1, kleur2)` | de hyperspace-tunnel (geef bij een opening altijd zelf kleuren mee) |
| `c.vlak(t, tex, x, y, z, rx, ry, rz, b, h, alpha, veeg, optel, glitch, tint)` | een getextureerd vlak in de ruimte (alpha-blending) |
| `c.obj(p, x, y, z, rx, ry, rz, sx, sy, px, py)` | zet de uniforms voor een eigen programma dat `OBJ_GEMEEN` gebruikt (zie 3D) |
| `c.basis(p)` | zet `uRes`, `uShake`, `uZoom` voor een schermvullende shader |
| `c.prog(naam)` | jouw gecompileerde programma (`.gebruik()` voor je uniforms zet) |
| `c.tekstuur(canvas, {mip, herhaal})` | WebGL-tekstuur uit een canvas; wordt aan het eind automatisch opgeruimd |
| `c.post` | wensen voor de nabewerking per beeld (zie Nabewerking) |
| `c.ramp(t, a, b)`, `c.sm(t, a, b)` | lineair / vloeiend 0…1 tussen a en b; ook `c.klem`, `c.mix`, `c.glad`, `c.veer` (verende pop) |
| `c.aan(naam)` | voor foutopsporing: `scene.skip.add('opening')` zet je teken uit |

### Programma's gebruiken
```js
const p = c.prog('deur');
p.gebruik(); c.basis(p);
p.f1('uTijd', t); p.f2('uA', x, y); p.f3(…); p.f4(…); p.v3('uKleur', c.kl);
p.i1('uAantal', 3); p.f1v('uLijst[0]', Float32Array); p.tex('uTex', 0, textuur);   // 0 = tekstu­ureenheid
c.motor.mengen('optel');   // 'optel' (licht: ONE, ONE) | 'alpha' (voorgemengd: ONE, ONE_MINUS_SRC_ALPHA) | 'geen'
c.motor.volledig();        // of gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4) / drawArraysInstanced
```
Uniform-locaties worden gecachet; een uniform dat niet bestaat wordt stil genegeerd.

## Ruimte, kleur en licht
- **Schermruimte** (schermvullende shaders): `vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y; p = (p - uShake) / uZoom;`
  Zo loopt y van −0,5 tot 0,5 en x van −asp/2 tot asp/2. Gebruik de `uShake` zodat de camerabeving ook jouw beeld raakt.
- **3D-vlakken**: wereld met de camera op z = 3 (kijkt naar −z), FOV 40°, zichthoogte op z = 0 is `c.H_ZICHT` ≈ 2,18. Een eigen vertex-shader
  die `${OBJ_GEMEEN}` invoegt heeft `draai()`, `naarWereld(vec3 lokaal, mat3 R)` en `projecteer(vec3 wereld)` (zie `VS_VLAK`: een vierkant
  van 4 punten uit `gl_VertexID`, lokaal −0,5…0,5, geschaald met `uScl`, `uPivot` = het draaipunt). Zet de uniforms met
  `c.obj(p, x, y, z, rx, ry, rz, sx, sy, px, py)` (`rx, ry, rz` in radialen). De voorkant is met de klok mee getekend
  (`gl_FrontFacing` = voorkant, er wordt niet geculld).
- **HDR**: het scènedoel is een float-doel. Waarden boven 1 zijn toegestaan en geven bloom (drempel 0,62) en lensstreep. Houd doffe
  oppervlakken onder ± 0,7 en laat alleen lichtbronnen hoger gaan (2…8). De nabewerking doet een zachte tone-map (tint blijft
  behouden), vignet, korrel, chromatische afwijking en eventueel een letterbox. Geef **geen** kleur boven ± 64 (bloom wordt dan vies).
- **Blending**: `'optel'` voor licht en gloed; `'alpha'` voor ondoorzichtige of half-doorzichtige dingen met **voorgemengde alpha**
  (`o = vec4(rgb * a, a)`). Het doel heeft geen echte alpha-kanaal: gebruik alpha alleen als blendfactor.
- **Tekst op canvassen**: teken met `ctx.fillText`, gebruik de lettertypes uit `h.art`. Kleine, scherpe tekst heeft mipmaps nodig
  (standaard aan in `c.tekstuur`).

## De kaartfase (gedeeld, niet van jou)
Vanaf `K0 − 0,04` is er een flits (de motor doet die), dan draait de kaart vanuit het midden van het scherm (uit de diepte) naar voren, met lichtstralen erachter; na `RV` komt de titel, de confetti (vanaf cijfer 6) en het vuurwerk (vanaf 9).
**Eindig dus met je aandacht in het midden van het scherm en een felle, convergerende flits** op K0: de overgang moet daarin
verdwijnen. Maak je beeld zacht weg vanaf K0 tot K0 + `staart`; daarna wordt `teken` niet meer aangeroepen.

## Nabewerking: `c.post`
Zet per beeld (in `teken`; de motor zet alles eerst terug op standaard): `rad` (radiale blur 0…0,6), `zoom` (vermenigvuldigt, 1 = niets),
`roll` (rotatie, radialen), `bars` (letterbox 0…1), `bloom`, `streak` (anamorfische lensstreep, 0…1,5), `vig`, `ca`, `sat` (vermenigvuldigers,
1 = standaard) en `grade` ([r,g,b] vermenigvuldiger). Gebruik `c.flits`/`c.golf`/`c.schok` voor kortstondige klappen.

## Deeltjes
`const b = c.e({ mode, t0, life, delay, n, org: [x,y], angle, spread, spd: [min,max], grav: [x,y], drag, size: [min,max], col1, col2, regen, alpha, blend, seed, per, lod })`.
Een bron is een **pure functie van de tijd**: elk deeltje wordt op de videokaart berekend uit zijn nummer, `t0` (starttijd) en de leeftijd; er
is niets per beeld op de processor te doen en duizenden deeltjes zijn gratis. Je tekent hem met `c.zend(t, b)` in `teken` (alleen als `t` ± in
`[t0, t0 + delay + life]` ligt). Ruimte: p-ruimte (y −0,5…0,5; snelheden in p per seconde). Modes: `0` vonken (vliegen weg, vertragen, vallen,
trekken een streepje), `1` stof/bokeh (hele beeld, zacht), `2` confetti, `3` regen, `4` vuurwerk (apart), `5` snippers (vallen en draaien),
`6` rook (grote, donkere, zachte wolken). `blend` is `'optel'` of `'alpha'`; `n` wordt met `c.lod` geschaald (zet `lod: false` om dat niet te doen);
`delay` spreidt de starttijden van de deeltjes uit over zoveel seconden. Een bron met een bewegende oorsprong bestaat niet; zet voor een
**spoor** meerdere bronnen neer met oplopende `t0` en `org` langs het pad (dat kan gewoon in `maak`).

## Geluid
`c.audio.speel(naam, { gain, rate, offset, duur, fadeIn, fadeOut, galmen, pan, delay })` speelt een opname (geeft `{ stop(fade) }` terug, of `null` als
hij niet geladen is). `rate` verandert snelheid én toonhoogte (0,5…2), `galmen` 0…0,5 stuurt naar de galm, `pan` −1…1. Gewone geluiden uit
`audio.js`: `whoosh(vol)`, `zwiep(vol, rate)`, `riser(duur, vol)` (de opbouw piekt precies na `duur` s), `scheur(vol)`, `boem(vol, rate)`, `hartslag(vol)`,
`stap(vol, pan)`, `tik(voortgang 0…1)`, `sluiter()`, `vuurwerk()`, `knop()`. Eigen opnames per opening (ElevenLabs, zie `geluiden/README.md`):
`kluis-klik`, `kluis-slot`, `kluis-wiel`, `kluis-deur` · `plinko-tok`, `plinko-vak`, `plinko-bel` · `ster-vlucht`, `ster-inslag`, `ster-nacht` ·
`raket-piep`, `raket-start`, `raket-motor`, `raket-trap`, `raket-knal`. Het volume per opname staat in `NIVEAU` (audio.js); `gain` is relatief.
Start geluiden **altijd via `c.at(t, …)`**, nooit in `teken`. Lukt een geluid niet (nog niet gegenereerd), dan gebeurt er niets: de animatie
moet ook zonder geluid af zijn. De kaartfase heeft haar eigen geluiden (boem, onthulling, tellen, gejuich, vuurwerk): niet dubbel doen.

## Regels (belangrijk)
1. **Het beeld is een pure functie van `t`.** Geen toestand die van beeld naar beeld wordt bijgehouden; `seek(t)` moet precies hetzelfde beeld geven
   als afspelen, ook als je terug- of vooruitspringt. Wil je een lopende simulatie (bal, deeltjes), reken hem **één keer in `maak`** uit in een tabel
   en lees er per beeld uit (interpoleren).
2. **Geen verrassingen vooraf (spoiler-hygiëne).** Het niveau en het cijfer mogen pas zichtbaar zijn op het moment dat jouw concept dat bedoelt
   (bv. de kleur van de ster, de hoogte van de raket, het vak waar de bal landt). Gebruik tot dan koele, neutrale kleuren (blauwwit, staal) en geen
   `c.kl`/`c.kl2`/`T.kleur`. Duur en tempo mogen een beetje met `I` meegroeien, maar het geheel moet bij elk cijfer spannend zijn.
3. **Geen haperingen.** Per beeld mag jouw JS-deel ≤ ± 1 ms zijn en **mag niets nieuw worden aangemaakt** (geen arrays, objecten, strings, closures in
   `teken`: maak ze één keer in `maak`). Fragment-shaders: liever vijftig simpele bewerkingen dan een raymarcher; lussen ≤ ~24 stappen; geen
   dynamische indexering van grote arrays in lussen per pixel; kijk naar `c.motor.kwaliteit` (0 = best … 3 = zuinigst) en `c.lod` om
   stappen/deeltjes te verminderen als de computer het moeilijk heeft (de motor zet zelf het beeld kleiner als dat nodig is). Teksturen die je gebruikt zijn
   al klaar voor de eerste seconde; upload nooit tijdens het afspelen (geen `texImage2D` per beeld, behalve voor iets heel kleins).
4. **Werkt rechtop op een telefoon** (`c.asp` < 1, bv. 390×844) en op 21:9. Bepaal posities uit `c.visB`/`c.H_ZICHT`, niet uit vaste getallen.
5. **Reduceer** (`c.reduceer`): geen flikkering of hevige schokken; `c.schok`/`c.flits` worden al gedempt.
6. **Alle vijf de niveaus** moeten er bij het hoogtepunt duidelijk anders uitzien (kleur, aantal, heftigheid, extra effecten), en een 10 (Icoon, regenboog)
   moet echt een feest zijn. Een brons (< 5,5) mag zuinig zijn, maar niet saai of beledigend.
7. Alles wat je tekent moet er **mooi** uitzien in stilstand, niet alleen in beweging: contactbladen worden beoordeeld op losse beelden.
8. `snel` (`d.snel`) is een kortere versie, geen andere animatie.

## Testen
Server (in een eigen poort, vanuit de map `extension`): `npx http-server -p 82xx -s -c-1 .`. Daarna, met `NODE_PATH=$(npm root -g)`:

```
node tools/opening-test/blad.js uit.png 8.4 Wiskunde 960 540 false kluis 82xx     # contactblad (tl.fotos + de kaartfase)
node tools/opening-test/shoot.js uitmap 8.4 Wiskunde 3.0,5.5,8.2 1280 720 false kluis 82xx    # losse beelden op volle grootte
OPENING=kluis POORT=82xx node tools/opening-test/perf.js 8.4 960 540                  # tijd per beeld (software-rendering: alleen de verhoudingen tellen)
```
Open `…/stage.html?opening=kluis&vak=Wiskunde&cijfer=8.4&onderwerp=Test&weging=2&direct=true&stil=true&debug=1` zelf voor `window.__somPackDebug`:
`seek(t, tiltX, tiltY)`, `tl`, `scene.skip` (Set met laagnamen om uit te zetten, bv. `'opening'`), `status()`, `motor.fouten` (shader-fouten). Controleer
`motor.gl.getError() === 0` na `seek`. Test minstens de cijfers 4,2 · 6,1 · 7,5 · 9,3 · 10, de snelle modus (`snel=true`), 390×844, 1280×720 en 1920×1080.
