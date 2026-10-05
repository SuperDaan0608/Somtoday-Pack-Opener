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

Het volume van elk geluid in de animatie staat in `NIVEAU` bovenaan het geluidsblok van
`extension/pack.js` (in dB ten opzichte van de opname).

## Een geluid vervangen

1. Genereer een nieuwe variant met ElevenLabs en sla hem op als `geluiden/bron/<naam>.mp3`.
2. Draai `node scripts/bouw-geluiden.mjs`.
3. Laad de extensie opnieuw. Op de pagina **Geluiden beluisteren** (te openen via de popup) kun je ze
   allemaal naast elkaar horen.

Gebruik van de opnames valt onder de voorwaarden van jouw ElevenLabs-abonnement.
