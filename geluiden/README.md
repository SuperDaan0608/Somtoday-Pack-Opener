# Geluiden

Alle geluiden van de pack opening zijn echte opnames, gemaakt met **ElevenLabs Sound Effects v2**
(`eleven_text_to_sound_v2`). Ze zijn niet zelf gesynthetiseerd.

- `bron/` bevat de ruwe opnames zoals ze uit ElevenLabs kwamen (de gekozen variant per geluid).
- `../extension/sounds/` bevat de bewerkte versies die de extensie gebruikt.
- `../scripts/bouw-geluiden.mjs` maakt het tweede uit het eerste: inkorten, in- en uitfaden, op gelijke
  piek brengen. Draai `node scripts/bouw-geluiden.mjs` na het vervangen van een bronbestand.

De boem, hartslag en voetstap zijn van nature bijna alleen diepe bastonen. Die geven laptopspeakers en
gewone oordopjes niet weer, dus het script voegt er harmonischen aan toe (zodat je ze ook zonder
subwoofer hoort).

## Overzicht

| Bestand | Prompt (Engels, zoals die naar ElevenLabs ging) | Lengte | Wordt gebruikt voor |
| --- | --- | --- | --- |
| `whoosh` | Fast whoosh of air sweeping past the listener, smooth and airy, rising in pitch | 1,5 s | Tunnel: vak, onderwerp en pakje vliegen op je af |
| `riser` | Tension riser, swell of noise and synth climbing steadily in pitch and volume, ends abruptly at the peak | 3 s | Het pakje schudt, de spanning loopt op |
| `tear` | Foil trading card pack being ripped open, sharp tearing and crinkling foil | 1,2 s | Het pakje scheurt open |
| `boem` | Massive deep bass impact boom, sub bass thump with a long fading reverb tail | 2,5 s | Klap bij het scheuren en bij de onthulling |
| `hartslag` | Single deep heartbeat thump, lub-dub, muffled and bass heavy | 1 s | Walkout: hartslag die luider wordt |
| `stap` | One heavy footstep on concrete in a big echoing tunnel, deep thud | 1 s | Walkout: zware voetstappen |
| `menigte` | Stadium crowd murmuring and chanting, swelling louder with excitement | 6 s | Walkout: publiek in het stadion |
| `sluiter` | Single camera shutter click | 0,5 s | Walkout: fotografen |
| `tik` | Single short crisp mechanical click, like a rotary counter tick | 0,5 s | Het cijfer telt op (steeds hoger) |
| `brons` | Sad trombone playing wah wah wah waaah, comedic fail sound | 3 s | Onthulling onder de 5,5 |
| `zilver` | Bright pleasant success chime, two quick rising bell notes with a sparkle tail | 2 s | Onthulling 5,5 tot 7 |
| `goud` | Short triumphant brass fanfare with bright trumpets | 3 s | Onthulling 7 tot 9 |
| `speciaal` | Epic orchestral hit with a cymbal crash and shimmering rising strings | 4 s | Onthulling 9 tot 10 |
| `icoon` | Grand heroic orchestral finale with choir swell, cymbal crash and sparkling bells | 5 s | Onthulling van een 10 |
| `gejuich` | Huge stadium crowd erupting into loud cheering and applause | 4 s | Publiek juicht bij een 6 of hoger |
| `vuurwerk` | Single firework exploding with a deep thump followed by crackling sparkles | 2 s | Vuurwerk bij een 9 of hoger |
| `klik` | Soft modern interface button click, short clean pop | 0,5 s | Knoppen |
| `kluis-klik` | Single crisp tick of a steel safe combination dial turning, tiny precise mechanical click | 0,5 s | Kluis kraken: elke tik van het draaiende cijferslot (de toonhoogte wisselt) |
| `kluis-slot` | Heavy steel vault lock bolt sliding into place with a deep metallic clunk and a short ring | 1,2 s | Kluis kraken: een cijfer van de code valt op slot |
| `kluis-wiel` | Heavy vault door handle wheel spinning, metal spokes turning with a ratcheting mechanical grind and thick steel bolts retracting with clanks | 2,5 s | Kluis kraken: het zware draaiwiel van de deur |
| `kluis-deur` | Massive steel bank vault door slowly swinging open with a deep groaning creak, heavy hinges and a hiss of air pressure releasing | 4 s | Kluis kraken: de kluisdeur zwaait open |
| `plinko-tok` | One single short sharp tok, a hard plastic ball striking a plastic peg, bright dry woody click with a tiny high ping, loud, close-up, completely dry | 0,5 s | Plinko: de bal tikt tegen een pin (steeds hoger) |
| `plinko-vak` | Ball dropping into a wooden slot with a hollow clack and a short settling rattle | 1,2 s | Plinko: de bal valt in een vak |
| `plinko-bel` | Bright cheerful arcade win bell, one clear ding with a sparkling tail | 2 s | Plinko: de winbel |
| `ster-vlucht` | A shooting star streaking across the night sky, shimmering magical whoosh with glittering chimes trailing behind, rising in pitch | 3,5 s | Wensster: de ster schiet over de nachthemel |
| `ster-inslag` | Magical star impact, crystalline boom followed by an expanding shimmer of glassy chimes and sparkles | 3,5 s | Wensster: de ster slaat in |
| `ster-nacht` | Calm ethereal night ambience, soft celestial pad with distant faint sparkles, mysterious and wondrous, no melody | 6 s | Wensster: rustige nachtachtergrond (zacht in en uit) |
| `raket-piep` | Single short clean electronic countdown beep, mission control tone | 0,5 s | Raket: het aftellen, één piep per tel |
| `raket-start` | Rocket engine ignition, a violent whoosh of fire and rumble igniting and building into a powerful roar | 4 s | Raket: de motor ontsteekt |
| `raket-motor` | Continuous rocket engine thrust, deep roaring rumble with crackling fire, steady and powerful | 5 s | Raket: aanhoudende stuwkracht (wordt herhaald) |
| `raket-trap` | Rocket stage separation, metallic clunk with a pneumatic pop and a hiss | 1,2 s | Raket: een trap schiet los |
| `raket-knal` | Sonic boom crack as a rocket breaks the sound barrier, sharp thunderclap with an air shockwave | 1,5 s | Raket: de knal bij het doorbreken van de geluidsbarrière |
| `schiet-knal` | Cartoon toy pistol shot, a punchy bang with a short comedic pop and a quick tail, arcade game style | 0,5 s | Schietkraam: het pistool schiet een cijfertegel af |
| `schiet-scherf` | A colorful glass tile shattering into pieces with a bright crunchy crash, cartoon arcade game sound | 0,9 s | Schietkraam: de tegel spat uiteen |
| `schiet-spin` | Revolver cylinder spinning and clicking into place, quick ratchet click, toy-like | 0,6 s | Schietkraam: de trommel draait |
| `schiet-laatste` | Short triumphant arcade sting, bright rising chime with a sparkling whoosh, last survivor wins | 1,3 s | Schietkraam: de laatste overlevende wint |
| `dans-beat` | Upbeat funky disco dance groove at exactly 120 BPM, punchy kick on every beat, offbeat hi-hats, slap bass and a bright synth stab, instrumental, no vocals, steady and loopable | 12 s | Dansje: de beat onder de dans (120 BPM, kick op 0,5 s, 1,0 s, ...) |
| `dans-scratch` | DJ vinyl record scratch, a quick comedic wicka-wicka then a sudden stop | 0,4 s | Dansje: de plaat schrapt vlak voor de dab |
| `dans-dab` | Short triumphant dance-floor sting: a big drum hit with a crowd cheering 'whoo' and a bright synth chord, party celebration | 1,4 s | Dansje: de dab |

Het volume van elk geluid in de animatie staat in `NIVEAU` bovenaan `extension/motor/audio.js`
(in dB ten opzichte van de opname).

## Nieuwe openingen

Naast het gewone pakje heeft de extensie vier andere openingen: **Kluis kraken**, **Plinko**, **Wensster** en
**Raket**. Hun vijftien geluiden (de rijen vanaf `kluis-klik` hierboven) zijn op dezelfde manier gemaakt: Sound
Effects v2, één opname per geluid, in een eigen ElevenLabs-flow ("Somtoday Pack Opener — nieuwe openingen"). De
extensie haalt ze pas op als die opening aan de beurt is (`GROEPEN` in `extension/motor/audio.js`).

Wat het script met deze opnames anders doet dan met de eerste zeventien:

- **Alleen het stukje dat telt.** De tikjes en pieptonen die vaak klinken (`kluis-klik`, `plinko-tok`, `raket-piep`)
  zijn tot één korte tik of piep ingekort. `plinko-vak` begint pas bij de klak (de opname opent met een zwakke bons en
  0,2 s stilte), en bij alle geluiden is de stille staart eraf.
- **`raket-piep`**: de opname bevatte drie pieptonen achter elkaar. De derde (de langste) is eruit geknipt als één piep.
- **`plinko-tok`** is een tweede poging. De eerste opname ("Small hard rubber ball bouncing off a plastic peg, one short
  bright tok with a tiny ping") was bijna stil en bestond uit drie doffe bonzen. Met de prompt uit de tabel kwam er één
  scherpe tok uit.
- **Bijna geen bastrucs.** Anders dan de boem, hartslag en voetstap hebben deze opnames genoeg hoorbaar geluid boven
  200 Hz, en de `bas()`-keten maakte dat hoorbare deel bij dezelfde piek juist zachter. Alleen `raket-start` en
  `raket-motor`, die vooral uit laag gebrul bestaan, gaan door een eigen keten (`rommel()` in het script). Daarin gaat de
  toon onder 100 Hz eruit (die geeft een laptop toch niet weer en neemt alleen de piek in beslag) en wordt het laagste
  stuk verzadigd tot tonen boven 200 Hz die je wel hoort. Het resultaat is ongeveer 3 dB meer hoorbaar geluid.
- **`raket-motor`** is precies 5 s lang met maar een korte in- en uitfade (0,15 en 0,4 s), omdat de app hem herhaalt en
  laat overlopen. **`ster-nacht`** is een zacht bed dat rustig in en uit fadet.
- De piek van deze geluiden is nauwkeuriger ingesteld dan bij de eerste zeventien: het script meet nu met 12 dB marge
  (anders kapt de meting bij 0 dB af) en maakt mono met een echt gemiddelde (de standaardomzetting van ffmpeg klinkt 3 dB
  harder dan gemeten).

## Schietkraam

Vier extra geluiden (`schiet-knal`, `schiet-scherf`, `schiet-spin`, `schiet-laatste`), op dezelfde manier gemaakt in
dezelfde ElevenLabs-flow. Het script knipt alleen het stukje dat telt: de knal is 0,5 s (de opname heeft na 0,56 s nog
een zwakke tweede plof die eraf is), de scherf 0,9 s, de trommel begint na 0,055 s (stilte ervoor) en de laatste stinger
is 1,3 s.

## Dansje

Drie geluiden (`dans-beat`, `dans-scratch`, `dans-dab`) in dezelfde ElevenLabs-flow. De beat staat op 120 BPM (gemeten: een kick om de 0,5 s) en krijgt alleen een korte in- en uitfade. De scratch is 0,42 s (het wicka-wicka duurt 0,35 s, daarna is het stil) en de dab 1,4 s (na 1,26 s is het stil).

## Een geluid vervangen

1. Genereer een nieuwe variant met ElevenLabs en sla hem op als `geluiden/bron/<naam>.mp3`.
2. Draai `node scripts/bouw-geluiden.mjs`.
3. Laad de extensie opnieuw. Op de pagina **Geluiden beluisteren** (te openen via de popup) kun je ze
   allemaal naast elkaar horen.

Gebruik van de opnames valt onder de voorwaarden van jouw ElevenLabs-abonnement.
