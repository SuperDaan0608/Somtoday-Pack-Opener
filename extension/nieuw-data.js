/*
 * Somtoday Pack Opener v3.0: de teksten voor het venster "Wat is nieuw" (nieuw.js).
 * Gewoon in de extensie meegeleverd: er gaat niets over het netwerk.
 *
 * Elke versie: { versie: '3.0.0', datum: 'jjjj-mm-dd' (mag leeg zijn), titel, punten: [hooguit 6 korte zinnen] }
 * De nieuwste versie staat bovenaan. Schrijf in korte, vriendelijke zinnen, zonder technisch jargon.
 * Bij elke nieuwe versie hoort hier een nieuw blok (server/test/nieuw.test.js en scripts/package*.sh controleren dat).
 */
(function () {
  'use strict';
  const NIEUW = [
    {
      versie: '3.0.0',
      datum: '',
      titel: 'Grote update',
      punten: [
        'Veiliger voor iedereen: alles wat je typt gaat eerst door een streng filter, en scheldwoorden en persoonlijke gegevens komen er niet meer door.',
        'Je kunt vrienden blokkeren en melden. De beheerder kan iemand waarschuwen, en je ziet netjes een melding als dat gebeurt.',
        'Geheime prestaties met een raadsel erbij. Kun jij ze vinden?',
        'Een troostpakje na een tegenvallend cijfer, en op maandag een weekoverzicht van je vorige week.',
        'Schrijf een tijdcapsule aan jezelf bij een kaart, kies een aartsrivaal en nodig vrienden uit met een link.',
        'Nieuw: de knoppen Wat is nieuw en Feedback bovenin. Zo vertel je ons wat beter kan.',
      ],
    },
    {
      versie: '2.4.4',
      datum: '2026-10-09',
      titel: 'Pure Aura',
      punten: [
        'De prestatie voor een 10 op een mythische kaart heet nu Pure Aura en staat extra groot bovenaan.',
      ],
    },
    {
      versie: '2.4.2',
      datum: '2026-10-09',
      titel: 'Een prestatie die bijna onmogelijk is',
      punten: [
        'Nieuwe prestatie voor een 10 op een mythische kaart. Het is de enige met de hoogste rang, en die rang bestaat uit flikkerende kapotte letters.',
      ],
    },
    {
      versie: '2.4.1',
      datum: '2026-10-09',
      titel: 'Vastlopen opgelost',
      punten: [
        'Bij een 10 met een mythische kaart kon de animatie vastlopen. Dat is opgelost.',
        'Gaat er toch iets mis bij het tekenen, dan kan je laptop er niet meer zwaar van vastlopen.',
      ],
    },
    {
      versie: '2.4.0',
      datum: '2026-10-09',
      titel: 'De zeldzaamheidsladder',
      punten: [
        'Naast Zeldzaam zijn er nu Glim, Kosmisch en Mythisch. Hoe hoger, hoe kleiner de kans en hoe mooier de animatie.',
        'Een 10 met een kosmische of mythische kaart geeft een eigen finale.',
        'Een rondleiding voor nieuwe spelers laat in een minuutje zien wat alles is.',
        'Vrienden krijgen een melding bij jouw bijzondere kaart en kunnen GG sturen of meekijken.',
        'Een klein draakje op Somtoday dat groeit van je cijfers.',
        'Een onvoldoende kan vervloekt zijn: sterker in een gevecht, maar soms met een gemene streek.',
      ],
    },
    {
      versie: '2.3.4',
      datum: '2026-10-08',
      titel: 'Vrienden met dezelfde versie',
      punten: [
        'Je kunt alleen vrienden zijn, kaarten delen en battelen met iemand die dezelfde versie heeft.',
        'Bij een vriend met een andere versie staat Andere versie in je lijst.',
      ],
    },
    {
      versie: '2.3.3',
      datum: '2026-10-08',
      titel: 'Uitval-feest werkt weer',
      punten: [
        'Valt een les uit, dan krijg je weer een doorgestreept blok met UITVAL en een feestje.',
      ],
    },
    {
      versie: '2.3.2',
      datum: '2026-10-08',
      titel: 'Gekochte spullen terug',
      punten: [
        'Na een update kon de winkel leeg raken. Dat is opgelost en spullen die weg waren komen terug.',
      ],
    },
    {
      versie: '2.3.0',
      datum: '2026-10-08',
      titel: 'Updates en seizoenskaarten',
      punten: [
        'Is er een nieuwe versie, dan moet je eerst updaten. Je ziet dan een melding met een downloadknop.',
        'Je merkt sneller dat er een nieuwe versie is.',
        'Bij het Halloween-, Kerst- of Zomerpakje krijgt ook de kaart een vleugje van dat thema.',
      ],
    },
    {
      versie: '2.2.0',
      datum: '2026-10-08',
      titel: 'Inloggen met een account',
      punten: [
        'Je maakt een account met je e-mailadres en een wachtwoord. Een code van 6 cijfers bevestigt het.',
        'Je voortgang wordt automatisch bewaard. Na een update log je in en alles komt terug.',
        'De back-up is op je eigen computer versleuteld, dus niemand anders kan hem lezen.',
      ],
    },
  ];

  globalThis.SPONieuwData = NIEUW;
  if (typeof module !== 'undefined' && module.exports) module.exports = NIEUW;
})();
