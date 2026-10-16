/*
 * Somtoday Pack Opener v3.0: EEN VRIEND UITNODIGEN.
 * De knop 'Nodig een vriend uit' maakt een link naar de uitnodigingspagina van de server: <server>?uitnodiging=<jouw vriendcode>.
 * Die pagina legt uit hoe je de extensie installeert (hij staat niet in de winkel, dus je vriend moet hem zelf installeren) en toont de code.
 *
 * Beloning: komt een vriendschap tot stand via een uitnodiging, dan krijgen BEIDE een gratis pakje.
 *  - De nieuwe vriend plakt de link (of de code, met het vakje 'via een uitnodiging') bij 'Code van een vriend invoeren'.
 *    Zijn vriendverzoek krijgt dan v.via = true. De server kent dat veld niet: het blijft bij hem op het apparaat.
 *  - Zodra het verzoek is geaccepteerd, krijgt hij zijn pakje en stuurt hij 'uitnodiging-bedankt' naar jou (versleuteld bericht).
 *  - Jij krijgt je pakje als dat bericht komt van een vriend die pas na jouw eerste uitnodigingslink in je lijst kwam. Jij stuurt
 *    'uitnodiging-ok' terug, zodat hij stopt met opnieuw sturen.
 * Eerlijk gezegd: de server kan niet controleren dat een link gebruikt is, dus dit rust op wat jullie extensies elkaar vertellen.
 * Daarom: maximaal 10 beloningen per account, alleen vrienden die na je eerste link kwamen, en één keer per vriend.
 * Extra pakjes: bij de 1e (klein), 5e (gewoon) en 10e (groot) beloning.
 *
 * Opslag: spo_uitnodigingen { v:1, link: ms van je eerste link, n: ontvangen beloningen, bekend: {[id]: eerst gezien},
 *   beloond: {[id]: ms} (vrienden waarvoor ik beloond ben), door: {[id]: { s:'wacht'|'klaar', laatst }} (ik kwam via die vriend) }
 */
(function () {
  'use strict';
  const SLEUTEL = 'spo_uitnodigingen';
  const MAX_BELONINGEN = 10;
  const TYPES = ['uitnodiging-bedankt', 'uitnodiging-ok'];
  const MAX_LEEFTIJD = 600;
  const HERHAAL = 4 * 60 * 1000;
  const MIJLPAAL = { 1: 'klein', 5: 'normaal', 10: 'groot' };
  const isId = (t) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t);
  const eigen = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const nat = (x, max) => (Number.isFinite(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0);
  const CODE = /SPO1-[0-9a-f]{32}-[A-Za-z0-9_-]{80,100}/;

  function schoonBericht(m, leeftijd) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !TYPES.includes(m.t)) return null;
    return Number.isFinite(leeftijd) && leeftijd >= 0 && leeftijd < MAX_LEEFTIJD ? m.t : null;
  }

  // ---- de link en de invoer ----
  // De link naar de uitnodigingspagina: het serveradres (api.php) met ?uitnodiging=<code>.
  function maakLink(server, code) {
    const std = (globalThis.SPOVrienden && globalThis.SPOVrienden.STANDAARD_SERVER) || 'https://jummysnacks.nl/api.php';
    let u;
    try { u = new URL(server || std); if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol'); } catch (e) { u = new URL(std); }
    u.search = ''; u.hash = '';
    u.searchParams.set('uitnodiging', code);
    return u.toString();
  }
  // Wat iemand intikt bij 'Code van een vriend': een gewone code, of de hele uitnodigingslink.
  // Geeft { code, via } terug; via = true als het een uitnodigingslink was.
  function leesInvoer(tekst) {
    const t = String(tekst === undefined || tekst === null ? '' : tekst).trim();
    if (/uitnodiging=/i.test(t)) {
      const m = CODE.exec(t);
      if (m) return { code: m[0], via: true };
    }
    return { code: t, via: false };
  }

  // ---- toestand ----
  function schoonStaat(x) {
    const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
    const uit = { v: 1, link: nat(o.link, 4.1e12), n: nat(o.n, MAX_BELONINGEN), bekend: {}, beloond: {}, door: {} };
    const kopieer = (van, naar, max, f) => {
      if (!van || typeof van !== 'object' || Array.isArray(van)) return;
      for (const k of Object.keys(van).slice(0, max)) { const w = f(van[k]); if (isId(k) && w !== null) naar[k] = w; }
    };
    kopieer(o.bekend, uit.bekend, 200, (w) => (Number.isFinite(w) ? nat(w, 4.1e12) : null));
    kopieer(o.beloond, uit.beloond, 50, (w) => (Number.isFinite(w) ? nat(w, 4.1e12) : null));
    kopieer(o.door, uit.door, 50, (w) => (w && typeof w === 'object' && (w.s === 'wacht' || w.s === 'klaar') ? { s: w.s, laatst: nat(w.laatst, 4.1e12) } : null));
    return uit;
  }
  let keten = Promise.resolve();
  function serieel(fn) { const r = keten.then(fn, fn); keten = r.catch(() => {}); return r; }
  const Lib = () => globalThis.SPOVrienden;
  async function laad() { return schoonStaat(await Lib().lees(SLEUTEL)); }
  function wijzig(fn) {
    return serieel(async () => {
      const s = schoonStaat(await Lib().lees(SLEUTEL));
      const r = await fn(s);
      await Lib().schrijf(SLEUTEL, s);
      return r;
    });
  }
  const actiefVriend = (st, id) => st.vrienden.find((v) => v.id === id && v.status === 'vriend' && !v.andereVersie);
  function noteerIn(s, st) {
    const nu = Date.now();
    for (const v of st.vrienden) if (v.status === 'vriend' && eigen(s.bekend, v.id) === undefined && Object.keys(s.bekend).length < 200) s.bekend[v.id] = nu;
  }

  // Onthoudt welke vrienden er nu al zijn en dat ik een uitnodigingslink gemaakt heb. Geeft de link terug.
  function maakMijnLink(st) {
    const code = Lib().maakCode(st.id, st.pub);
    return wijzig(async (s) => {
      noteerIn(s, st); // wie er al is, telt niet mee voor een beloning
      if (!s.link) s.link = Date.now();
      return maakLink(st.server, code);
    });
  }

  // ---- beloningen ----
  function itemNaam(res) {
    const E = globalThis.SPOEco;
    const it = res && E && E.PER_ID ? E.PER_ID.get(res.item) : null;
    return it ? it.naam : 'een item';
  }
  // Geeft de pakjes voor één beloning (het pakje zelf en eventueel een extra bij 1, 5 en 10). Aanroeper bewaakt het maximum.
  async function geefPakjes(s, rol, id) {
    const E = globalThis.SPOEco;
    if (!E || typeof E.gratisPakje !== 'function') return null;
    const res = await E.gratisPakje('normaal', 'Uitnodiging', `u:${rol}:${id}`);
    if (!res.ok) return res.reden === 'al-gehad' ? { teksten: [], dubbel: true } : null;
    s.n = Math.min(MAX_BELONINGEN, s.n + 1);
    const teksten = [`een gratis pakje met ${itemNaam(res)}`];
    const extra = eigen(MIJLPAAL, String(s.n));
    if (extra) {
      const r2 = await E.gratisPakje(extra, 'Uitnodiging ' + s.n, `um:${s.n}`);
      if (r2.ok) teksten.push(`een extra ${extra === 'groot' ? 'groot' : extra === 'klein' ? 'klein' : 'gewoon'} pakje (bonus voor ${s.n} ${s.n === 1 ? 'beloning' : 'beloningen'}) met ${itemNaam(r2)}`);
    }
    return { teksten };
  }

  // Na een synchronisatie: noteer vrienden, geef mijn pakje als ik via een uitnodiging kwam en bedank de uitnodiger.
  // Geeft { meldingen: [tekst], veranderd } terug.
  function onderhoud(st) {
    return wijzig(async (s) => {
      const uit = { meldingen: [], veranderd: false };
      noteerIn(s, st);
      const nu = Date.now();
      for (const v of st.vrienden) {
        if (v.via !== true || v.status !== 'vriend' || v.andereVersie || !isId(v.id)) continue;
        let d = eigen(s.door, v.id);
        if (d === undefined) {
          if (Object.keys(s.door).length >= 50) continue;
          d = { s: 'wacht', laatst: 0 };
          s.door[v.id] = d;
          if (s.n < MAX_BELONINGEN) {
            const r = await geefPakjes(s, 'ik', v.id);
            if (r && r.teksten.length) uit.meldingen.push(`Dankzij de uitnodiging van ${Lib().naam(v)} krijg je ${r.teksten.join(' en ')}.`);
          }
          uit.veranderd = true;
        }
        if (d.s === 'wacht' && nu - d.laatst >= HERHAAL) {
          d.laatst = nu;
          try { await Lib().stuurBericht(st, v, { t: 'uitnodiging-bedankt' }); } catch (e) { /* de volgende keer weer */ }
        }
      }
      return uit;
    });
  }

  // Berichten van een vriend: 'uitnodiging-bedankt' (hij kwam via mijn uitnodiging) en 'uitnodiging-ok' (hij hoeft niet meer te sturen).
  function opBerichten(st, van, lijst) {
    return wijzig(async (s) => {
      const uit = { meldingen: [], veranderd: false };
      const v = actiefVriend(st, van);
      if (!v || !Array.isArray(lijst)) return uit;
      noteerIn(s, st);
      for (const b of lijst) {
        const t = schoonBericht(b && b.m, b && b.leeftijd);
        if (!t) continue;
        if (t === 'uitnodiging-ok') {
          const d = eigen(s.door, van);
          if (d && d.s === 'wacht') { d.s = 'klaar'; uit.veranderd = true; }
          continue;
        }
        // 'uitnodiging-bedankt': alleen als ik een link maakte en deze vriend daarna pas in mijn lijst kwam
        if (eigen(s.beloond, van) === undefined) {
          const sinds = eigen(s.bekend, van);
          if (s.link && sinds !== undefined && sinds > s.link && s.n < MAX_BELONINGEN && Object.keys(s.beloond).length < 50) {
            const r = await geefPakjes(s, 'hij', van);
            if (r) {
              s.beloond[van] = Date.now();
              if (r.teksten.length) uit.meldingen.push(`${Lib().naam(v)} kwam via jouw uitnodiging. Jij krijgt ${r.teksten.join(' en ')}.`);
              uit.veranderd = true;
            }
          }
        }
        try { await Lib().stuurBericht(st, v, { t: 'uitnodiging-ok' }); } catch (e) { /* hij stuurt het straks nog eens */ }
      }
      return uit;
    });
  }

  // ---- het uitnodigvenster ----
  function el(tag, klas, tekst) {
    const e = document.createElement(tag);
    if (klas) e.className = klas;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }
  // c: { st, melding(tekst, fout), opgeslagen: async () => {} }
  async function toonVenster(c) {
    const link = await maakMijnLink(c.st);
    const s = await laad();
    let dlg = document.getElementById('uitnodig-venster');
    if (dlg) dlg.remove();
    dlg = el('dialog', 'uitnodig'); dlg.id = 'uitnodig-venster';
    dlg.setAttribute('aria-labelledby', 'un-titel');
    const kop = el('h2', '', 'Nodig een vriend uit'); kop.id = 'un-titel';
    dlg.append(kop);
    dlg.append(el('p', '', 'Stuur deze link naar een klasgenoot. Op de pagina staat hoe hij de extensie installeert en welke code hij nodig heeft.'));
    const rij = el('div', 'rij');
    const veld = el('input'); veld.type = 'text'; veld.readOnly = true; veld.dataset.tekstfilter = 'uit'; veld.id = 'un-link'; veld.value = link; veld.spellcheck = false;
    veld.setAttribute('aria-label', 'Uitnodigingslink');
    const kopieer = el('button', 'knop goud', 'Kopieer link'); kopieer.type = 'button'; kopieer.id = 'un-kopieer';
    kopieer.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); c.melding('Link gekopieerd. Stuur hem naar je vriend.'); }
      catch (e) { veld.select(); c.melding('Kopieer de geselecteerde link zelf (Ctrl+C).'); }
    });
    rij.append(veld, kopieer);
    dlg.append(rij);
    if (typeof navigator.share === 'function') {
      const del = el('button', 'knop klein', 'Delen...'); del.type = 'button';
      del.addEventListener('click', () => { navigator.share({ title: 'Somtoday Pack Opener', text: 'Doe mee met de Pack Opener:', url: link }).catch(() => {}); });
      dlg.append(del);
    }
    dlg.append(el('h3', '', 'Zo werkt het'));
    const ol = el('ol', 'un-stappen');
    ol.append(el('li', '', 'Je vriend opent de link, installeert de extensie (volg de uitleg op de pagina) en zet de vriendenfunctie aan.'));
    ol.append(el('li', '', 'Hij plakt de hele link bij ‘Code van een vriend invoeren’. Plakt hij alleen de code, dan vinkt hij ‘Ik kreeg deze code via een uitnodigingslink’ aan.'));
    ol.append(el('li', '', 'Jij accepteert zijn verzoek. Daarna krijgen jullie allebei een gratis pakje.'));
    dlg.append(ol);
    dlg.append(el('p', 'uitleg', 'Let op: de extensie staat niet in de Chrome Web Store of Firefox Add-ons. Je vriend moet hem dus zelf installeren, en dat kost een paar minuten. De link bevat alleen je vriendcode: geen naam en geen cijfers.'));
    const tel = el('p', 'un-tel', `Beloningen gebruikt: ${s.n} van ${MAX_BELONINGEN}. Extra pakjes krijg je bij de 1e, 5e en 10e beloning.`);
    tel.id = 'un-tel';
    dlg.append(tel);
    const dicht = el('button', 'knop klein', 'Sluiten'); dicht.type = 'button';
    dicht.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => dlg.remove());
    dlg.append(dicht);
    document.body.append(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    kopieer.focus();
    return dlg;
  }

  const lib = {
    SLEUTEL, MAX_BELONINGEN, TYPES, schoonBericht, schoonStaat, laad, maakLink, leesInvoer, maakMijnLink, onderhoud, opBerichten, toonVenster,
  };
  globalThis.SPOUitnodiging = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
