/*
 * Somtoday Pack Opener v2.4: je huisdier.
 * Een klein draakje linksonder op Somtoday dat leeft van je cijfers. Elke kaart die je opent geeft XP (hoger cijfer = meer,
 * een zeldzamere kaart geeft een bonus). Met genoeg XP groeit het: ei, draakje, jong draakje, groot draakje, legendarische draak.
 * Het is blij na een voldoende, verdrietig na een onvoldoende en slaapt 's nachts. Getekend met SVG en CSS in een shadow DOM.
 *
 * Opslag (chrome.storage.local): spo_huisdier { v: 1, xp, ids: [kaarten die al XP gaven], humeur: { s: 'blij' | 'verdrietig', ts }, gezien: stadium }
 * De sleutel zit in de back-up van je account (account.js): bij het samenvoegen wint de hoogste xp.
 * Instelling 'huisdier' (Instellingen, standaard aan) verbergt het beestje. Respecteert prefers-reduced-motion.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const SLEUTEL = 'spo_huisdier';

  // ───────── Stadia en XP (zonder DOM, dus ook te testen) ─────────
  const STADIA = [
    { naam: 'Ei', vanaf: 0 },
    { naam: 'Draakje', vanaf: 25 },
    { naam: 'Jong draakje', vanaf: 100 },
    { naam: 'Groot draakje', vanaf: 250 },
    { naam: 'Legendarische draak', vanaf: 500 },
  ];
  const TREDE_BONUS = [0, 8, 20, 45, 90]; // gewoon, zeldzaam, glim, kosmisch, mythisch
  function stadiumVan(xp) {
    let s = 0;
    for (let i = 0; i < STADIA.length; i++) if (xp >= STADIA[i].vanaf) s = i;
    return s;
  }
  // XP voor één geopende kaart: twee per cijferpunt (een 7,5 geeft 15), plus een bonus voor de trede.
  function xpVoor(cijfer, trede) {
    const c = Number(cijfer);
    if (!(c >= 1 && c <= 10)) return 0;
    return Math.max(2, Math.round(c * 2)) + TREDE_BONUS[Math.max(0, Math.min(4, trede | 0))];
  }
  const slaapt = (d) => { const u = (d || new Date()).getHours(); return u >= 22 || u < 7; }; // 's nachts van 22:00 tot 7:00
  const HUMEUR_DUUR = 6 * 3600 * 1000; // na 6 uur is het beestje weer gewoon rustig
  function humeurVan(opslag, nu) {
    const h = opslag && opslag.humeur;
    if (h && (h.s === 'blij' || h.s === 'verdrietig') && nu - (h.ts || 0) < HUMEUR_DUUR && nu >= (h.ts || 0)) return h.s;
    return 'rustig';
  }
  function schoon(o) {
    const x = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    return {
      v: 1,
      xp: Number.isFinite(x.xp) && x.xp > 0 ? Math.min(1e7, Math.floor(x.xp)) : 0,
      ids: (Array.isArray(x.ids) ? x.ids : []).filter((i) => typeof i === 'string').slice(-400),
      humeur: x.humeur && (x.humeur.s === 'blij' || x.humeur.s === 'verdrietig') && Number.isFinite(x.humeur.ts) ? { s: x.humeur.s, ts: x.humeur.ts } : null,
      gezien: Number.isInteger(x.gezien) ? Math.max(0, Math.min(4, x.gezien)) : 0,
    };
  }

  // ───────── De tekening ─────────
  const KLEUR = [
    { l: '#fff5dc', m: '#f1e2bd', d: '#cdb784' },               // ei
    { l: '#a8f0b4', m: '#5fd57a', d: '#2f9c4f', buik: '#e9ffd8' }, // draakje
    { l: '#8fdcff', m: '#3fb4f0', d: '#1c7ab8', buik: '#e0f6ff' }, // jong
    { l: '#c9a8ff', m: '#8f63f0', d: '#5a35b0', buik: '#efe3ff' }, // groot
    { l: '#fff3a8', m: '#ffcc33', d: '#d98a0a', buik: '#fff8d6' }, // legendarisch
  ];
  const INKT = '#1b1630';

  function gezicht(cx, cy, s, humeur, slaap) {
    const ox = 7 * s;
    const oog = (x) => {
      if (slaap) return `<path d="M${x - 3 * s} ${cy} Q${x} ${cy + 3.2 * s} ${x + 3 * s} ${cy}" fill="none" stroke="${INKT}" stroke-width="${1.7 * s}" stroke-linecap="round"/>`;
      if (humeur === 'blij') return `<path d="M${x - 3.2 * s} ${cy + 1.2 * s} Q${x} ${cy - 4 * s} ${x + 3.2 * s} ${cy + 1.2 * s}" fill="none" stroke="${INKT}" stroke-width="${1.9 * s}" stroke-linecap="round"/>`;
      return `<g class="oog"><ellipse cx="${x}" cy="${cy}" rx="${2.7 * s}" ry="${3.3 * s}" fill="${INKT}"/><circle cx="${x + 0.9 * s}" cy="${cy - 1.2 * s}" r="${1 * s}" fill="#fff"/></g>`;
    };
    let t = oog(cx - ox) + oog(cx + ox);
    if (humeur === 'blij' && !slaap) t += `<ellipse cx="${cx - ox - 2.5 * s}" cy="${cy + 4.5 * s}" rx="${2.6 * s}" ry="${1.7 * s}" fill="#ff7b9c" opacity=".55"/><ellipse cx="${cx + ox + 2.5 * s}" cy="${cy + 4.5 * s}" rx="${2.6 * s}" ry="${1.7 * s}" fill="#ff7b9c" opacity=".55"/>`;
    if (humeur === 'verdrietig' && !slaap) {
      t += `<path d="M${cx - ox - 3.5 * s} ${cy - 3.6 * s} L${cx - ox + 3.2 * s} ${cy - 6 * s} M${cx + ox + 3.5 * s} ${cy - 3.6 * s} L${cx + ox - 3.2 * s} ${cy - 6 * s}" stroke="${INKT}" stroke-width="${1.4 * s}" stroke-linecap="round"/>`;
      t += `<path class="traan" d="M${cx + ox + 1 * s} ${cy + 3.4 * s} q${1.8 * s} ${3 * s} 0 ${4.6 * s} q${-1.8 * s} ${-1.6 * s} 0 ${-4.6 * s}z" fill="#6cc8ff"/>`;
    }
    let mond;
    if (slaap) mond = `<ellipse cx="${cx}" cy="${cy + 7 * s}" rx="${1.7 * s}" ry="${1.3 * s}" fill="${INKT}" opacity=".8"/>`;
    else if (humeur === 'blij') mond = `<path d="M${cx - 4.2 * s} ${cy + 5.6 * s} Q${cx} ${cy + 11 * s} ${cx + 4.2 * s} ${cy + 5.6 * s}Z" fill="#7a1f3a" stroke="${INKT}" stroke-width="${1.1 * s}" stroke-linejoin="round"/>`;
    else if (humeur === 'verdrietig') mond = `<path d="M${cx - 3.6 * s} ${cy + 9 * s} Q${cx} ${cy + 5 * s} ${cx + 3.6 * s} ${cy + 9 * s}" fill="none" stroke="${INKT}" stroke-width="${1.5 * s}" stroke-linecap="round"/>`;
    else mond = `<path d="M${cx - 3.4 * s} ${cy + 6 * s} Q${cx} ${cy + 9 * s} ${cx + 3.4 * s} ${cy + 6 * s}" fill="none" stroke="${INKT}" stroke-width="${1.5 * s}" stroke-linecap="round"/>`;
    return t + mond;
  }
  const hoorn = (x, y, w, h, k, flip) => `<path d="M${x - w} ${y} L${x + (flip ? -w * 0.2 : w * 0.2)} ${y - h} L${x + w} ${y}Z" fill="${k.d}"/>`;

  // stadium 0..4, humeur 'blij' | 'verdrietig' | 'rustig', slaap: true/false, voortgang 0..1 (hoe dichtbij het volgende stadium)
  function teken(stadium, humeur, slaap, voortgang) {
    const k = KLEUR[stadium];
    const sh = '<ellipse cx="50" cy="93" rx="24" ry="4" fill="#000" opacity=".22"/>';
    let d = '';
    if (stadium === 0) {
      const barst = voortgang > 0.6 ? `<path d="M40 24 l5 7 -6 5 7 7 -4 6" fill="none" stroke="${k.d}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      d = `${sh}<g class="ei"><path d="M50 12 C70 12 82 50 82 66 C82 82 68 92 50 92 C32 92 18 82 18 66 C18 50 30 12 50 12Z" fill="${k.m}" stroke="${k.d}" stroke-width="2"/>
        <circle cx="37" cy="46" r="5.5" fill="#7bd88f" opacity=".85"/><circle cx="62" cy="60" r="6.5" fill="#7bd88f" opacity=".85"/><circle cx="43" cy="74" r="4.5" fill="#7bd88f" opacity=".85"/><circle cx="60" cy="34" r="3.6" fill="#7bd88f" opacity=".85"/>
        <ellipse cx="36" cy="32" rx="4" ry="9" fill="#fff" opacity=".5" transform="rotate(-18 36 32)"/>${barst}
        ${slaap ? '' : humeur === 'blij' ? `<path d="M80 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z M16 40 l1.5 3.6 3.6 1.5 -3.6 1.5 -1.5 3.6 -1.5 -3.6 -3.6 -1.5 3.6 -1.5z" fill="#ffd24a" stroke="#d98a0a" stroke-width=".8" stroke-linejoin="round"/>` : humeur === 'verdrietig' ? `<path class="traan" d="M78 30 q5 7 0 11 q-5 -4 0 -11z" fill="#6cc8ff"/>` : ''}</g>`;
    } else if (stadium === 1) {
      d = `${sh}<g class="lijf">
        <path class="vleugel" d="M27 60 Q12 50 14 38 Q26 42 33 54Z" fill="${k.d}"/><path class="vleugel r" d="M73 60 Q88 50 86 38 Q74 42 67 54Z" fill="${k.d}"/>
        <path class="staart" d="M70 78 Q90 78 88 64 Q86 72 72 70Z" fill="${k.m}"/>
        <circle cx="50" cy="62" r="29" fill="${k.m}"/><ellipse cx="50" cy="72" rx="17" ry="14" fill="${k.buik}" opacity=".9"/>
        ${hoorn(37, 36, 4.5, 10, k, true)}${hoorn(63, 36, 4.5, 10, k, false)}
        ${gezicht(50, 58, 1.15, humeur, slaap)}
        <path d="M18 84 L26 74 L34 84 L42 74 L50 84 L58 74 L66 84 L74 74 L82 84 L80 92 Q50 99 20 92Z" fill="${KLEUR[0].l}" stroke="${KLEUR[0].d}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
    } else {
      const g = stadium === 2 ? { bx: 21, by: 18, hr: 17, hy: 36, vl: 0.8 } : stadium === 3 ? { bx: 24, by: 21, hr: 19, hy: 35, vl: 1 } : { bx: 24, by: 21, hr: 19, hy: 35, vl: 1.12 };
      const by = 66;
      const vleugel = (flip) => {
        const x = (v) => (flip ? 100 - v : v);
        const w = g.vl;
        return `<path class="vleugel${flip ? ' r' : ''}" d="M${x(32)} ${by - 8} Q${x(32 - 26 * w)} ${by - 30 * w} ${x(32 - 22 * w)} ${by - 46 * w} Q${x(32 - 12 * w)} ${by - 38 * w} ${x(30 - 8 * w)} ${by - 40 * w} Q${x(28 - 4 * w)} ${by - 28 * w} ${x(24 - 2 * w)} ${by - 26 * w} Q${x(30)} ${by - 18} ${x(36)} ${by - 6}Z" fill="${k.d}" stroke="${k.d}" stroke-width="1" stroke-linejoin="round" opacity=".95"/>`;
      };
      const stekels = stadium >= 3 ? [50, 40, 60].map((x, i) => `<path d="M${x - 3.4} ${g.hy - g.hr + (i ? 2.5 : 0.5)} L${x} ${g.hy - g.hr - 8 + (i ? 3 : 0)} L${x + 3.4} ${g.hy - g.hr + (i ? 2.5 : 0.5)}Z" fill="${k.d}"/>`).join('') : '';
      const aura = stadium === 4 ? `<defs><radialGradient id="au"><stop offset="0" stop-color="#fff3a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffcc33" stop-opacity="0"/></radialGradient></defs><circle class="aura" cx="50" cy="56" r="52" fill="url(#au)"/>` : '';
      const kroon = stadium === 4 ? `<path d="M38 ${g.hy - g.hr - 1} L41 ${g.hy - g.hr - 12} L46 ${g.hy - g.hr - 5} L50 ${g.hy - g.hr - 15} L54 ${g.hy - g.hr - 5} L59 ${g.hy - g.hr - 12} L62 ${g.hy - g.hr - 1}Z" fill="#fff3a8" stroke="#d98a0a" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="${g.hy - g.hr - 12}" r="1.8" fill="#ff5e7e"/>` : '';
      const ster = stadium === 4 ? `<path d="M50 ${by - 6} l2.4 5 5.4.7 -4 3.7 1 5.4 -4.8 -2.7 -4.8 2.7 1 -5.4 -4 -3.7 5.4 -.7z" fill="#ff9a1f" opacity=".9"/>` : '';
      const buikStreep = stadium === 3 ? [-6, 0, 6].map((o) => `<path d="M${50 - 11} ${by + o + 2} Q50 ${by + o + 6} ${50 + 11} ${by + o + 2}" fill="none" stroke="${k.m}" stroke-width="1.3" opacity=".6"/>`).join('') : '';
      d = `${aura}${sh}<g class="lijf">
        ${vleugel(false)}${vleugel(true)}
        <path class="staart" d="M${50 + g.bx - 4} ${by + 8} Q${95} ${by + 10} ${92} ${by - 8} Q${88} ${by + 2} ${50 + g.bx - 6} ${by + 1}Z" fill="${k.m}"/>
        <ellipse cx="50" cy="${by}" rx="${g.bx}" ry="${g.by}" fill="${k.m}"/><ellipse cx="50" cy="${by + 4}" rx="${g.bx - 8}" ry="${g.by - 6}" fill="${k.buik}" opacity=".92"/>${buikStreep}${ster}
        <ellipse cx="38" cy="${by + g.by - 2}" rx="8" ry="4.5" fill="${k.d}"/><ellipse cx="62" cy="${by + g.by - 2}" rx="8" ry="4.5" fill="${k.d}"/>
        ${stekels}
        ${hoorn(40, g.hy - g.hr + 4, 4.2, 11 + (stadium >= 3 ? 3 : 0), k, true)}${hoorn(60, g.hy - g.hr + 4, 4.2, 11 + (stadium >= 3 ? 3 : 0), k, false)}
        <circle cx="50" cy="${g.hy}" r="${g.hr}" fill="${k.m}"/><ellipse cx="50" cy="${g.hy + g.hr * 0.5}" rx="${g.hr * 0.62}" ry="${g.hr * 0.42}" fill="${k.l}"/>
        ${gezicht(50, g.hy - 1, g.hr / 15.5, humeur, slaap)}${kroon}</g>`;
    }
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${d}</svg>`;
  }

  const lib = { STADIA, TREDE_BONUS, stadiumVan, xpVoor, slaapt, humeurVan, schoon, teken, SLEUTEL };
  if (typeof window === 'undefined' || typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = lib; return; }
  if (window.__spoHuisdier) return;
  window.__spoHuisdier = true;

  // ───────── Op de pagina ─────────
  const reduceer = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const PRATEN = {
    ei: ['Het ei trilt een beetje... er zit iets in.', 'Open een cijfer, dan kom ik er misschien uit!', 'Tok tok? Nee, ik ben nog een ei.', 'Ik hoor je cijfers. Bijna... bijna...'],
    blij: ['Wat een mooi cijfer! Ik word er helemaal blij van.', 'Dat ging goed! Mag ik een rondje vliegen?', 'Jij kunt dat, hoor. Lekker bezig!', 'Dit smaakt naar meer.'],
    verdrietig: ['Een onvoldoende... maar het volgende cijfer komt vanzelf.', 'Geeft niks. Ik blijf bij je zitten.', 'Even een knuffel. Daarna weer door.', 'Ik geloof in je, ook als het tegenzit.'],
    rustig: ['Heb je al een cijfer geopend? Ik heb honger naar XP.', 'Vergeet niet water te drinken!', 'Tip: een zeldzame kaart geeft mij extra veel XP.', 'Ik hou je rooster in de gaten. Niks aan de hand.', 'Zullen we samen groeien?', 'Hoe hoger het cijfer, hoe meer XP. Maar ik vind elk cijfer leuk.'],
    legendarisch: ['Ik ben legendarisch en jij bent mijn trainer.', 'Zie je dat glimmen? Dat is allemaal door jouw cijfers.'],
    slaap: ['Zzz... laat me nog even slapen... morgen weer.', 'Mmm... nog vijf minuutjes...'],
  };
  const kies = (a) => a[Math.floor(Math.random() * a.length)];

  let host = null, wortel = null, knop = null, bol = null, stat = { xp: 0, ids: [], humeur: null, gezien: 0 };
  let instelling = true, bubbelTimer = 0, laatstGetekend = '';

  function zorgHost() {
    if (host && host.isConnected) return;
    host = document.createElement('spo-huisdier');
    wortel = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      :host { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; width: 84px; height: 84px; pointer-events: none; font: 600 13px/1.35 system-ui, sans-serif; }
      button.dier { appearance: none; border: 0; background: none; padding: 0; margin: 0; color: inherit; font: inherit; box-sizing: border-box; position: absolute; inset: 0; cursor: pointer; pointer-events: auto; border-radius: 22px; -webkit-tap-highlight-color: transparent; }
      button.dier:focus-visible { outline: 3px solid #f2c94c; outline-offset: 2px; }
      .dier svg { display: block; overflow: visible; filter: drop-shadow(0 4px 6px rgba(0,0,0,.25)); }
      .dier { animation: bob 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
      :host(.slaap) .dier { animation: adem 4.4s ease-in-out infinite; }
      .ei { animation: wiebel 5s ease-in-out infinite; transform-origin: 50% 92%; transform-box: view-box; }
      .oog { animation: knip 5s infinite; transform-origin: center; transform-box: fill-box; }
      .vleugel { animation: klap 2.6s ease-in-out infinite; transform-origin: 32px 58px; transform-box: view-box; }
      .vleugel.r { transform-origin: 68px 58px; animation-direction: reverse; }
      .staart { animation: kwispel 2.2s ease-in-out infinite; transform-origin: 70px 74px; transform-box: view-box; }
      .aura { animation: gloei 3s ease-in-out infinite; transform-origin: 50% 56%; transform-box: view-box; }
      .traan { animation: traan 2.4s ease-in infinite; }
      .dier.spring { animation: spring .6s cubic-bezier(.3,1.6,.5,1); }
      .dier.evo { animation: evo 1.7s ease-in-out; }
      .zzz { position: absolute; left: 52px; top: -6px; font: 800 15px system-ui, sans-serif; color: #4a58c9; text-shadow: 0 0 3px #fff, 0 0 6px #fff; pointer-events: none; }
      .zzz span { position: absolute; opacity: 0; animation: zzz 3.4s ease-in-out infinite; }
      .zzz span:nth-child(2) { animation-delay: 1.1s; font-size: 12px; }
      .zzz span:nth-child(3) { animation-delay: 2.2s; font-size: 17px; }
      .bol { position: absolute; left: 6px; bottom: 94px; width: max-content; max-width: min(240px, calc(100vw - 40px)); padding: 9px 12px; border-radius: 14px; background: #fff; color: #1b1630; pointer-events: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,.35); animation: pop .3s cubic-bezier(.2,1.5,.4,1); transform-origin: 20px 100%; }
      .bol::after { content: ''; position: absolute; left: 22px; bottom: -7px; width: 14px; height: 14px; background: #fff; transform: rotate(45deg); border-radius: 0 0 4px 0; }
      .bol small { display: block; margin-top: 3px; font-weight: 500; font-size: 11.5px; color: #5b5470; }
      .bol .st { display: block; margin-top: 6px; height: 5px; border-radius: 3px; background: #e6e1f2; overflow: hidden; }
      .bol .st i { display: block; height: 100%; background: linear-gradient(90deg, #5fd57a, #ffcc33); }
      .vonk { position: absolute; left: 38px; top: 38px; width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(#fff, #ffe27a 60%, transparent 70%); pointer-events: none; opacity: 0; animation: vonk 1.4s ease-out forwards; }
      .flits { position: absolute; inset: -30px; border-radius: 50%; background: radial-gradient(circle, #fff 0, #fff8 30%, transparent 65%); pointer-events: none; opacity: 0; animation: flits 1.7s ease-in-out; }
      .tel { position: absolute; right: -2px; top: -2px; min-width: 18px; padding: 0 5px; border-radius: 999px; background: #14162a; color: #ffd24a; border: 1.5px solid #ffd24a; font: 800 10px/16px system-ui, sans-serif; text-align: center; pointer-events: none; }
      @keyframes bob { 0%, 100% { transform: translateY(0) scale(1, 1); } 50% { transform: translateY(-3px) scale(1.02, .98); } }
      @keyframes adem { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, .97); } }
      @keyframes wiebel { 0%, 82%, 100% { transform: rotate(0); } 86% { transform: rotate(-5deg); } 90% { transform: rotate(5deg); } 94% { transform: rotate(-3deg); } }
      @keyframes knip { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
      @keyframes klap { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-9deg); } }
      @keyframes kwispel { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(9deg); } }
      @keyframes gloei { 0%, 100% { opacity: .55; transform: scale(.95); } 50% { opacity: 1; transform: scale(1.05); } }
      @keyframes traan { 0% { transform: translateY(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(9px); opacity: 0; } }
      @keyframes spring { 0% { transform: translateY(0) scale(1); } 35% { transform: translateY(-16px) scale(.94, 1.08); } 70% { transform: translateY(0) scale(1.08, .92); } 100% { transform: scale(1); } }
      @keyframes zzz { 0% { opacity: 0; transform: translate(0, 6px); } 25% { opacity: 1; } 100% { opacity: 0; transform: translate(10px, -22px); } }
      @keyframes pop { from { transform: scale(.4); opacity: 0; } }
      @keyframes vonk { 0% { opacity: 0; transform: translate(0, 0) scale(.4); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.3); } }
      @keyframes flits { 0%, 100% { opacity: 0; transform: scale(.4); } 45% { opacity: 1; transform: scale(1.15); } }
      @keyframes evo { 0% { transform: scale(1); filter: none; } 15% { transform: scale(1.1) rotate(-6deg); } 30% { transform: scale(1.15) rotate(6deg); } 45% { transform: scale(1.1); filter: brightness(8) saturate(0); }
        60% { transform: scale(.7); filter: brightness(8) saturate(0); } 80% { transform: scale(1.3); filter: none; } 100% { transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) {
        .dier, :host(.slaap) .dier, .ei, .oog, .vleugel, .staart, .aura, .traan, .zzz span, .bol { animation: none; }
        .zzz span:first-child { opacity: 1; }
        .dier.evo { animation: evoStil 1.2s ease; }
        .vonk { display: none; }
        @keyframes evoStil { 0%, 100% { filter: none; } 50% { filter: brightness(3); } }
      }
      @media (max-width: 480px) { :host { width: 60px; height: 60px; left: 10px; bottom: 10px; } .bol { bottom: 70px; } }`;
    wortel.append(st);
    knop = document.createElement('button');
    knop.type = 'button'; knop.className = 'dier';
    knop.addEventListener('click', klik);
    bol = null;
    wortel.append(knop);
    (document.body || document.documentElement).appendChild(host);
  }

  function weg() { if (host) { host.remove(); host = null; wortel = null; knop = null; bol = null; laatstGetekend = ''; } }

  function voortgang() {
    const s = stadiumVan(stat.xp);
    if (s >= STADIA.length - 1) return 1;
    return (stat.xp - STADIA[s].vanaf) / (STADIA[s + 1].vanaf - STADIA[s].vanaf);
  }
  function toestand() {
    const nu = Date.now();
    return { s: stadiumVan(stat.xp), h: humeurVan(stat, nu), slaap: slaapt(new Date(nu)) };
  }
  function teken_() {
    if (!instelling) { weg(); return; }
    zorgHost();
    const t = toestand();
    const sleutel = [t.s, t.h, t.slaap, Math.round(voortgang() * 10)].join('|');
    if (sleutel === laatstGetekend) return;
    laatstGetekend = sleutel;
    knop.innerHTML = teken(t.s, t.h, t.slaap, voortgang());
    wortel.host.classList.toggle('slaap', t.slaap);
    wortel.querySelectorAll('.zzz').forEach((e) => e.remove());
    if (t.slaap) {
      const z = document.createElement('div'); z.className = 'zzz'; z.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) { const sp = document.createElement('span'); sp.textContent = 'z'; z.append(sp); }
      wortel.append(z);
    }
    const stadium = STADIA[t.s].naam;
    knop.setAttribute('aria-label', `Je huisdier: ${stadium}${t.slaap ? ', slaapt' : t.h === 'blij' ? ', is blij' : t.h === 'verdrietig' ? ', is verdrietig' : ''}. Klik voor een praatje.`);
    wortel.host.classList.toggle('slaap', t.slaap);
  }

  function zegWat(tekst, onder) {
    if (!wortel) return;
    if (bol) bol.remove();
    clearTimeout(bubbelTimer);
    bol = document.createElement('div'); bol.className = 'bol'; bol.setAttribute('role', 'status');
    bol.append(document.createTextNode(tekst));
    if (onder) {
      const sm = document.createElement('small'); sm.textContent = onder.tekst; bol.append(sm);
      if (typeof onder.balk === 'number') { const b = document.createElement('span'); b.className = 'st'; const i = document.createElement('i'); i.style.width = Math.round(onder.balk * 100) + '%'; b.append(i); bol.append(b); }
    }
    wortel.append(bol);
    bubbelTimer = setTimeout(() => { if (bol) { bol.remove(); bol = null; } }, 6000);
  }

  function klik() {
    if (!knop) return;
    const t = toestand();
    knop.classList.remove('spring'); void knop.offsetWidth;
    if (!reduceer()) knop.classList.add('spring');
    let tekst;
    if (t.slaap) tekst = kies(PRATEN.slaap);
    else if (t.s === 0) tekst = kies(PRATEN.ei);
    else if (t.h === 'blij') tekst = kies(PRATEN.blij);
    else if (t.h === 'verdrietig') tekst = kies(PRATEN.verdrietig);
    else tekst = t.s === 4 && Math.random() < 0.4 ? kies(PRATEN.legendarisch) : kies(PRATEN.rustig);
    const volgende = STADIA[t.s + 1];
    zegWat(tekst, volgende
      ? { tekst: `${STADIA[t.s].naam} · ${stat.xp} XP. Nog ${volgende.vanaf - stat.xp} XP tot ${volgende.naam.toLowerCase()}.`, balk: voortgang() }
      : { tekst: `${STADIA[t.s].naam} · ${stat.xp} XP. Hoger groeien kan niet meer!`, balk: 1 });
  }

  function evolutie(naarStadium) {
    if (!knop) return;
    const stil = reduceer();
    const naam = STADIA[naarStadium].naam;
    if (!stil) {
      const flits = document.createElement('div'); flits.className = 'flits'; wortel.append(flits);
      setTimeout(() => flits.remove(), 1800);
      for (let i = 0; i < 12; i++) {
        const v = document.createElement('i'); v.className = 'vonk';
        const hoek = (i / 12) * Math.PI * 2, afstand = 44 + Math.random() * 20;
        v.style.setProperty('--dx', Math.round(Math.cos(hoek) * afstand) + 'px'); v.style.setProperty('--dy', Math.round(Math.sin(hoek) * afstand) + 'px');
        v.style.animationDelay = (0.7 + Math.random() * 0.3) + 's';
        wortel.append(v); setTimeout(() => v.remove(), 2400);
      }
    }
    knop.classList.remove('evo'); void knop.offsetWidth; knop.classList.add('evo');
    // halverwege de flits wisselen we de tekening
    setTimeout(() => { laatstGetekend = ''; teken_(); }, stil ? 100 : 780);
    setTimeout(() => zegWat(naarStadium === 1 ? 'Ik ben uit mijn ei!' : `Ik ben gegroeid!`, { tekst: `Nu ben ik een ${naam.toLowerCase()}.` }), stil ? 400 : 1500);
    if (instellingen_geluid) { try { new Audio(chrome.runtime.getURL('sounds/glim-glinster.mp3')).play().catch(() => {}); } catch (e) { /* stil */ } }
  }
  let instellingen_geluid = true;

  // XP voor één geopende kaart. Een kaart die al XP gaf (zelfde id) geeft geen tweede keer XP.
  async function xp(o) {
    if (!o || typeof o.id !== 'string' || !o.id) return null;
    const plus = xpVoor(o.cijfer, o.trede);
    if (!plus) return null;
    let r;
    try { r = await chrome.storage.local.get(SLEUTEL); } catch (e) { return null; }
    const nu = schoon(r[SLEUTEL]);
    if (nu.ids.includes(o.id)) return null;
    const voor = stadiumVan(nu.xp);
    nu.xp += plus;
    nu.ids.push(o.id);
    nu.humeur = { s: Number(o.cijfer) >= 5.5 ? 'blij' : 'verdrietig', ts: Date.now() };
    const na = stadiumVan(nu.xp);
    nu.gezien = Math.max(nu.gezien, voor); // 'gezien' = het stadium waarvan we de evolutie al hebben getoond
    try { await chrome.storage.local.set({ [SLEUTEL]: nu }); } catch (e) { return null; }
    // onChanged volgt hierna en tekent opnieuw; de evolutie spelen we daar
    return { plus, xp: nu.xp, voor, na };
  }

  async function bewaarGezien(s) {
    try { const r = await chrome.storage.local.get(SLEUTEL); const nu = schoon(r[SLEUTEL]); if (nu.gezien < s) { nu.gezien = s; await chrome.storage.local.set({ [SLEUTEL]: nu }); } } catch (e) { /* niets */ }
  }
  function neem(waarde, mag_evolutie) {
    const oud = stadiumVan(stat.xp);
    stat = schoon(waarde);
    const nu = stadiumVan(stat.xp);
    if (instelling && nu > oud && nu > stat.gezien && mag_evolutie && document.visibilityState === 'visible' && knop) {
      evolutie(nu); // de nieuwe tekening verschijnt halverwege de animatie
      bewaarGezien(nu);
    } else {
      teken_();
    }
  }

  async function start() {
    try {
      const r = await chrome.storage.local.get([SLEUTEL, 'spo_instellingen']);
      const i = r.spo_instellingen && typeof r.spo_instellingen === 'object' ? r.spo_instellingen : {};
      instelling = i.huisdier !== false; instellingen_geluid = i.geluid !== false;
      stat = schoon(r[SLEUTEL]);
    } catch (e) { /* standaard */ }
    teken_();
    // Het stadium waarin we nu zitten telt als gezien (een evolutie zonder dat we het zagen, tonen we niet meer)
    if (stat.gezien < stadiumVan(stat.xp)) bewaarGezien(stadiumVan(stat.xp));
    try {
      chrome.storage.onChanged.addListener((w, gebied) => {
        if (gebied !== 'local') return;
        if (w.spo_instellingen) {
          const i = w.spo_instellingen.newValue && typeof w.spo_instellingen.newValue === 'object' ? w.spo_instellingen.newValue : {};
          instelling = i.huisdier !== false; instellingen_geluid = i.geluid !== false;
          laatstGetekend = ''; teken_();
        }
        if (w[SLEUTEL]) neem(w[SLEUTEL].newValue, true);
      });
    } catch (e) { /* geen opslag */ }
    // 's nachts gaat hij slapen en 's ochtends wordt hij wakker; het humeur loopt na 6 uur af
    setInterval(() => { if (instelling) teken_(); }, 60 * 1000);
  }
  window.SPOHuisdier = { xp, ...lib, tekenNu: () => { laatstGetekend = ''; teken_(); }, zeg: zegWat, evolutie };
  start();
})();
