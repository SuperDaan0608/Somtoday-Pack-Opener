# Wijzigingen

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
