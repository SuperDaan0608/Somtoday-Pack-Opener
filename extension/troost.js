/*
 * Somtoday Pack Opener v3.0 (content script): het troostpakje.
 * Haal je een onvoldoende (onder de 5,5), dan krijg je na het sluiten van de animatie een gratis klein pakje en een paar munten,
 * met een vriendelijk zinnetje. Het uitdelen zelf (één keer per kaart, hoogstens 3 per dag) staat in economie.js: SPOEco.troostPakje().
 * Aangeroepen vanuit content.js (opGesloten van open()). Ook als de kaart vervloekt is. Het huisdier leeft mee als het zichtbaar is.
 * Niets verlaat deze browser.
 */
(function () {
  'use strict';

  // Korte, vriendelijke zinnetjes (niet betuttelend). {c} wordt het cijfer, bijvoorbeeld "4,2".
  const TEKSTEN = [
    'Een {c} is geen eindoordeel. Hier, een pakje.',
    'Dat ging even anders dan je wilde. Dit pakje is van mij.',
    'Elke topper heeft weleens een {c} gehaald.',
    'Het volgende cijfer is weer een nieuwe kans. Pak dit maar vast.',
    'Eén toets zegt niet alles over jou. Een pakje erbij.',
    'Je bent meer dan een cijfer. Kijk eens wat erin zit.',
    'Een leermoment en een pakje. Deal?',
    'Morgen weer een dag. Vandaag een pakje.',
    'Je hebt het geprobeerd, en dat telt. Hier is iets leuks.',
    'Een {c} nu, een beter plan voor de volgende. Pak dit alvast.',
    'Zolang je blijft proberen, ben je goed bezig.',
    'Even een troostpakje voor onderweg. Je komt er wel.',
    'Niet leuk, wel te herstellen. Succes met de volgende!',
    'Dit voelt vast niet fijn. Een pakje helpt misschien een beetje.',
  ];
  const HUISDIER = ['Kop op. Ik blijf bij je.', 'Samen komen we er wel.', 'Ik geloof in de volgende!', 'Kom hier, een knuffel.'];
  const fmt = (c) => String(Math.round(c * 10) / 10).replace('.', ',');
  let laatste = -1;
  // Kiest een zinnetje; nooit twee keer hetzelfde achter elkaar. r (0..1) is voor tests.
  function tekstVoor(cijfer, r) {
    let i = Math.floor((r == null ? Math.random() : r) * TEKSTEN.length) % TEKSTEN.length;
    if (i === laatste) i = (i + 1) % TEKSTEN.length;
    laatste = i;
    return TEKSTEN[i].replace('{c}', fmt(cijfer));
  }

  let host = null;
  function toon(uit, tekst) {
    if (!document.body) return;
    if (host) host.remove();
    const E = globalThis.SPOEco;
    const it = E && E.PER_ID.get(uit.item);
    host = document.createElement('spo-troost');
    host.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;display:block;width:min(380px,calc(100vw - 24px));';
    const w = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      .k { display: flex; gap: 12px; align-items: flex-start; padding: 12px 12px 12px 14px; border-radius: 16px; color: #eef1f8; background: #14182e;
        border: 1px solid rgba(255,210,74,.55); box-shadow: 0 16px 40px -8px rgba(0,0,0,.75); font: 600 14px/1.35 system-ui, sans-serif; animation: erin .45s cubic-bezier(.2,1.2,.4,1); }
      .i { font-size: 28px; line-height: 1; animation: wip 1.4s ease-in-out .5s 2; }
      .t { flex: 1; min-width: 0; }
      .kop { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #ffd24a; font-weight: 800; }
      .z { margin: 3px 0 6px; font-size: 15px; font-weight: 700; }
      .o { font-size: 12.5px; font-weight: 500; color: #a5aec4; }
      .o b { color: #ffe27a; font-weight: 700; }
      button { flex: none; background: none; border: 0; color: #fff; opacity: .6; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
      button:hover, button:focus-visible { opacity: 1; }
      .k.weg { animation: uit .3s ease forwards; }
      @keyframes erin { from { opacity: 0; transform: translateY(24px); } }
      @keyframes uit { to { opacity: 0; transform: translateY(24px); } }
      @keyframes wip { 0%, 100% { transform: none; } 30% { transform: rotate(-12deg) scale(1.1); } 60% { transform: rotate(10deg) scale(1.1); } }
      @media (prefers-reduced-motion: reduce) { .k, .i, .k.weg { animation: none; } }`;
    const k = document.createElement('div'); k.className = 'k'; k.setAttribute('role', 'status');
    const i = document.createElement('span'); i.className = 'i'; i.setAttribute('aria-hidden', 'true'); i.textContent = '\u{1F381}';
    const t = document.createElement('div'); t.className = 't';
    const kop = document.createElement('div'); kop.className = 'kop'; kop.textContent = 'Troostpakje';
    const z = document.createElement('div'); z.className = 'z'; z.textContent = tekst;
    const o = document.createElement('div'); o.className = 'o';
    const naam = it ? it.naam : 'een verrassing';
    const zeld = it && E.ZELD ? E.ZELD[it.zeld] : '';
    o.append(document.createTextNode(uit.dubbel ? 'Je had ' : 'Je kreeg: '));
    const b = document.createElement('b'); b.textContent = naam; o.append(b);
    o.append(document.createTextNode((zeld ? ' (' + zeld.toLowerCase() + ')' : '') + (uit.dubbel ? ' al, dus je krijgt ' + uit.terug + ' munten terug' : '') + `, plus ${uit.munten} munten.`));
    t.append(kop, z, o);
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Sluiten'); x.textContent = '×';
    const weg = () => { k.classList.add('weg'); setTimeout(() => { if (host === mijn) { host.remove(); host = null; } }, 300); };
    x.addEventListener('click', weg);
    k.append(i, t, x);
    w.append(st, k);
    document.documentElement.appendChild(host);
    const mijn = host;
    setTimeout(weg, 11000);
  }

  // Wordt aangeroepen nadat de animatie van een onvoldoende is gesloten.
  // Geeft de uitkomst van troostPakje terug ({ ok:false, reden } als er niets te geven was).
  async function na(o) {
    const E = globalThis.SPOEco;
    if (!E || !E.troostPakje || !o || typeof o.id !== 'string') return { ok: false, reden: 'ongeldig' };
    let uit;
    try { uit = await E.troostPakje(o.id, Number(o.cijfer)); } catch (e) { return { ok: false, reden: 'fout' }; }
    if (!uit || !uit.ok) return uit || { ok: false, reden: 'fout' };
    const tekst = tekstVoor(Number(o.cijfer));
    try { toon(uit, tekst); } catch (e) { /* geen toast is ook goed */ }
    try { if (globalThis.SPOHuisdier && globalThis.SPOHuisdier.zeg) globalThis.SPOHuisdier.zeg(HUISDIER[Math.floor(Math.random() * HUISDIER.length)]); } catch (e) { /* geen huisdier */ }
    return Object.assign({ tekst }, uit);
  }

  globalThis.SPOTroost = { TEKSTEN, tekstVoor, na };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SPOTroost;
})();
