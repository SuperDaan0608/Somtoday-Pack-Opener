# Somtoday Pack Opener

Open je Somtoday-cijfers als een FIFA-pakket. Een nieuw cijfer staat afgedekt in je cijferlijst; klik erop en
je cijfer komt binnen met een tunnel van licht, een 3D-pakje dat openscheurt, een walkout in een stadion (vanaf een 7)
en je eigen kaart voor dat vak.

> Fanproject. Niet verbonden aan Somtoday of Topicus.

## Wat zit erin

- **Echt gekoppeld aan je cijfers.** Op `leerling.somtoday.nl` worden cijfers die je nog niet hebt geopend
  afgedekt. Klik je erop, dan start het pakket met je echte vak, cijfer, onderwerp en weging.
- **Vijf niveaus**, net als bij FIFA: Brons (onder de 5,5), Zilver, Goud (walkout vanaf een 7),
  Speciaal (9+) en Icoon (een 10). Hoe hoger het cijfer, hoe heftiger alles wordt.
- **Filmische animatie op de videokaart (WebGL):** hyperspace-tunnel, een glanzend 3D-pakje dat oplaadt en echt
  openscheurt, lichtbundels, schokgolven, bloom, confetti en vuurwerk. Elk niveau heeft een eigen uitstraling.
- **Walkout** (vanaf een 7): de leerling loopt door de lichtbundel een stadion in, met fotografen, een hartslag en
  plaatjes voor vak, onderwerp en weging, in letterbalk-beeld.
- **Vijf manieren om te openen:** het **pakje**, **kluis kraken**, **Plinko**, een **wensster** en een **raket**. Kies er een in
  de popup of laat je verrassen. De kaart en de onthulling zijn bij allemaal hetzelfde.
- **Eigen kaart** in sportletters, met een pictogram per vak, je cijfer, weging, onderwerp en zes stats
  (INZ, FOC, KEN, TMP, TEC, MOT). De kaart draait uit het licht, het cijfer telt op en daarna glanst de folie mee
  met je muis.
- **Geen haperingen:** alles wordt vooraf klaargezet (zodra je met de muis boven een afgedekt cijfer komt), er is
  geen zware blur boven de animatie, en de kwaliteit past zich vanzelf aan als je computer moeite heeft.
- **Echte geluiden**, gemaakt met ElevenLabs: scheurend folie, een stadion vol publiek, een fanfare, een
  treurige trombone voor een onvoldoende. Alles staat in de extensie, er wordt niets gedownload.
- **Opslaan als afbeelding**, zodat je de kaart kunt delen.
- **Popup** met je aantal ongeopende cijfers, instellingen en een handmatige modus om een eigen cijfer te proberen.
- **Snelle modus** voor als je niet op de tunnel wilt wachten. Klikken of spatie slaat ook over (eerst naar het
  scheuren, dan naar de kaart).

## Installeren

1. Download `somtoday-pack-opener-v0.4-beta.zip` bij de [releases](../../releases) (of uit de map
   [`downloads`](downloads)) en pak hem uit.
2. Ga in Chrome (of Edge, Brave, Opera) naar `chrome://extensions`.
3. Zet rechtsboven **Ontwikkelaarsmodus** aan.
4. Klik **Uitgepakte extensie laden** en kies de uitgepakte map `somtoday-pack-opener`.
5. Pin de extensie en ga naar [leerling.somtoday.nl](https://leerling.somtoday.nl/cijfers).

Chrome vraagt bij de installatie toestemming om je gegevens op `leerling.somtoday.nl` te lezen en te
wijzigen. Dat is nodig om de cijfers af te dekken.

Heb je Somtoday al open staan tijdens het installeren? Ververs de pagina één keer.

## Zo werkt het op Somtoday

- Op **Cijfers → Laatste cijfers** staat elk nieuw cijfer afgedekt, met de naam van het vak en een knop
  **Open pakket**. Het cijfer zelf is onzichtbaar (ook voor schermlezers) tot je het opent.
- Klik op de rij (of druk op Enter) en het pakket opent meteen. Zodra je cijfer onthuld wordt, onthoudt de
  extensie dat het geopend is. Sluit je de animatie eerder af, dan blijft het cijfer afgedekt.
- In de popup zie je hoeveel cijfers er nog klaar staan. Daar kun je ook **Alles als geopend markeren**
  (bijvoorbeeld voor oude cijfers) of **Alles weer afdekken**.
- Een cijfer als `V` of `G` laat de extensie met rust.

**Let op:** alleen de lijst *Laatste cijfers* wordt afgedekt. In *Vakgemiddelden* en *Cijferoverzicht* blijven
cijfers gewoon zichtbaar.

### Privacy

Alles gebeurt in je eigen browser. De extensie leest de cijfers alleen op de pagina en verstuurt niets.
Om te onthouden wat je al hebt geopend, slaat ze een korte hash op (geen vak, geen cijfer).

## Bediening

| Toets | Wat het doet |
| --- | --- |
| Klik of Enter op een afgedekt cijfer | Pakket openen |
| Spatie / Enter / klik tijdens de animatie | Overslaan |
| Esc | Sluiten |
| `Alt+Shift+P` | Popup openen |

## Ontwikkelen

De extensie staat in [`extension/`](extension). Er is geen build-stap: wijzig de bestanden en klik op het
herlaad-icoon bij de extensie in `chrome://extensions`.

| Bestand | Inhoud |
| --- | --- |
| `manifest.json` | Manifest V3 |
| `content.js` / `content.css` | De koppeling met Somtoday: cijfers lezen, afdekken, onthouden |
| `motor/main.js` | De overlay (shadow DOM), de hoofdlus, bediening en het opwarmen |
| `motor/scene.js` | De regie: tijdlijn, camera, schokken, deeltjes, de gedeelde kaartonthulling en het pakje |
| `motor/openingen/` | Eén bestand per opening (kluis, plinko, ster, raket); zie `LEESMIJ.md` om een eigen opening te maken |
| `motor/shaders.js` / `motor/gl.js` | De GLSL-shaders en de kleine WebGL2-laag (bloom, nabewerking) |
| `motor/art.js` | De getekende afbeeldingen: pakje, kaart (drie lagen), plaatjes, titel, pictogrammen per vak |
| `motor/audio.js` / `motor/data.js` | De geluiden (Web Audio) en de gegevens van één pakket |
| `popup.html` / `popup.css` / `popup.js` | De popup |
| `stage.html` / `stage.js` | Reservepagina voor tabbladen waar injecteren niet mag |
| `geluiden.html` | Alle geluiden naast elkaar beluisteren |
| `sounds/` | De bewerkte geluiden (zie [`geluiden/`](geluiden)) |

Je kunt de animatie ook zonder Somtoday testen door `extension/stage.html` te openen met parameters,
bijvoorbeeld `stage.html?vak=Wiskunde&cijfer=8.3&onderwerp=H4&weging=2`.

### De geluiden aanpassen

Zie [`geluiden/README.md`](geluiden/README.md) voor de prompts, het vervangen van een geluid en hoe het
bouwscript werkt.

### Een release maken

```sh
./scripts/package.sh v0.4-beta      # maakt dist/somtoday-pack-opener-v0.4-beta.zip
git tag v0.4-beta && git push origin v0.4-beta
```

Bij een nieuwe tag die met `v` begint, bouwt GitHub Actions de zip en zet hij een release online.
Tags met `beta`, `alpha` of `rc` worden een pre-release.

## Credits

- Geluiden: [ElevenLabs Sound Effects](https://elevenlabs.io/sound-effects).
- Lettertypes: [Barlow Condensed](https://github.com/jpt/barlow), [Unbounded](https://github.com/googlefonts/unbounded) en
  [Inter](https://github.com/rsms/inter), alle onder de SIL Open Font License (zie `extension/fonts`).
