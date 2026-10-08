/*
 * Somtoday Pack Opener v2.2: het inlogscherm. Zonder account kun je de Pack Opener niet gebruiken.
 * Staat over het hele paneel (hub.html) en de popup heen tot je bent ingelogd. Na het inloggen komt je voortgang terug
 * (account.js) en laadt de pagina opnieuw. In het paneel komt bij Instellingen een blokje "Account".
 */
(function () {
  'use strict';
  const A = globalThis.SPOAccount;
  if (!A) return;
  const css = `
    .spo-poort { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px; overflow: auto;
      background: radial-gradient(120% 80% at 50% 0%, #1a1f3a 0%, #080a14 60%); color: #eef1f8; font: 15px/1.45 'SPO Text', system-ui, sans-serif; }
    .spo-poort .doos { width: 100%; max-width: 380px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); border-radius: 18px; padding: 24px 22px; }
    .spo-poort h1 { margin: 0 0 6px; font: 800 22px/1.2 'SPO Display', system-ui, sans-serif; }
    .spo-poort p { margin: 0 0 16px; color: #a5aec4; font-size: 14px; }
    .spo-poort label { display: block; font-size: 13px; color: #c9cfdd; margin: 12px 0 5px; }
    .spo-poort input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16);
      background: rgba(0,0,0,.3); color: #fff; font: inherit; }
    .spo-poort input:focus-visible { outline: 2px solid #ffd24a; outline-offset: 1px; }
    .spo-poort input.code { font-size: 24px; letter-spacing: .4em; text-align: center; }
    .spo-poort .knop { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 10px; cursor: pointer; font: 700 15px/1 system-ui, sans-serif;
      background: linear-gradient(135deg, #fff0b3 0%, #ffd24a 40%, #ff7a3d 100%); color: #2a1a00; }
    .spo-poort .knop[disabled] { opacity: .6; cursor: wait; }
    .spo-poort .links { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
    .spo-poort .link { background: none; border: 0; padding: 0; color: #ffd24a; font: inherit; font-size: 13.5px; cursor: pointer; text-decoration: underline; }
    .spo-poort .fout { color: #ff9a9a; font-size: 13.5px; margin-top: 12px; min-height: 1em; }
    .spo-poort .info { color: #9fe3b0; font-size: 13.5px; margin-top: 12px; }
    .spo-poort .tip, .spo-poort .waarschuwing { font-size: 13px; color: #ffe2a0; background: rgba(255,210,74,.08); border: 1px solid rgba(255,210,74,.3); border-radius: 10px; padding: 8px 10px; margin: 0 0 4px; }
    .spo-poort .waarschuwing { margin-top: 8px; color: #ffc9a0; border-color: rgba(255,140,60,.45); }
    .spo-poort .klein { font-size: 12.5px; color: #8a93aa; margin-top: 16px; }
  `;
  // Een adres van school: alleen cijfers voor de @, of een domein met school, college, lyceum enz.
  const lijktSchool = (e) => {
    const m = /^([^@]+)@(.+)$/.exec(String(e || '').trim().toLowerCase());
    return !!m && (/^[0-9]{4,}$/.test(m[1]) || /(college|school|scholen|lyceum|gymnasium|atheneum|scholengemeenschap|onderwijs|\.edu)/.test(m[2]));
  };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function toonPoort() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    const p = document.createElement('div');
    p.className = 'spo-poort';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', 'Inloggen');
    document.body.appendChild(p);
    const geheugen = { email: '', ww: '' }; // alleen in deze pagina, zolang je bezig bent
    let fase = 'inloggen';

    const scherm = {
      inloggen: () => `
        <h1>Inloggen</h1>
        <p>Log in om de Pack Opener te gebruiken. Zo raak je je kaarten, munten en vrienden nooit meer kwijt bij een update.</p>
        <form>
          <label for="p-email">E-mailadres</label><input id="p-email" type="email" autocomplete="email" required value="${esc(geheugen.email)}">
          <label for="p-ww">Wachtwoord</label><input id="p-ww" type="password" autocomplete="current-password" required>
          <button class="knop" type="submit">Inloggen</button>
        </form>
        <div class="fout" role="alert"></div>
        <div class="links"><button class="link" data-naar="maken" type="button">Account maken</button><button class="link" data-naar="vergeten" type="button">Wachtwoord vergeten?</button></div>`,
      maken: () => `
        <h1>Account maken</h1>
        <p>Je krijgt een code per e-mail om je adres te bevestigen. Je e-mailadres wordt niet bewaard, alleen een onleesbare versie ervan.</p>
        <p class="tip"><b>Tip:</b> gebruik je eigen e-mail (bijv. Gmail). Schoolmail blokkeert vaak mail van buiten de school, dan komt de code niet aan.</p>
        <form>
          <label for="p-email">E-mailadres</label><input id="p-email" type="email" autocomplete="email" required value="${esc(geheugen.email)}">
          <div class="waarschuwing" hidden>Dit lijkt een schoolmail. De code komt daar vaak niet aan. Gebruik liever je eigen e-mail.</div>
          <label for="p-ww">Wachtwoord (minstens 8 tekens)</label><input id="p-ww" type="password" autocomplete="new-password" minlength="8" required>
          <label for="p-ww2">Wachtwoord nog een keer</label><input id="p-ww2" type="password" autocomplete="new-password" minlength="8" required>
          <button class="knop" type="submit">Account maken</button>
        </form>
        <div class="fout" role="alert"></div>
        <div class="links"><button class="link" data-naar="inloggen" type="button">Ik heb al een account</button></div>
        <div class="klein">Onthoud je wachtwoord goed: je voortgang wordt ermee versleuteld. Ben je het kwijt, dan kun je een nieuw wachtwoord maken, maar alleen de gegevens in deze browser blijven dan bewaard.</div>`,
      code: () => `
        <h1>Check je mail</h1>
        <p>We hebben een code van 6 cijfers gestuurd naar <b>${esc(geheugen.email)}</b>. Kijk ook in je spam.</p>
        ${lijktSchool(geheugen.email) ? '<p class="tip">Geen code na een paar minuten? Schoolmail blokkeert vaak mail van buiten. Ga terug en maak een account met je eigen e-mail (bijv. Gmail).</p>' : ''}
        <form>
          <label for="p-code">Code</label><input id="p-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
          <button class="knop" type="submit">Bevestigen</button>
        </form>
        <div class="fout" role="alert"></div>
        <div class="links"><button class="link" data-actie="opnieuw" type="button">Code opnieuw sturen</button><button class="link" data-naar="inloggen" type="button">Terug</button></div>`,
      vergeten: () => `
        <h1>Wachtwoord vergeten</h1>
        <p>Vul je e-mailadres in. Je krijgt een code om een nieuw wachtwoord te maken.</p>
        <form>
          <label for="p-email">E-mailadres</label><input id="p-email" type="email" autocomplete="email" required value="${esc(geheugen.email)}">
          <button class="knop" type="submit">Code sturen</button>
        </form>
        <div class="fout" role="alert"></div>
        <div class="links"><button class="link" data-naar="inloggen" type="button">Terug</button></div>`,
      reset: () => `
        <h1>Nieuw wachtwoord</h1>
        <p>Als er een account bestaat met <b>${esc(geheugen.email)}</b>, hebben we een code gestuurd.</p>
        <form>
          <label for="p-code">Code</label><input id="p-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
          <label for="p-ww">Nieuw wachtwoord (minstens 8 tekens)</label><input id="p-ww" type="password" autocomplete="new-password" minlength="8" required>
          <button class="knop" type="submit">Opslaan en inloggen</button>
        </form>
        <div class="fout" role="alert"></div>
        <div class="links"><button class="link" data-naar="inloggen" type="button">Terug</button></div>
        <div class="klein">Met een nieuw wachtwoord is je oude back-up niet meer te lezen. Wat in deze browser staat, wordt opnieuw opgeslagen.</div>`,
      klaar: () => `
        <h1>Gelukt!</h1>
        <p class="info" role="status">Je bent ingelogd. Je voortgang wordt opgehaald...</p>`,
    };

    function teken(nieuw) {
      if (nieuw) fase = nieuw;
      p.innerHTML = `<div class="doos">${scherm[fase]()}</div>`;
      const eerste = p.querySelector('input:not([value]), input[value=""], input');
      if (eerste) eerste.focus();
      const f = p.querySelector('form');
      if (f) f.addEventListener('submit', (e) => { e.preventDefault(); verstuur(); });
      for (const b of p.querySelectorAll('[data-naar]')) b.addEventListener('click', () => teken(b.dataset.naar));
      const em = p.querySelector('#p-email'), wa = p.querySelector('.waarschuwing');
      if (em && wa) { const k = () => (wa.hidden = !lijktSchool(em.value)); em.addEventListener('input', k); k(); }
      const op = p.querySelector('[data-actie="opnieuw"]');
      if (op) op.addEventListener('click', () => doe(() => A.codeOpnieuw(geheugen.email).then(() => melding('Er is een nieuwe code onderweg.'))));
    }
    const fout = (t) => { const f = p.querySelector('.fout'); if (f) { f.className = 'fout'; f.textContent = t; } };
    const melding = (t) => { const f = p.querySelector('.fout'); if (f) { f.className = 'info'; f.textContent = t; } };
    const waarde = (id) => { const e = p.querySelector('#' + id); return e ? e.value : ''; };
    async function doe(fn) {
      const knop = p.querySelector('.knop');
      if (knop) knop.disabled = true;
      fout('');
      try { await fn(); } catch (e) { fout(e && e.message ? e.message : 'Er ging iets mis.'); } finally { if (knop && knop.isConnected) knop.disabled = false; }
    }
    async function klaar(r) {
      teken('klaar');
      const tekst = p.querySelector('.info');
      if (tekst) tekst.textContent = r && r.teruggezet ? 'Je voortgang is teruggezet. Even geduld...' : 'Je bent ingelogd. Even geduld...';
      setTimeout(() => location.reload(), 900);
    }
    function verstuur() {
      if (fase === 'inloggen') {
        geheugen.email = waarde('p-email').trim();
        geheugen.ww = waarde('p-ww');
        return doe(async () => {
          try {
            await klaar(await A.login(geheugen.email, geheugen.ww));
          } catch (e) {
            if (e.data && e.data.nietBevestigd) return teken('code');
            throw e;
          }
        });
      }
      if (fase === 'maken') {
        geheugen.email = waarde('p-email').trim();
        geheugen.ww = waarde('p-ww');
        if (geheugen.ww.length < 8) return fout('Je wachtwoord moet minstens 8 tekens hebben.');
        if (geheugen.ww !== waarde('p-ww2')) return fout('De twee wachtwoorden zijn niet hetzelfde.');
        return doe(async () => { await A.registreer(geheugen.email, geheugen.ww); teken('code'); });
      }
      if (fase === 'code') return doe(async () => klaar(await A.verifieer(geheugen.email, waarde('p-code').trim(), geheugen.ww)));
      if (fase === 'vergeten') {
        geheugen.email = waarde('p-email').trim();
        return doe(async () => { await A.vergeten(geheugen.email); teken('reset'); });
      }
      if (fase === 'reset') {
        const ww = waarde('p-ww');
        if (ww.length < 8) return fout('Je wachtwoord moet minstens 8 tekens hebben.');
        return doe(async () => klaar(await A.reset(geheugen.email, waarde('p-code').trim(), ww)));
      }
    }
    teken('inloggen');
  }

  // Het blokje "Account" bij Instellingen in het paneel.
  function accountBlok(st) {
    const paneel = document.getElementById('paneel-instellingen');
    if (!paneel) return;
    const d = document.createElement('div');
    const tijd = st.laatsteBackup ? new Date(st.laatsteBackup).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : 'nog niet';
    d.innerHTML = `<h3 class="sectie">Account</h3>
      <p class="onder">Ingelogd als <b>${esc(st.email)}</b>. Je voortgang wordt automatisch versleuteld opgeslagen. Laatste back-up: <span class="spo-acc-tijd">${esc(tijd)}</span>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px">
        <button type="button" class="knop" data-acc="nu">Nu opslaan</button>
        <button type="button" class="knop" data-acc="uit">Uitloggen</button>
        <button type="button" class="knop" data-acc="weg">Account verwijderen</button>
      </div><p class="onder spo-acc-melding" role="status"></p>`;
    const kop = paneel.querySelector('.pagina-kop');
    if (kop && kop.nextSibling) paneel.insertBefore(d, kop.nextSibling);
    else paneel.appendChild(d);
    const meld = (t) => { d.querySelector('.spo-acc-melding').textContent = t; };
    d.querySelector('[data-acc="nu"]').addEventListener('click', async () => {
      meld('Bezig...');
      try { await A.bewaar(); meld('Opgeslagen.'); d.querySelector('.spo-acc-tijd').textContent = new Date().toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { meld(e.message); }
    });
    d.querySelector('[data-acc="uit"]').addEventListener('click', async () => {
      if (!confirm('Uitloggen? Je voortgang blijft in je account bewaard.')) return;
      await A.uitloggen();
      location.reload();
    });
    d.querySelector('[data-acc="weg"]').addEventListener('click', async () => {
      if (!confirm('Je account en de back-up op de server worden verwijderd. Wat in deze browser staat blijft. Doorgaan?')) return;
      try { await A.verwijder(); location.reload(); } catch (e) { meld(e.message); }
    });
  }

  function start() {
    A.status().then((st) => {
      if (!st.ingelogd) toonPoort();
      else accountBlok(st);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
