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

  function installeer() {
    const L = globalThis.SPOVrienden;
    if (!L) return;
    L.laad = async () => null; // geen echt vriendenaccount in dit menu
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
    const nepClient = () => ({ roep: async (a, body) => { noteer(a, body); return antwoord(a === 'feedback' ? 'feedback' : 'meld'); } });
    L.maakClient = nepClient;
    L.clientVan = nepClient;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installeer, { once: true }); else installeer();
})();
