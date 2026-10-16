/*
 * Somtoday Pack Opener DEBUG-BUILD: nep-server voor het testmenu (debug.html).
 * Het testmenu laat de echte vensters van v3.0 zien (waarschuwing, melden, blokkeren, feedback). Die praten normaal met de
 * vriendenserver. Hier worden precies de functies die een verzoek sturen vervangen door nep-versies: ze doen NIETS met het netwerk,
 * schrijven alleen in een lijstje (globalThis.__spoDebugNep.verstuurd) en kunnen een fout nabootsen.
 * Het bestand wordt als EERSTE geladen (het zet ook de vlag zodat weekoverzicht.js, capsule.js en feedback.js niet vanzelf starten)
 * en installeert de nepfuncties zodra de pagina klaar is. Dit bestand zit ALLEEN in de debug-zip (scripts/package-debug.sh).
 */
(function () {
  'use strict';
  globalThis.__SPO_TEST_ZONDER_START = true; // de libs doen dan niets vanzelf in dit menu (geen eigen meldingen, geen netwerk)

  const nep = globalThis.__spoDebugNep = {
    // Wat de nep-server antwoordt: 'ok' | 'te-veel' (429) | 'onbekend' (404) | 'verbannen' | 'geen-verbinding' (status 0) | 'serverfout' (500)
    uitkomst: { meld: 'ok', blokkeer: 'ok', feedback: 'ok' },
    verstuurd: [],          // [{ ts, actie, body }]: wat er verstuurd ZOU zijn (nooit echt)
    waarschuwingen: [],     // wat 'haalWaarschuwingen' teruggeeft
    bewijs: { bn: 'DebugKanon', kaarten: ['Wiskunde - Hoofdstuk 3', 'Engels - Bel mij op 06 12345678'] },
    luister: null,          // functie die elke nep-verzending krijgt (het menu toont de lijst)
    // Jaaroverzicht (jaar.js): het nep-account bestaat alleen zolang het menu het jaarvenster openhoudt (jaarAccount).
    // modus: 'ok' | 'limiet' | 'tijd' (server geeft op) | 'hangt' (blijft wachten, de app geeft zelf op) | '503' (fout) ; tekst: 'goed' | 'rommel' | 'afgekeurd'
    jaarAccount: false,
    jaar: { modus: 'ok', tekst: 'goed', start: 4, positie: 0, stap: 0 },
  };
  // De nep-AI-tekst. 'rommel' bevat tags, een link en opmaak (jaar.js moet die eruit halen); 'afgekeurd' bevat een telefoonnummer (het tekstfilter moet hem weigeren).
  const JAAR_TEKSTEN = {
    goed: 'Wat een schooljaar! Je haalde sterke cijfers bij de exacte vakken en je groeide daar zichtbaar. Bij de talen bleef je rustig op niveau, en bij mens en maatschappij had je een paar pittige weken. ' +
      'Je kosmische en mythische kaarten laten zien dat harde oefening loont. Iedereen heeft weleens een zware week: het gaat om wat je daarna doet. Geniet van de vakantie, je hebt het verdiend!',
    rommel: '<b>Wat een jaar!</b> <script>alert(1)</script>Je groeide bij de <i>exacte vakken</i> en bleef sterk bij de talen. **Goed gedaan** en kijk eens op https://voorbeeld.nl/leuk of www.voorbeeld.nl voor meer. ' +
      '<img src=x onerror=alert(1)> Je zwaarste week was een lastige, maar je kwam terug. # Tot volgend jaar en geniet van de vakantie, je hebt het echt verdiend!',
    afgekeurd: 'Wat een schooljaar! Bel mij gerust op 06 12345678 als je wilt praten over je cijfers en je stijging bij de exacte vakken. Je haalde mooie kaarten en je groeide het hele jaar door.',
  };
  const noteer = (actie, body) => {
    nep.verstuurd.unshift({ ts: Date.now(), actie, body });
    nep.verstuurd.length = Math.min(nep.verstuurd.length, 20);
    if (typeof nep.luister === 'function') { try { nep.luister(); } catch (e) { /* menu weg */ } }
  };
  function fout(status, message, extra) { const e = new Error(message); e.status = status; return Object.assign(e, extra); }
  // Gooit de gekozen fout (of niets bij 'ok'), zoals de echte client in vriendenlib.js het zou doen.
  function antwoord(soort) {
    switch (nep.uitkomst[soort]) {
      case 'te-veel': throw fout(429, 'Je hebt vandaag al te veel gedaan (nep).');
      case 'onbekend': throw fout(404, 'Onbekend (nep).');
      case 'serverfout': throw fout(500, 'Serverfout 500 (nep).');
      case 'geen-verbinding': throw fout(0, 'Geen verbinding met de server.');
      case 'verbannen': {
        const L = globalThis.SPOVrienden;
        const tot = Math.floor(Date.now() / 1000) + 3 * 86400;
        throw fout(403, L && L.banTekst ? L.banTekst(tot, 'Debug-voorbeeld') : 'Je bent verbannen (nep).', { verbannen: true, tot, reden: 'Debug-voorbeeld' });
      }
      default: return { ok: true };
    }
  }

  // Het jaaroverzicht praat met de nep-server: wachtrijpositie die aftelt, daarna de nep-AI-tekst (of limiet, time-out, 503).
  function jaarRoep(a, body) {
    const j = nep.jaar;
    if (a === 'jaarAanvraag') {
      noteer('jaarAanvraag', body);
      if (j.modus === 'limiet') return { status: 'limiet', soort: 'dag' };
      if (j.modus === '503') throw fout(503, 'Het jaaroverzicht is nu niet beschikbaar (nep).');
      j.positie = Math.max(1, j.start | 0); j.stap = 0;
      return { status: 'wacht', positie: j.positie };
    }
    noteer('jaarStatus', {});
    j.stap++;
    if (j.modus === 'hangt') return { status: 'wacht', positie: 2 };
    if (j.positie > 1) { j.positie--; return { status: 'wacht', positie: j.positie }; }
    if (j.positie === 1) { j.positie = 0; return { status: 'bezig', positie: 0 }; }
    if (j.modus === 'tijd') return { status: 'tijd' };
    return { status: 'klaar', tekst: JAAR_TEKSTEN[j.tekst] || JAAR_TEKSTEN.goed };
  }
  nep.JAAR_TEKSTEN = JAAR_TEKSTEN;

  function installeer() {
    const L = globalThis.SPOVrienden;
    if (!L) return;
    L.laad = async () => (nep.jaarAccount ? { nep: true, server: 'https://nep.invalid', id: '0123456789abcdef0123456789abcdef', token: 'nep', vrienden: [] } : null); // geen echt vriendenaccount in dit menu
    L.meld = async (st, tegen, reden, uitleg, bewijs) => { noteer('meld', { tegen, reden, uitleg, bewijs: bewijs || '' }); return antwoord('meld'); };
    L.blokkeer = async (st, id) => { noteer('blokkeer', { id }); return antwoord('blokkeer'); };
    L.deblokkeer = async (st, id) => { noteer('deblokkeer', { id }); return { ok: true }; };
    L.haalWaarschuwingen = async () => nep.waarschuwingen.slice();
    L.waarschuwingGezien = async (st, id) => { noteer('waarschuwingGezien', { id }); nep.waarschuwingen = nep.waarschuwingen.filter((w) => w.id !== id); return { ok: true }; };
    L.bewijsTekst = (id, reden) => {
      const b = nep.bewijs, regels = [];
      if (b.bn && reden !== 'tekst') regels.push('Bijnaam: ' + b.bn);
      if (reden !== 'naam') for (const k of b.kaarten) regels.push('Kaart: ' + k);
      return regels.join('\n');
    };
    // feedback.js: maakClient(server).roep('feedback', {...})
    const nepClient = () => ({ roep: async (a, body) => {
      if (a === 'jaarAanvraag' || a === 'jaarStatus') return jaarRoep(a, body);
      noteer(a, body); return antwoord(a === 'feedback' ? 'feedback' : 'meld');
    } });
    L.maakClient = nepClient;
    L.clientVan = nepClient;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installeer, { once: true }); else installeer();
})();
