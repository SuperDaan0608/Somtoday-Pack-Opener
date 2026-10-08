# Wijzigingen

## v2.4.0

- **Uitval: geen nep-uitval meer:** komt er op hetzelfde tijdstip een andere les of afspraak bij (zoals een inzagemoment), dan zag de extensie de oude plek ten onrechte als uitval. Nu telt een les alleen als uitval als er op dat tijdstip niets meer staat, en spookblokken over een bestaande les verdwijnen.

- **Vrienden alleen met dezelfde versie:** je kunt alleen vrienden zijn, kaarten delen en battelen met iemand die dezelfde versie heeft. De server controleert dat. Oudere versies, die nog geen versienummer meesturen, krijgen de melding dat ze moeten updaten. Bij een vriend met een andere versie staat *Andere versie* in je lijst.
- **Server:** `api.php` opnieuw uploaden en `schema.sql` opnieuw uitvoeren (nieuwe tabel `user_versie`).

## v2.3.3

- **Uitval-feest werkt weer:** Somtoday laat een uitgevallen les meestal gewoon weg uit het rooster. De extensie onthoudt nu (alleen in je eigen browser) welke lessen er stonden. Verdwijnt er een, dan staat op die plek een doorgestreept blok met UITVAL en volgt het feest. Dat werkt voor lessen die je eerder in het rooster hebt gezien.

## v2.3.2

- **Gekochte spullen terug:** na een update kon de winkel leeg raken. De nieuwe installatie maakte meteen een lege winkel aan, en die won bij het inloggen van de back-up. Nu worden gekochte spullen altijd samengevoegd, en na een verse installatie gaat de back-up voor. Spullen die weg waren, worden teruggezet uit de muntengeschiedenis (aankopen en dagelijkse beloningen). Pakjes onthouden voortaan ook welk item je kreeg.

## v2.3.1

- De extensie kijkt nu elke minuut of er een nieuwe versie is (was 10 minuten).

## v2.3.0

- **Update verplicht:** is er een nieuwe versie, dan werkt de Pack Opener niet meer tot je hebt geüpdatet. Het paneel wordt geblokkeerd met een melding en een downloadknop, en een klik op een cijfer laat die melding zien. Dat gebeurt ook als je al bezig bent.
- **Updatemelding komt nu echt:** de extensie kijkt elke 10 minuten (zolang Somtoday of het paneel open is) of er een nieuwe versie is, in plaats van één keer per 6 uur. Met een ETag telt dat niet mee voor de limiet van GitHub, ook niet met een hele klas op één schoolnetwerk. Na een mislukte controle wordt het na 10 minuten opnieuw geprobeerd.
- **Kaart in het seizoensthema:** bij het Halloween-, Kerst- of Zomerpakje krijgt de kaart een vleugje van dat thema. Halloween krijgt een paarse gloed, een spinnenweb en vleermuisjes, Kerst rijp en sneeuwvlokjes, en Zomer warm zonlicht. Het cijfer en de naamplaat blijven vrij.

## v2.2.2

- **Geen herkansing meer voor zeldzaam:** of een kaart zeldzaam is, ligt nu vast per cijfer en per account. Opnieuw openen, de pagina verversen of een cijfer weer afdekken en nog een keer openen geeft altijd dezelfde uitkomst. Het blijft één op de tien.

## v2.2.1

- Bij *Account maken* staat een tip om je eigen e-mail (bijv. Gmail) te gebruiken: schoolmail blokkeert vaak mail van buiten de school, waardoor de code niet aankomt. Bij een adres dat op schoolmail lijkt, verschijnt een waarschuwing.

## v2.2.0

- **Inloggen met een account:** je moet eerst inloggen voordat je de Pack Opener kunt gebruiken. Je maakt een account met je e-mailadres en een wachtwoord, en bevestigt het met een code van 6 cijfers die je per mail krijgt. *Wachtwoord vergeten* werkt ook met een code.
- **Nooit meer alles kwijt bij een update:** je voortgang (kaarten, geopende cijfers, munten, winkel, badges, team, gevechten, vrienden, profiel en instellingen) wordt automatisch opgeslagen in je account. Na een update log je in en komt alles terug. De kaartplaatjes worden daarna op Somtoday opnieuw getekend.
- **Privacy:** de back-up wordt op je eigen computer versleuteld met je wachtwoord, dus de server (en de beheerder) kan hem niet lezen. Van je e-mailadres bewaart de server alleen een onleesbare hash. Bij *Instellingen* staat een blokje *Account* met *Nu opslaan*, *Uitloggen* en *Account verwijderen*.
- **Server:** `api.php` en `schema.sql` opnieuw uploaden/uitvoeren, en `mail_van` in `config.php` zetten (zie `server/LEESMIJ.md`).

## v2.1.0

- **Legendarisch:** trek je een zeldzame kaart met een 9,5 of hoger, dan krijg je een nog veel grotere animatie dan bij zeldzaam. Eerst wordt het stil en zwart, met twee zware hartslagen. Bij elke slag barst het scherm verder in gouden barsten en verschijnt "DIT IS GEEN GEWONE KAART". Dan volgt de gewone zeldzaam-tease, het glas spat in 3D-scherven uit elkaar en de kaart komt door een gouden tunnel. De onthulling gaat in nog tragere slow-motion, met een gouden **LEGENDARISCH!**-logo met regenboogrand en een kroon die erop valt. Na een paar seconden wordt het nog één keer donker, laadt de kaart op en volgt een supernova: een gouden ster, schokgolven, de kaart draait nog twee keer rond, vuurwerk door het hele beeld en een regen van gouden munten en confetti. Uitproberen: *Proberen*, cijfer 9,5 of hoger, *Als zeldzame kaart*.
- **Nieuwe badge:** *Legendarisch* (trek een zeldzame kaart met een 9,5 of hoger).

## v2.0.0

- **Teamchemie:** vakken die bij elkaar horen vormen een groep (Exact, Talen, Mens & maatschappij, Kunst & sport). Heb je 3 of meer kaarten uit één groep, of staan ze naast elkaar op het veld, dan krijgt je team chemie (0 tot 100). Op het tabblad Team zie je een meter, lijntjes tussen kaarten die bij elkaar horen, en een tip. In een gevecht geeft chemie hooguit 8% extra passkans en klikkracht. Beide spelers rekenen met dezelfde getallen uit de teamgegevens, dus de uitslag blijft gelijk. Een vriend met een oudere versie stuurt geen chemie mee: dan is de chemie voor allebei 0.
- **Prestaties:** nieuw tabblad met 26 badges (eerste kaart, vijf voldoendes op rij, comeback, alle vakken goud, zeldzame kaarten, Halloween-pakje, alle openingen, gevechten winnen, keeper-held, vol team, chemie 100 en meer). Met voortgang, hints bij vergrendelde badges, en een melding in het Somtoday-venster zodra je een nieuwe badge haalt. Alles blijft in je browser (`spo_prestaties`, `spo_stats`).
- **Seizoensthema's Kerst en Zomer:** net als Halloween krijgt het pakje (alleen de opening *Pakje*) een eigen uiterlijk en eigen geluiden. Kerst (1 december tot en met 6 januari): rood-groene folie, sneeuwvlokken, dennentakken, een kerstbal met ster en sneeuw in de scène, met sleebellen, wind, een belslag en een speeldoos. Zomer (1 juli tot en met 31 augustus): zonnig turquoise met palmboom, zon, golven en zonnestralen, met golven, een meeuw, een plons en een steelpan. De geluiden zijn gesynthetiseerd (`scripts/bouw-seizoenen.py`). Uit te zetten via *Seizoensthema's*; te proberen met `stage.html?seizoen=kerst` of `=zomer`.
- **Zeldzaam is veel groter:** vóór de onthulling bevriest de opening, wordt het scherm zwart met een regenboog-glitch en een hartslag en staat er "ER GEBEURT IETS...". Dan komt de kaart door een regenboogtunnel met een explosie en schokgolven aanvliegen, de onthulling gaat in slow-motion met een regenboog-schokgolf over het hele scherm, de kaart draait rond met holografische folie, een groot "ZELDZAAM!"-logo met glitch en sterren, draaiende lichtbundels, zoeklichten en een 3D-confettistorm. De viering duurt ruim vier seconden langer en is met een klik over te slaan. Eigen geluiden: spanning, koor en bas-boem (`scripts/bouw-zeldzaam.py`). Werkt bij alle openingen; in de snelle modus en bij lage kwaliteit is alles korter en lichter. Eén op de tien blijft het.
- **Munten:** een lokale portemonnee (alleen in je browser). Je verdient munten met geopende cijfers (meer bij een hoger cijfer, drie keer zoveel bij een zeldzame kaart), gewonnen of gelijke gevechten en behaalde prestaties. Elk cijfer, gevecht en elke prestatie telt maar één keer. De teller staat in de kop van het paneel en in de tooltip van de Pack Opener-knop.
- **Dagelijkse beloning:** de eerste keer per dag dat Somtoday open is, krijg je een pakje met munten. Een reeks van 7 dagen geeft steeds meer; dag 7 is een zeldzaam item. Mis je een dag, dan begin je weer bij dag 1. Uit te zetten bij Instellingen.
- **Winkel:** nieuw tabblad. Koop Somtoday-thema's, extra kaartkleuren en -randen, profieltitels en profielachtergronden. Ook pakjes (klein, gewoon, groot) met een willekeurig item en een korte animatie; een dubbel item geeft een deel van je munten terug. Alles is alleen cosmetisch.
- **Somtoday-thema's:** Donker, Neon, Oceaan, Bos en Goud hertekenen de hele Somtoday-pagina (alleen na het kopen). Standaard zet het meteen terug.
- **Profiel:** nieuw tabblad met je eigen spelerskaart: bijnaam (zelf getypt, nooit je naam uit Somtoday), je beste zes vakken als stats, niveau, aantal zeldzame kaarten en gevechten. Delen met vrienden (uit te zetten) en downloaden als plaatje. Vrienden zien je profielkaart op de Vrienden-pagina.
- **Uitval-feest:** valt er een les uit op het rooster, dan krijgt die les een label en gloed, en volgt eenmalig een korte viering met confetti, "UITVAL!" en gejuich. Alleen een hash van week, dag, tijd en vak wordt onthouden. Uit te zetten bij Instellingen (*Uitval-feest*).
- **Updatemelding:** de extensie kijkt hoogstens elke 6 uur op GitHub of er een nieuwe versie is (één GET, geen tracking). Is die er, dan zie je "Nieuwe versie X" met *Downloaden* (de juiste zip voor Chrome of Firefox) boven de knop op Somtoday en in het paneel. *Later* verbergt de melding tot de volgende versie.

## v1.4.1

- Bij "te veel verzoeken" wacht de live-synchronisatie steeds langer (tot 2 minuten) in plaats van elke seconde opnieuw te proberen.

## v1.4.0

- **Live synchroniseren:** de vriendenpagina en het tabblad Team synchroniseren elke seconde, alleen zolang je ze ziet. Een lichte controle (`puls`) haalt pas iets op als er echt iets veranderd is.
- **Team:** kies 1 tot 11 kaarten uit je galerij, één keeper, en zie je opstelling op een voetbalveld. Vrienden zien alleen vak, cijfer, niveau en zeldzaam van je teamkaarten.
- **Gevecht:** daag een vriend uit met een team van evenveel kaarten, of oefen tegen de computer. De bal gaat van kaart naar kaart en bij een kans volgt een klikduel van 3 seconde. Uitslagen staan bij je vriend.
- **Server:** nieuwe tabel `berichten` en acties `puls`, `send` en `poll`; `api.php` en `schema.sql` opnieuw uploaden.

## v1.3.0

- **Alles in het Somtoday-venster:** een *Pack Opener*-knop rechtsonder op Somtoday (met het aantal nieuwe cijfers) opent een paneel in de pagina zelf. Daarin staan Overzicht, Galerij, Kaart ontwerpen, Vrienden, Cijfercalculator, Proberen, Instellingen en Geluiden: niets meer op losse tabbladen. Sluiten kan met ×, Esc of een klik ernaast; op een telefoon vult het paneel het scherm. De knop is uit te zetten bij Instellingen.
- **De popup is een afstandsbediening:** de status en grote knoppen die het paneel op het juiste tabblad openen, in plaats van kleine linkjes onderaan.
- **Kluis kraken met interactie:** je draait zelf het slot door rondjes om het wiel te slepen (muis of vinger), met klikjes, drie stappen en een handwiel om de deur te openen. Spatie of Enter slaat het over, na 14 seconden zonder invoer loopt het vanzelf door, en de snelle modus blijft automatisch.
- **Helemaal nieuwe kaarten:** elk niveau heeft een eigen materiaal en compositie (geslagen brons, gepolijst chroom, goud met stralenkrans en lauwerkrans, neon-circuitglas, parelmoer met kroon), echt reliëf en folie die meebeweegt met je muis, een medaillon met pictogram per vak, en een mooier opslagplaatje, deelplaatje en galerij-miniatuur. Alle kleurthema's en randen werken er nog bij.
- **Zeldzame kaarten** doen veel meer (regenboogstralen en -titel, vier schokgolven, extra vuurwerk en confetti, dubbele fanfare).

## v1.2.0

- **Zeldzame kaarten:** één op de tien kaarten is zeldzaam, bij elke opening en bij elk cijfer: een regenboogrand en een label op de kaart, extra licht en glans, vuurwerk en confetti (ook bij een onvoldoende), een glinstering al bij het hoogtepunt, regenboog-licht, een regenboogtitel "ZELDZAAM!", vier schokgolven na de onthulling, twee rondes confetti, een gouden regen en een dubbele fanfare met publiek. In de galerij herken je ze aan hetzelfde label. Uit te zetten in de popup (*Zeldzame kaarten*); bij *Handmatig proberen* kun je er zelf een uitproberen.
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
