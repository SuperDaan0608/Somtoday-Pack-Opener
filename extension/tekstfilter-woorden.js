// Woordenlijst voor het tekstfilter (tekstfilter.js). Makkelijk uit te breiden: voeg gewoon woorden toe aan een lijst.
// Alles in kleine letters, zonder accenten. Het filter let zelf op hoofdletters, leetspeak (k4nk3r), tekens
// tussen de letters (k.u.t), dubbele letters (kuuuut) en lookalikes. Je hoeft die varianten dus NIET toe te voegen.
//
// Schrijfwijze: 'kut+ten,je' betekent: kut, kutten en kutje. Zo blijft elke vorm bewust gekozen.
//
// De lijsten:
//   woorden   hele woorden (het hele woord moet gelijk zijn). Dubbele letters tellen als een letter.
//   exact     hele woorden, maar de letters moeten precies zo staan (hooguit twee dezelfde na elkaar).
//             Voor korte woorden die anders in gewone woorden zouden vallen (ass, dick, pik).
//   begin     woorden die ermee BEGINNEN (kutwijf, kutkind). Alleen voor veilige beginstukken.
//   stam      woorden die het stuk ERGENS bevatten (samenstellingen, bijv. kankerlijer). Alleen lange, veilige stukken.
//   dreiging  losse woorden achter elkaar, voor bedreigen en pesten. Wordt eerst gecontroleerd.
//   zinnen    losse woorden achter elkaar (haat, schelden in een zin).
//   hulp      zelfbeschadiging: geen weigering maar een vriendelijke hulptekst (hulpStam: stuk ergens in een woord).
//   uitzondering     woorden die NOOIT geweigerd worden, ook al lijken ze op een slecht woord (Scunthorpe-probleem).
//   uitzonderingZin  stukken tekst die voor de controle weggehaald worden (bijv. 'cum laude').
//
// LET OP: dit is een startlijst. De eigenaar loopt hem later na. Bewust NIET opgenomen (te vaak gewoon taalgebruik):
// ezel, eikel, loser, gay, nazi, hitler (alleen in 'heil hitler'), jood/joden, aap, naakt, borsten, vrijen, condoom.
(function (wortel) {
  'use strict';
  var W = {
    woorden: [
      // Nederlands: schelden
      'kut+s,ten,je,jes,tje,tjes', 'lul+s,len,le,letje,lig,lige', 'lulverhaal', 'lulkoek', 'oetlul', 'klootzak+ken,s', 'kloot+s', 'klote', 'kloten',
      'hoer+en,e,tje,tjes,s', 'slet+ten,s,je,jes', 'teef+s', 'wijf+je,jes,en', 'trut+ten,s,je', 'tering', 'tyfus', 'kanker', 'kolere',
      'klere', 'pleuris', 'crepeer', 'mongool+s,tje', 'spast+e,isch,ische,jes', 'debiel+en,e,tje', 'idioot+en,e', 'imbeciel+e,en',
      'achterlijk+e,en', 'zwakzinnig+e', 'randdebiel', 'smeerlap+pen', 'rotzak+ken', 'mispunt+en', 'lutser', 'kankerlijer', 'tyfuslijer',
      'godverdomme', 'godver', 'gvd', 'gvdm', 'verdomme', 'hufter+s', 'sletje', 'mietje+s',
      // Nederlands: seksueel
      'seks', 'sex', 'sexy', 'sexting', 'sexchat', 'neuk+en,t,te,ten,er,ers,je', 'geneukt', 'piemel+s,tje', 'penis+sen', 'vagina+s',
      'tiet+en,je,jes', 'sperma', 'klaarkomen', 'masturberen', 'masturbeer', 'afrukken', 'pijpbeurt', 'beffen', 'vingeren', 'porno',
      'pornofilm', 'pornosite', 'hentai', 'orgasme', 'orgie', 'dildo+s', 'vibrator+s', 'prostituee', 'incest', 'verkracht',
      'verkrachten', 'verkrachter', 'verkrachting', 'pedofiel', 'pedofielen', 'kinderporno', 'naaktfoto', 'naaktfotos', 'nudes',
      'geslachtsdeel', 'sekslijn', 'seksfilm', 'neukpartij', 'hoerenkast', 'hoerenloper',
      // Nederlands: haat en uitsluiting
      'neger+s,tje,tjes,in', 'nikker+s', 'zwartjoekel', 'bruinjoekel', 'roetmop+pen', 'makak+ken', 'bosneger', 'zandneger', 'jodenhoer',
      'jodenhater', 'jodenpest', 'flikker+s,tje,tjes', 'homo+s', 'lesbo', 'shemale', 'moslimhater', 'kutmarokkaan', 'kutturk', 'kankerjood',
      // Engels: schelden
      'fuck+ing,er,ers,ed,s,in', 'fuk', 'fck', 'fvck', 'fcking', 'phuck', 'phuk', 'shit+ty,s,ting', 'bitch+es,y,ing', 'bastard+s', 'asshole+s',
      'cunt+s,y', 'cvnt', 'twat+s', 'wanker+s', 'whore+s', 'slut+s,ty', 'dickhead+s', 'pussy', 'pussies', 'dumbass', 'jackass', 'dipshit', 'bullshit',
      'horseshit', 'moron+s,ic', 'idiot+s,ic', 'retard+ed,s', 'scumbag', 'douchebag', 'motherfucker+s', 'stfu', 'gtfo', 'kys', 'bollocks',
      'arsehole', 'tosser', 'knobhead', 'wazzock', 'cocksucker', 'jerkoff',
      // Engels: seksueel
      'porn', 'pornstar', 'pornhub', 'pornography', 'onlyfans', 'milf', 'boob+s,ies', 'tits', 'titties', 'blowjob+s', 'handjob+s',
      'cumshot', 'orgasm', 'rapist+s', 'molest', 'pedo', 'paedo', 'pedophile+s', 'paedophile', 'threesome', 'masturbate', 'nsfw',
      // Engels: haat
      'nigger+s', 'nigga+s', 'niggah', 'negro+es', 'chink+s', 'gook+s', 'spic+s', 'kike+s', 'wetback+s', 'paki+s', 'beaner+s', 'faggot+s',
      'fag+s', 'dyke+s', 'tranny', 'trannies', 'towelhead', 'raghead', 'sandnigger', 'spaz', 'spastic', 'mongoloid', 'zyklon'
    ],
    exact: [
      'ass+es', 'arse', 'pik+ken,je,jes', 'dick+s', 'cock+s', 'prick+s', 'cum', 'jizz', 'rape+d,s', 'anal', 'anus', 'coon', 'mof+fen', 'fag',
      'dyke', 'paki', 'spic', 'kike', 'chink', 'gook', 'piss+ed,ing'
    ],
    begin: [
      'kut', 'neuk', 'tering', 'pleuris', 'godver', 'shit', 'bitch', 'whore', 'slut', 'porn', 'nigg', 'fagg', 'pedo'
    ],
    stam: [
      'kanker', 'klootzak', 'hoerenzoon', 'hoerenkind', 'hoerekind', 'motherfuck', 'fuck', 'bullshit', 'horseshit', 'dipshit', 'shithead',
      'dickhead', 'cocksuck', 'asshole', 'dumbass', 'jackass', 'fatass', 'nigger', 'nigga', 'faggot', 'tyfus', 'lijer', 'godverdomme',
      'kinderporno', 'pedofiel', 'verkracht', 'zwartjoekel', 'bruinjoekel', 'roetmop', 'masturb'
    ],
    zinnen: [
      'ik haat je', 'ik haat jou', 'i hate you', 'je bent lelijk', 'jij bent lelijk', 'je bent dik', 'jij bent dik', 'je bent een loser',
      'jij bent een loser', 'je stinkt', 'jij stinkt', 'you are ugly', 'you are fat', 'you are a loser', 'nobody likes you',
      'everyone hates you', 'niemand mag je', 'niemand houdt van je', 'niemand vindt je leuk', 'iedereen haat je', 'je hebt geen vrienden',
      'hou je bek', 'hou je smoel', 'fuck off', 'fuck you', 'piss off', 'eat shit', 'sieg heil', 'heil hitler', 'white power',
      'vuile jood', 'vuile joden', 'vuile neger', 'vuile moslim', 'vuile marokkaan', 'vuile turk', 'vuile homo', 'vuile flikker',
      'dood aan de joden', 'dood aan alle', 'kill all', 'gas the jews', 'gas de joden', 'rot maar op', 'flikker op', 'sodemieter op',
      'je moeder is een', 'yo mama is', 'jou moeder is een'
    ],
    dreiging: [
      'ik maak je dood', 'ik maak jou dood', 'ik maak je af', 'ik maak jou af', 'ik vermoord je', 'ik vermoord jou', 'ik sla je dood',
      'ik sla jou dood', 'ik sla je in elkaar', 'ik sla jou in elkaar', 'ik steek je neer', 'ik schiet je neer', 'ik snij je keel door',
      'ik ga je vermoorden', 'ik ga je doden', 'ik ga je slaan', 'ik weet waar je woont', 'ik weet waar jij woont', 'ik ga je kapotmaken',
      'ik ga je verrot slaan', 'ik maak je kapot', 'ik blaas de school op', 'ik blaas school op', 'ik ga de school opblazen',
      'bom in de school', 'bom in school', 'ik schiet iedereen neer', 'ik schiet op school', 'ik neem een mes mee naar school',
      'ik neem een wapen mee naar school', 'ga maar dood', 'ga lekker dood', 'val dood', 'val maar dood', 'jij mag dood', 'je moet dood',
      'ik hoop dat je doodgaat', 'ik hoop dat je dood gaat', 'ik hoop dat je sterft', 'ik hoop dat je crepeert', 'hoop dat je doodgaat',
      'hoop dat je sterft', 'hoop dat je dood gaat', 'ga zelfmoord plegen', 'pleeg zelfmoord', 'pleeg maar zelfmoord', 'ga jezelf ophangen',
      'hang jezelf op', 'spring van een brug', 'spring van het dak', 'snij jezelf', 'maak jezelf af', 'maak jezelf dood',
      'i will kill you', 'i ll kill you', 'i am going to kill you', 'i m going to kill you', 'im going to kill you', 'i will find you',
      'i know where you live', 'i will hurt you', 'i ll hurt you', 'i will beat you', 'i m gonna kill you', 'im gonna kill you',
      'gonna kill you', 'going to kill you', 'kill yourself', 'kill your self', 'go kill yourself', 'go die', 'go and die',
      'i hope you die', 'hope you die', 'you should die', 'you deserve to die', 'you should kill yourself', 'hang yourself',
      'end yourself', 'slit your wrists', 'jump off a bridge', 'jump off a roof', 'bring a gun to school', 'shoot up the school',
      'blow up the school', 'bomb the school'
    ],
    hulp: [
      'ik wil dood', 'ik wil doodgaan', 'ik wil dood gaan', 'ik wil niet meer leven', 'ik wil er niet meer zijn', 'ik wil er niet meer bij zijn',
      'ik wil weg uit dit leven', 'ik wil mezelf doden', 'ik wil mezelf iets aandoen', 'ik wil mezelf pijn doen', 'ik maak mezelf dood',
      'ik maak mezelf af', 'ik ga mezelf doden', 'ik ga mezelf iets aandoen', 'ik ga mezelf pijn doen', 'ik hoef niet meer te leven',
      'ik heb geen zin meer om te leven', 'ik heb geen zin meer in leven', 'het leven heeft geen zin', 'mijn leven heeft geen zin',
      'ik wou dat ik dood was', 'ik zou beter dood zijn', 'ik ben liever dood', 'mezelf pijn doen', 'mezelf pijn te doen', 'mezelf snijden',
      'mezelf verwonden', 'mezelf beschadigen', 'mezelf iets aandoen', 'mezelf kwaad doen', 'mezelf doden', 'mezelf van kant maken',
      'mezelf ophangen', 'ik snij mezelf', 'ik krab mezelf', 'ik verwond mezelf', 'ik beschadig mezelf', 'ik ga van het dak springen',
      'ik spring van het dak', 'ik spring van een brug', 'ik spring voor de trein', 'een eind aan mijn leven', 'ik kan niet meer verder leven',
      'kill myself', 'self harm', 'self injury', 'i want to die', 'i wanna die', 'i want to kill myself', 'i wanna kill myself', 'i will kill myself', 'i ll kill myself',
      'i m going to kill myself', 'im going to kill myself', 'i am going to kill myself', 'gonna kill myself', 'end my life', 'end it all',
      'ending it all', 'i want to end it', 'hurt myself', 'harm myself', 'cut myself', 'cutting myself', 'hang myself',
      'i don t want to live', 'i dont want to live', 'i do not want to live', 'i wish i was dead', 'i wish i were dead', 'better off dead',
      'no reason to live', 'nothing to live for', 'take my own life'
    ],
    hulpStam: [
      'zelfmoord', 'zelfdoding', 'zelfverminking', 'zelfbeschadig', 'suicide', 'suicid', 'suicidaal', 'suicidal', 'selfharm', 'selfinjury',
      'zelfverwonding'
    ],
    uitzondering: [
      // Scunthorpe-gevallen en gewone woorden die op slechte woorden lijken
      'scunthorpe', 'klassiek', 'klassieke', 'klas', 'klassen', 'klasse', 'assen', 'essen', 'dickens', 'hancock', 'peacock', 'cumulus',
      'cumberland', 'cucumber', 'analyse', 'analyseren', 'analist', 'analoog', 'analogie', 'canal', 'penistone', 'sussex', 'essex',
      'middlesex', 'wessex', 'sexton', 'sextant', 'sextet', 'kutter', 'kutters', 'kutsch', 'kuta', 'shitake', 'shiitake', 'mishit',
      'niggard', 'niggardly', 'pedometer', 'pedologie', 'mongolie', 'mongolen', 'mongools', 'mongoolse', 'klootschieten', 'klootschieter',
      'hoera', 'hoeratje', 'hoeveel', 'hoeveelheid', 'assistent', 'assist', 'associatie', 'assortiment', 'assimilatie', 'class', 'classic',
      'glass', 'grass', 'mass', 'pass', 'brass', 'bass', 'lass', 'compass', 'passage', 'assepoester', 'tyfoon', 'cholera', 'homogeen',
      'homoniem', 'homofoon', 'seksuele', 'seksualiteit', 'sexual', 'sexuality', 'bitcoin', 'titel', 'titels', 'titan', 'titanic',
      'penny', 'pennen', 'pikant', 'piket', 'pikkel', 'pikzwart', 'pikdonker', 'wanken', 'wankel', 'wankelen'
    ],
    uitzonderingZin: [
      'cum laude', 'magna cum laude', 'summa cum laude', 'homo sapiens', 'homo erectus', 'homo ludens', 'homo economicus', 'homo habilis'
    ]
  };
  if (typeof module === 'object' && module.exports) module.exports = W;
  else wortel.SPOTekstWoorden = W;
})(typeof globalThis !== 'undefined' ? globalThis : this);
