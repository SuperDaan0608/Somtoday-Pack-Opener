# Wijzigingen

## v1.2.0

- **Zeldzame kaarten:** één op de tien kaarten is zeldzaam, bij elke opening en bij elk cijfer: een regenboogrand en een label op de kaart, extra licht en glans, vuurwerk en confetti (ook bij een onvoldoende), een glinstering als de kaart verschijnt en een fanfare bij de onthulling. In de galerij herken je ze aan hetzelfde label. Uit te zetten in de popup (*Zeldzame kaarten*); bij *Handmatig proberen* kun je er zelf een uitproberen.
- **Halloween-pakje:** van 1 oktober tot en met 2 november krijgt het pakje een spookachtig uiterlijk (paarse folie, vleermuizen, spinnenweb en een gloeiende pompoen) en eigen geluiden: kraken tijdens het opladen, een donderslag bij het scheuren, een huilend geluid in de verte en een kerkklok bij de onthulling. Uit te zetten in de popup (*Seizoensthema's*). De vier nieuwe geluiden zijn gesynthetiseerd, geen opnames.
- **Gemiddelden ook afdekken:** zolang je een nieuw cijfer nog niet hebt geopend, worden *Vakgemiddelden* en *Cijferoverzicht* vervangen door een melding, want daar zie je je cijfer of gemiddelde al. *Naar mijn nieuwe cijfers* brengt je terug naar de lijst, *Toch tonen* laat het overzicht alsnog zien. Uit te zetten in de popup.
- **Cijfercalculator:** wat moet je halen voor een bepaald gemiddelde, met de weging van de volgende toets. Je kunt uitgaan van je galerij of zelf je gemiddelde en weging invullen.
- **Vrienden: reacties.** Reageer met een emoji op kaarten die een vriend met je deelt; je vriend ziet wie wat zei.
- **Vrienden: Voorspel mijn cijfer.** Laat vrienden je cijfer raden voordat je het opent. Zij zien alleen vak en onderwerp (niet het cijfer). Het cijfer verlaat je computer pas als je zelf *Toon uitslag aan vrienden* kiest; zolang de ronde loopt wordt ook de kaart van dat cijfer niet met die vrienden gedeeld. Alles blijft versleuteld.
- **Vriendenserver:** een kleine fout in het opruimen van de limieten is hersteld (`server/api.php`). Je hoeft `api.php` niet opnieuw te uploaden om de extensie te gebruiken, maar het mag.

## v1.1.0

- **Delen:** een knop *Delen* op het eindscherm maakt een plaatje van je kaart (met je naam, als Somtoday die laat zien) en opent op een telefoon het deelmenu.
- **Je naam op de kaart:** de naam wordt van de Somtoday-pagina gelezen en alleen op de kaart en het deelplaatje gezet. Hij wordt nergens opgeslagen, ook niet in de galerij.
- **Vakkaarten** in de galerij: één kaart per vak op basis van je gewogen gemiddelde, met een melding als hij een niveau omhoog gaat.
- **Kaart ontwerpen:** negen kleurthema's en vier randen, met een voorbeeld van je echte kaart.
- **Vrienden (opt-in):** voeg vrienden toe met een vriendcode en kies per vriend wat ze van je cijfers zien. Alles wordt op je eigen computer versleuteld; de server ziet alleen onleesbare data. De functie doet niets tot je haar zelf aanzet.

## v1.0.1

- **Lage grafische kwaliteit:** nieuwe schakelaar in de popup. De animatie start meteen in de zuinigste stand (kleiner beeld, minder deeltjes en effecten), handig op een trage computer of laptop zonder aparte videokaart.

## v1.0

De eerste officiële versie. Alles uit de bèta's, afgerond:

- **Zeven manieren om je cijfer te openen:** Pakje, Kluis kraken, Plinko, Wensster, Raket, Schietkraam en Dansje, plus "Verras me". Kies in de popup.
- **Galerij** met al je geopende kaarten, alleen lokaal in je browser.
- **Afdekken** van nieuwe cijfers in "Laatste cijfers" op Somtoday, met onthouden wat je al hebt geopend.
- **Geen haperingen:** de animatie draait op de videokaart, wordt vooraf klaargezet en schakelt vanzelf een stapje lager als je computer moeite heeft. Werkt een opening niet op jouw videokaart, dan valt hij terug op het pakje.
- 41 geluiden, waaronder alle nieuwe opnames voor de openingen.

Fanproject, niet verbonden aan Somtoday of Topicus.

## v0.5-beta

- **Galerij:** een pagina met al je geopende kaarten (popup → Mijn galerij). Met aantal kaarten, gemiddelde, beste kaart, een balk per niveau, filters en sorteren, en een detailweergave met downloaden en verwijderen. Je vak, cijfer en kaartplaatje blijven alleen in je eigen browser; zet "Galerij bijhouden" in de popup uit om het niet te bewaren.
- **Schietkraam** (idee van een vriend): een raster met willekeurige cijfers waar jouw echte cijfer tussen zit. Elke klik schiet er één weg met een cartoon-pistool, tot er één overblijft: dat is jouw cijfer.
- **Dansje:** een poppetje danst op een discovloer. Hoe beter het dansje, hoe hoger je cijfer, en hij eindigt met een dab.
- 7 nieuwe geluiden, en de animatie kan nu wachten op een klik (voor de Schietkraam).

## v0.4.1-beta

- **Raket:** lichter (minder zware effecten, gebakken wolken en sterren), een veel langere aftelling en vlucht met meldingen langs de weg, en een grote **live cijferteller** die met de hoogte meestijgt tot je echte cijfer (rood onder de 5,5, groen erboven).
- **Plinko:** een hele arcadekast met knipperende lampjes, lichtstrips, bumperringen, een invoer met tandwielen, een nieuwe camera en een **live scoreteller**.

## v0.4-beta

Meer manieren om je cijfer te openen. Naast het pakje zijn er vier nieuwe openingen. Kies er één in de popup, of kies **Verras me**:

- **Kluis kraken:** een enorme kluisdeur met een draaiknop die klikt, lampjes, een handwiel en bouten. Door de naad lekt licht (in de kleur van je niveau), de deur zwaait open en de kaart komt uit het licht.
- **Plinko:** een neonbord waar een chromen bal door de pennen valt. In welk vak hij landt is je cijfer, en waar in het vak hij blijft laat de decimalen zien.
- **Wensster:** een nachthemel boven een meer. De kleur van de vallende ster verraadt je niveau; de inslag op het water brengt je kaart.
- **Raket:** aftellen en lanceren. Hoe hoog de raket komt is je cijfer (met een streepje bij de 5,5), en op het hoogste punt opent de capsule.
- 15 nieuwe geluiden (ElevenLabs), en een eigen startscherm per opening.
- Onder de motorkap: elke opening is een eigen module in `motor/openingen/` (handleiding: `LEESMIJ.md`); de kaartonthulling is voor alle openingen gelijk. Werkt een opening niet op jouw videokaart, dan valt de animatie vanzelf terug op het pakje.

## v0.3.1-beta

Verfijning van de onthulling.

- **Rustiger eindbeeld:** na de onthulling dimmen de lichtstralen, de bloom en de streep-effecten zachtjes weg en
  wordt de rand donkerder, zodat de kaart het hoofdonderwerp is en niet meer wegvalt in het licht.
- **Grotere kaart** met meer diepte: donkerder naar de randen, rijkere gouden tinten en een lichtvlek die met je
  muis meebeweegt. De titel staat niet meer over de kaart heen.
- **Confetti** in de kleuren van het niveau (met wit en een accent) in plaats van een regenboog, en minder
  stukjes die het cijfer bedekken.
- **De leerling in de walkout** is slanker (geen capuchon-cape meer) met tegenlicht langs de randen.

## v0.3-beta

De animatie is volledig opnieuw gebouwd, en veel mooier en soepeler.

- **Nieuwe animatiemotor op de videokaart (WebGL2).** Een hyperspace-tunnel waar vak en onderwerp doorheen vliegen,
  een glanzend 3D-pakje met folie-reflecties dat oplaadt (licht lekt uit de naad, het trilt en zwelt op), echt
  openscheurt in twee helften, en daarna lichtbundels, lensstreep, schokgolven, vonken, snippers, bloom en
  camera-schud.
- **Walkout in een stadion** (vanaf een 7): de leerling loopt door de lichtbundel naar je toe, met flitsende
  camera's, een gladde vloer met reflectie, letterbalk-beeld en plaatjes die inschuiven voor vak, onderwerp en
  weging. Voetstappen en hartslag lopen precies synchroon met het lopen.
- **Nieuwe kaart:** sportletters (Barlow Condensed), een pictogram per vak, drie lagen met diepte, metaalkorrel,
  holo-folie en glinstering die met de kijkhoek meebeweegt. De kaart draait uit het licht, het cijfer telt op
  met een ‘pop’ bij elke stap, en na de onthulling volgt de kaart je muis.
- **Elk niveau voelt anders:** Brons is dof en bruin met regen en rook, Zilver koel en helder, Goud warm met een
  grote walkout, Speciaal elektrisch blauw met vuurwerk, en Icoon een regenboog van licht.
- **Geen haperingen meer:** de animatie is bijna volledig op de videokaart gezet (per beeld kost de processor
  nog 1 à 2 ms), alle afbeeldingen en shaders worden vooraf klaargezet (al zodra je met de muis boven een
  afgedekt cijfer komt), de blur-effecten boven de animatie zijn weg, en de kwaliteit past zich automatisch aan
  als je computer moeite heeft. Op schermen met een hoge verversingssnelheid tekenen we hoogstens ~85 beelden per
  seconde, en een kaart die rustig ligt tekent nog maar de helft.
- Het niveau van je cijfer is pas aan het licht te zien als het pakje oplaadt, niet al in de tunnel.
- Overslaan kan nu in stappen: eerst naar het scheuren, dan naar de kaart.
- Werkt ook goed op een smal scherm (telefoon rechtop). Zonder WebGL toont de extensie je kaart zonder tunnel.

## v0.2-beta

De extensie is nu gekoppeld aan je echte Somtoday-cijfers, en het geluid is opnieuw gemaakt.

- **Koppeling met Somtoday.** Nieuwe cijfers in "Laatste cijfers" worden afgedekt. Klik erop om het pakket te
  openen met je echte vak, cijfer, onderwerp en weging. Geopende cijfers worden onthouden.
- **Geen spoilers.** Het cijfer is onzichtbaar onder de afdekking (ook voor schermlezers), en wordt nooit
  even getoond voordat de extensie klaar is.
- **Popup vernieuwd:** aantal ongeopende cijfers, "Open volgend pakket", "Alles als geopend markeren" en
  "Alles weer afdekken". Het handmatige formulier zit nu onder "Handmatig proberen".
- **Nieuw: instelling "Cijfers afdekken"**, naast Geluid en Snelle modus. Die instellingen gelden nu ook op de
  Somtoday-pagina zelf.
- **Echte geluiden.** Alle zelfgemaakte synthesizergeluiden zijn vervangen door opnames gemaakt met ElevenLabs:
  scheurend folie, klap, hartslag, voetstappen, stadionpubliek, camera's, vuurwerk en per niveau een eigen
  onthulling (treurige trombone, belletje, fanfare, orkest, slotakkoord met koor).
- Beter geluid: alles loopt door één compressor (geen vervorming), de opbouw piekt precies op het scheurmoment,
  de camera's klikken onregelmatig, de teltikken worden steeds hoger, en overslaan laat alles netjes wegsterven.
- **Geluiden beluisteren:** een pagina (via de popup) waar je alle geluiden naast elkaar hoort.
- Een pakket dat je met een klik op een cijfer opent, slaat het startscherm over.
- Dubbelklikken of een ingedrukte spatiebalk slaat de animatie niet meer per ongeluk over.

## v0.1-beta

De eerste bèta, met de extensie volledig opnieuw ontworpen.

- Nieuwe pakket-animatie: tunnel, pakje met scheurlijn dat echt openscheurt, lichtstralen en
  schokgolven die meeschalen met je cijfer.
- Vijf niveaus: Brons, Zilver, Goud, Speciaal en Icoon, elk met eigen kleuren, titel en geluid.
- Walkout vanaf een 7: spots, fotografen, hartslag en info-plaatjes voor vak, onderwerp en weging.
- Nieuwe FIFA-kaart met echte lettertypes, embleem, weging, stats en holo-glans in plaats van emoji.
- Startscherm met een ‘Nieuw cijfer!’-melding. Door die klik werkt het geluid nu altijd.
- Overslaan (klik of spatie), Opnieuw, Opslaan als afbeelding en een geluidsknop.
- Popup opnieuw ontworpen: live voorbeeld van je kaart, schuifregelaar, weging, Geluid en
  Snelle modus, plus recente pakketten met je gewogen gemiddelde.
- Werkt ook op pagina's waar injecteren niet mag: dan opent het pakket in een eigen tabblad.
- Alles in het Nederlands.
- Sneltoets `Alt+Shift+P` om de popup te openen.
