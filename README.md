# Somtoday Pack Opener

Open je cijfer als een FIFA-pakket. Vul je vak, cijfer en onderwerp in, en je cijfer komt binnen met
een tunnel, een pakje dat openscheurt, een walkout (vanaf een 7) en je eigen kaart voor dat vak.

> Fanproject. Niet verbonden aan Somtoday of Topicus.

## Wat zit erin

- **Vijf niveaus**, net als bij FIFA: Brons (onder de 5,5), Zilver, Goud (walkout vanaf een 7),
  Speciaal (9+) en Icoon (een 10). Hoe hoger het cijfer, hoe heftiger alles wordt.
- **Walkout** met spots, fotografen, een hartslag en de info-plaatjes: vak, onderwerp en weging.
- **Eigen kaart** met je cijfer, vakafkorting, embleem, weging, onderwerp en zes stats
  (INZ, FOC, KEN, TMP, TEC, MOT).
- **Opslaan als afbeelding**, zodat je de kaart kunt delen.
- **Geluid**, volledig gegenereerd in de browser, met een treurige trombone voor een onvoldoende.
- **Popup** met live voorbeeld van je kaart, weging, recente pakketten en je (gewogen) gemiddelde.
- **Snelle modus** voor als je niet op de tunnel wilt wachten. Klikken of spatie slaat ook over.
- Werkt op elke pagina. Op pagina's waar extensies niets mogen (zoals `chrome://`) opent het
  pakket in een eigen tabblad.

## Installeren

1. Download `somtoday-pack-opener-v0.1-beta.zip` bij de [releases](../../releases) en pak hem uit.
2. Ga in Chrome (of Edge, Brave, Opera) naar `chrome://extensions`.
3. Zet rechtsboven **Ontwikkelaarsmodus** aan.
4. Klik **Uitgepakte extensie laden** en kies de uitgepakte map `somtoday-pack-opener`.
5. Pin de extensie, open bijvoorbeeld somtoday.nl en klik op het icoon (of druk op `Alt+Shift+P`).

## Bediening

| Toets | Wat het doet |
| --- | --- |
| Spatie / Enter | Pakket openen, of de animatie overslaan |
| Klik | Hetzelfde als spatie |
| Esc | Sluiten |

## Ontwikkelen

De extensie staat in [`extension/`](extension). Er is geen build-stap: wijzig de bestanden en klik
op het herlaad-icoon bij de extensie in `chrome://extensions`.

| Bestand | Inhoud |
| --- | --- |
| `manifest.json` | Manifest V3 |
| `popup.html` / `popup.css` / `popup.js` | Het invulscherm |
| `pack.js` | De volledige animatie (canvas in een shadow DOM, zodat de pagina er niets van merkt) |
| `stage.html` / `stage.js` | Reservepagina voor tabbladen waar injecteren niet mag |

Je kunt de animatie ook zonder extensie testen door `extension/stage.html` te openen met
parameters, bijvoorbeeld `stage.html?vak=Wiskunde&cijfer=8.3&onderwerp=H4&weging=2`.

### Een release maken

```sh
./scripts/package.sh v0.1-beta      # maakt dist/somtoday-pack-opener-v0.1-beta.zip
git tag v0.1-beta && git push origin v0.1-beta
```

Bij een nieuwe tag die met `v` begint, bouwt GitHub Actions de zip en zet hij een release online.
Tags met `beta`, `alpha` of `rc` worden een pre-release.

## Credits

- Lettertypes: [Unbounded](https://github.com/googlefonts/unbounded) en
  [Inter](https://github.com/rsms/inter), beide onder de SIL Open Font License (zie `extension/fonts`).
