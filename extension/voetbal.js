/*
 * Pack Opener v3.0: eigen VOETBALLER (avatar) en eigen STADION. Gedeelde code: de lijsten met keuzes, de schoonmaak van wat
 * er wordt bewaard of van een vriend komt, en het tekenen (canvas 2D). Werkt zonder DOM (ook in Node); tekenen heeft een canvas nodig.
 *
 * Opslag (chrome.storage.local):
 *   spo_voetbal  { v:1, avatar:{ huid, haar, haarkleur, kit, nummer, juich }, stadion:{ thema, tribune, vlag, veld, naam } }
 * Alles is alleen cosmetisch. Extra keuzes (haarstijlen, kitkleuren, juichstijlen, stadionthema's, veldstijlen, vlaggen) koop je in
 * de munten-winkel: de lijst met winkelitems (ITEMS) wordt door economie.js aan de winkel toegevoegd.
 * Wat een vriend stuurt (in de versleutelde vriendenblob, profiel.av en profiel.sd) gaat door schoonAvatar() en schoonStadion():
 * alleen vaste keuzes uit de lijsten hieronder, een rugnummer van 1 t/m 99 en een stadionnaam van hooguit 24 tekens die door het tekstfilter moet.
 */
(function () {
  'use strict';

  // Elke keuze: { id (korte sleutel), naam, item (winkel-id, of null als hij gratis is) }
  const gratis = (id, naam, extra) => Object.assign({ id, naam, item: null }, extra);
  const HUID = ['#f6d3b3', '#e8b98f', '#c98e63', '#a2683f', '#7a4a2b', '#4f2f1c'];
  const HUID_NAMEN = ['Heel licht', 'Licht', 'Middel', 'Bruin', 'Donkerbruin', 'Donker'];
  const HAARKLEUR = ['#1b1410', '#4a2e1a', '#8a5a2b', '#d7b45a', '#b8431f', '#9aa0a8'];
  const HAARKLEUR_NAMEN = ['Zwart', 'Donkerbruin', 'Bruin', 'Blond', 'Rood', 'Grijs'];
  const HAAR = [
    gratis('kort', 'Kort'), gratis('krullen', 'Krullen'), gratis('kaal', 'Kaal'),
    { id: 'lang', naam: 'Lang haar', item: 'ha-lang' }, { id: 'knot', naam: 'Knot', item: 'ha-knot' },
    { id: 'hanen', naam: 'Hanenkam', item: 'ha-hanen' }, { id: 'afro', naam: 'Afro', item: 'ha-afro' },
  ];
  // shirt, broek en accent (kraag, strepen)
  const KIT = [
    gratis('rood', 'Rood', { shirt: '#d62828', broek: '#f2f2f2', acc: '#ffd24a' }),
    gratis('blauw', 'Blauw', { shirt: '#1f5fd1', broek: '#f2f2f2', acc: '#ffffff' }),
    gratis('groen', 'Groen', { shirt: '#1f9d55', broek: '#14301f', acc: '#f2f2f2' }),
    gratis('oranje', 'Oranje', { shirt: '#f28c18', broek: '#1b2a6b', acc: '#ffffff' }),
    gratis('wit', 'Wit', { shirt: '#f2f2f2', broek: '#22252b', acc: '#d62828' }),
    gratis('zwart', 'Zwart', { shirt: '#22252b', broek: '#22252b', acc: '#ffd24a' }),
    { id: 'paars', naam: 'Paars', item: 'kk-paars', shirt: '#7a3fd1', broek: '#f2f2f2', acc: '#ffd24a' },
    { id: 'neon', naam: 'Neonroze', item: 'kk-neon', shirt: '#ff2fd0', broek: '#14102a', acc: '#2cf5a0' },
    { id: 'goud', naam: 'Goud', item: 'kk-goud', shirt: '#e6b41f', broek: '#2a1d03', acc: '#fff1a6' },
    { id: 'diamant', naam: 'Diamant', item: 'kk-diamant', shirt: '#9fd0ff', broek: '#ffffff', acc: '#20324d' },
  ];
  const JUICH = [
    gratis('knie', 'Op de knieën'), gratis('armen', 'Armen omhoog'),
    { id: 'wijd', naam: 'Vliegtuig', item: 'ju-wijd' }, { id: 'vuist', naam: 'Vuist omhoog', item: 'ju-vuist' },
    { id: 'dans', naam: 'Dansje', item: 'ju-dans' }, { id: 'salto', naam: 'Salto', item: 'ju-salto' },
  ];
  const TRIBUNE = [
    gratis('rood', 'Rood', { kleur: '#c0262d' }), gratis('blauw', 'Blauw', { kleur: '#2a5fc4' }), gratis('groen', 'Groen', { kleur: '#2a9a55' }),
    gratis('oranje', 'Oranje', { kleur: '#ef8a1c' }), gratis('wit', 'Wit', { kleur: '#e8ecf2' }), gratis('zwart', 'Zwart', { kleur: '#2b2f38' }),
  ];
  // lucht: van boven naar de horizon; gras: twee maaistroken; lamp: kleur van het licht
  const THEMA = [
    gratis('klassiek', 'Klassiek', { lucht: ['#16224a', '#3b5a9a'], lamp: '#fff6d8', sterren: false, zon: false, tribune: null }),
    { id: 'nacht', naam: 'Nachtstadion', item: 'sd-nacht', lucht: ['#03030f', '#1b1f5c'], lamp: '#cfe2ff', sterren: true, zon: false, tribune: null },
    { id: 'zonsondergang', naam: 'Avondstadion', item: 'sd-zon', lucht: ['#3a1450', '#ff9a5c'], lamp: '#ffd9a8', sterren: false, zon: true, tribune: null },
    { id: 'ijs', naam: 'IJsstadion', item: 'sd-ijs', lucht: ['#0a2a40', '#a9e3f5'], lamp: '#eefcff', sterren: false, zon: false, tribune: '#cfeaf7' },
    { id: 'goud', naam: 'Goudstadion', item: 'sd-goud', lucht: ['#1d1503', '#9a6f0e'], lamp: '#ffe9a0', sterren: true, zon: false, tribune: '#d9a41c' },
  ];
  const VELD = [
    gratis('strepen', 'Maaistrepen', { gras: ['#1d6b2e', '#238236'], soort: 0 }),
    gratis('ruiten', 'Ruiten', { gras: ['#1d6b2e', '#238236'], soort: 1 }),
    { id: 'diagonaal', naam: 'Diagonaal', item: 'sv-diagonaal', gras: ['#1b6a35', '#2a8c45'], soort: 2 },
    { id: 'zomer', naam: 'Zomergras', item: 'sv-zomer', gras: ['#3b8a2a', '#58a83a'], soort: 0 },
    { id: 'neon', naam: 'Neonveld', item: 'sv-neon', gras: ['#0a6e55', '#10a07a'], soort: 1 },
  ];
  const VLAG = [
    gratis('geen', 'Geen vlaggen'), gratis('wimpels', 'Wimpels'),
    { id: 'banieren', naam: 'Banieren', item: 'sf-banier' }, { id: 'sterren', naam: 'Sterrenvlaggen', item: 'sf-sterren' },
    { id: 'regenboog', naam: 'Regenboogvlaggen', item: 'sf-regenboog' },
  ];
  const LIJSTEN = { huid: null, haar: HAAR, kit: KIT, juich: JUICH, tribune: TRIBUNE, thema: THEMA, veld: VELD, vlag: VLAG };

  // ───────── Winkelitems (economie.js zet ze in de winkel) ─────────
  // zeld: 0 gewoon, 1 zeldzaam, 2 episch, 3 legendarisch. prijs null: alleen te winnen.
  const ITEMS = [
    { id: 'ha-lang', soort: 'haar', sleutel: 'lang', naam: 'Lang haar', prijs: 25, zeld: 0, uitleg: 'Haarstijl voor je voetballer: lang haar.' },
    { id: 'ha-knot', soort: 'haar', sleutel: 'knot', naam: 'Knot', prijs: 25, zeld: 0, uitleg: 'Haarstijl voor je voetballer: een knot bovenop.' },
    { id: 'ha-hanen', soort: 'haar', sleutel: 'hanen', naam: 'Hanenkam', prijs: 45, zeld: 1, uitleg: 'Haarstijl voor je voetballer: een hanenkam.' },
    { id: 'ha-afro', soort: 'haar', sleutel: 'afro', naam: 'Afro', prijs: 45, zeld: 1, uitleg: 'Haarstijl voor je voetballer: een grote afro.' },
    { id: 'kk-paars', soort: 'kitkleur', sleutel: 'paars', naam: 'Paars tenue', prijs: 30, zeld: 0, uitleg: 'Tenue voor je voetballer: paars met goud.' },
    { id: 'kk-neon', soort: 'kitkleur', sleutel: 'neon', naam: 'Neontenue', prijs: 55, zeld: 1, uitleg: 'Tenue voor je voetballer: felroze met groen.' },
    { id: 'kk-goud', soort: 'kitkleur', sleutel: 'goud', naam: 'Goudtenue', prijs: 90, zeld: 2, uitleg: 'Tenue voor je voetballer: goud, voor kampioenen.' },
    { id: 'kk-diamant', soort: 'kitkleur', sleutel: 'diamant', naam: 'Diamanttenue', prijs: null, zeld: 3, uitleg: 'Tenue voor je voetballer: ijsblauw als een diamant. Alleen te winnen.' },
    { id: 'ju-wijd', soort: 'juich', sleutel: 'wijd', naam: 'Vliegtuig', prijs: 30, zeld: 0, uitleg: 'Juichstijl na een doelpunt: armen wijd als een vliegtuig.' },
    { id: 'ju-vuist', soort: 'juich', sleutel: 'vuist', naam: 'Vuist omhoog', prijs: 30, zeld: 0, uitleg: 'Juichstijl na een doelpunt: één vuist in de lucht.' },
    { id: 'ju-dans', soort: 'juich', sleutel: 'dans', naam: 'Dansje', prijs: 60, zeld: 1, uitleg: 'Juichstijl na een doelpunt: een vrolijk dansje.' },
    { id: 'ju-salto', soort: 'juich', sleutel: 'salto', naam: 'Salto', prijs: 100, zeld: 2, uitleg: 'Juichstijl na een doelpunt: een salto.' },
    { id: 'sd-nacht', soort: 'stadion', sleutel: 'nacht', naam: 'Nachtstadion', prijs: 40, zeld: 0, uitleg: 'Stadionthema: een donkere hemel vol sterren.' },
    { id: 'sd-zon', soort: 'stadion', sleutel: 'zonsondergang', naam: 'Avondstadion', prijs: 55, zeld: 1, uitleg: 'Stadionthema: een oranje hemel met zon.' },
    { id: 'sd-ijs', soort: 'stadion', sleutel: 'ijs', naam: 'IJsstadion', prijs: 80, zeld: 2, uitleg: 'Stadionthema: ijsblauw met witte tribunes.' },
    { id: 'sd-goud', soort: 'stadion', sleutel: 'goud', naam: 'Goudstadion', prijs: 140, zeld: 3, uitleg: 'Stadionthema: gouden tribunes onder een gouden hemel.' },
    { id: 'sv-diagonaal', soort: 'veld', sleutel: 'diagonaal', naam: 'Diagonaal', prijs: 30, zeld: 0, uitleg: 'Veldstijl: schuine maaistrepen.' },
    { id: 'sv-zomer', soort: 'veld', sleutel: 'zomer', naam: 'Zomergras', prijs: 40, zeld: 1, uitleg: 'Veldstijl: licht, zonnig gras.' },
    { id: 'sv-neon', soort: 'veld', sleutel: 'neon', naam: 'Neonveld', prijs: 75, zeld: 2, uitleg: 'Veldstijl: een groenblauw veld met ruiten.' },
    { id: 'sf-banier', soort: 'vlag', sleutel: 'banieren', naam: 'Banieren', prijs: 30, zeld: 0, uitleg: 'Vlaggen boven je tribune: lange banieren.' },
    { id: 'sf-sterren', soort: 'vlag', sleutel: 'sterren', naam: 'Sterrenvlaggen', prijs: 45, zeld: 1, uitleg: 'Vlaggen boven je tribune: met sterren.' },
    { id: 'sf-regenboog', soort: 'vlag', sleutel: 'regenboog', naam: 'Regenboogvlaggen', prijs: 70, zeld: 2, uitleg: 'Vlaggen boven je tribune: in alle kleuren.' },
  ];
  const SOORTEN = { haar: 'Haarstijl', kitkleur: 'Tenue', juich: 'Juichstijl', stadion: 'Stadionthema', veld: 'Veldstijl', vlag: 'Vlaggen' };
  // In welk veld van avatar of stadion een soort hoort
  const VELD_VAN = { haar: ['avatar', 'haar'], kitkleur: ['avatar', 'kit'], juich: ['avatar', 'juich'], stadion: ['stadion', 'thema'], veld: ['stadion', 'veld'], vlag: ['stadion', 'vlag'] };
  const LIJST_VAN = { haar: HAAR, kitkleur: KIT, juich: JUICH, stadion: THEMA, veld: VELD, vlag: VLAG };

  // ───────── Schoonmaken ─────────
  const NAAM_MAX = 24;
  const STANDAARD_AVATAR = { huid: 1, haar: 'kort', haarkleur: 1, kit: 'rood', nummer: 9, juich: 'armen' };
  const STANDAARD_STADION = { thema: 'klassiek', tribune: 'rood', vlag: 'wimpels', veld: 'strepen', naam: '' };
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const heeftOpt = (lijst, id) => typeof id === 'string' && lijst.some((x) => x.id === id);
  const idx = (v, n, std) => (Number.isInteger(v) && v >= 0 && v < n ? v : std);
  const keuze = (lijst, id, std, gekocht) => {
    if (!heeftOpt(lijst, id)) return std;
    const o = lijst.find((x) => x.id === id);
    return o.item && gekocht && !gekocht.includes(o.item) ? std : id;
  };
  // gekocht: lijst met winkel-id's van deze speler. Zonder lijst (een vriend) tellen alle keuzes uit de vaste lijst.
  function schoonAvatar(a, gekocht) {
    a = obj(a);
    const nr = typeof a.nummer === 'number' ? Math.floor(a.nummer) : parseInt(a.nummer, 10);
    return {
      huid: idx(a.huid, HUID.length, STANDAARD_AVATAR.huid),
      haar: keuze(HAAR, a.haar, STANDAARD_AVATAR.haar, gekocht),
      haarkleur: idx(a.haarkleur, HAARKLEUR.length, STANDAARD_AVATAR.haarkleur),
      kit: keuze(KIT, a.kit, STANDAARD_AVATAR.kit, gekocht),
      nummer: Number.isFinite(nr) && nr >= 1 && nr <= 99 ? nr : STANDAARD_AVATAR.nummer,
      juich: keuze(JUICH, a.juich, STANDAARD_AVATAR.juich, gekocht),
    };
  }
  if (!globalThis.SPOTekst && typeof require === 'function') { try { globalThis.SPOTekst = require('./tekstfilter.js'); } catch (e) { /* niet beschikbaar */ } }
  // Stadionnaam (eigen of van een vriend): door het tekstfilter. Komt hij er niet door, of is het filter niet geladen, dan is hij leeg.
  const schoonNaam = (t) => {
    const k = String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff<>]/g, '').replace(/\s+/g, ' ').trim();
    if (!k || Array.from(k).length > NAAM_MAX) return '';
    return globalThis.SPOTekst ? globalThis.SPOTekst.toonNaam(k, '') : '';
  };
  function schoonStadion(s, gekocht) {
    s = obj(s);
    return {
      thema: keuze(THEMA, s.thema, STANDAARD_STADION.thema, gekocht),
      tribune: heeftOpt(TRIBUNE, s.tribune) ? s.tribune : STANDAARD_STADION.tribune,
      vlag: keuze(VLAG, s.vlag, STANDAARD_STADION.vlag, gekocht),
      veld: keuze(VELD, s.veld, STANDAARD_STADION.veld, gekocht),
      naam: schoonNaam(s.naam),
    };
  }
  // De hele bewaarde toestand (eigen): premium-keuzes die je niet (meer) hebt vallen terug op de standaard.
  function schoonToestand(t, gekocht) {
    t = obj(t);
    return { v: 1, avatar: schoonAvatar(t.avatar, gekocht || []), stadion: schoonStadion(t.stadion, gekocht || []) };
  }
  // Voor de vriendenblob: null als er niets te sturen is (nog niets gekozen).
  function deelbaar(t, gekocht) {
    if (!t || typeof t !== 'object' || Array.isArray(t) || (!t.avatar && !t.stadion)) return { av: null, sd: null };
    const s = schoonToestand(t, gekocht);
    return { av: t.avatar ? s.avatar : null, sd: t.stadion ? s.stadion : null };
  }

  // ───────── Voor de strafschop (motor/strafschop.js): hex-kleuren in plaats van sleutels ─────────
  const kitVan = (id) => KIT.find((k) => k.id === id) || KIT[0];
  function naarSchutter(av) {
    const a = schoonAvatar(av);
    const kit = kitVan(a.kit);
    return { huid: HUID[a.huid], haar: HAARKLEUR[a.haarkleur], shirt: kit.shirt, broek: kit.broek, acc: kit.acc, nummer: a.nummer, juich: a.juich };
  }
  function naarThema(sd) {
    const s = schoonStadion(sd);
    const th = THEMA.find((x) => x.id === s.thema) || THEMA[0];
    const vd = VELD.find((x) => x.id === s.veld) || VELD[0];
    const tr = TRIBUNE.find((x) => x.id === s.tribune) || TRIBUNE[0];
    return { tribune: th.tribune || tr.kleur, gras: vd.gras.slice(), veld: vd.soort, naam: s.naam };
  }

  // ───────── Tekenen ─────────
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const donkerder = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  };
  const kleurIn = (lijst, id, veld) => (lijst.find((x) => x.id === id) || lijst[0])[veld];

  // Armhoeken per juichstijl: [boven, onder] vanaf recht omlaag, naar buiten positief (radialen). Links, rechts.
  const ARMEN = {
    staan: { L: [0.14, 0.1], R: [0.14, 0.1] },
    armen: { L: [2.75, 2.95], R: [2.75, 2.95] },
    wijd: { L: [1.57, 1.57], R: [1.57, 1.57] },
    vuist: { L: [0.2, 0.3], R: [2.9, 3.05] },
    dans: { L: [2.3, 2.7], R: [0.95, 0.2] },
    knie: { L: [0.9, 1.3], R: [0.9, 1.3] },
    salto: { L: [2.75, 2.95], R: [2.75, 2.95] },
  };
  // pose: 'staan' of een juichstijl. Het canvas wordt 200 x 300 (of een veelvoud via opties.schaal).
  function tekenAvatar(canvas, av, opties) {
    const o = opties || {};
    const a = schoonAvatar(av);
    const pose = o.pose === 'staan' || ARMEN[o.pose] ? o.pose : a.juich;
    const sc = o.schaal || 1.6;
    canvas.width = Math.round(200 * sc);
    canvas.height = Math.round(300 * sc);
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.scale(sc, sc);
    const huid = HUID[a.huid], haar = HAARKLEUR[a.haarkleur], kit = kitVan(a.kit);
    const huidSchaduw = donkerder(huid, 0.82);
    const knie = pose === 'knie', salto = pose === 'salto';
    const armen = ARMEN[pose] || ARMEN.staan;
    // schaduw op de grond
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(100, 284, salto ? 22 : 46, 8, 0, 0, 7); c.fill();
    c.translate(100, 150);
    if (salto) c.rotate(2.5);
    c.translate(-100, -150);
    const dy = knie ? 34 : 0;
    // benen (sokken in het accent, schoenen zwart)
    const been = (x, gebogen) => {
      c.fillStyle = huid; c.fillRect(x - 9, 196 + dy, 18, gebogen ? 14 : 20);
      c.fillStyle = kit.acc; c.fillRect(x - 9, (gebogen ? 210 : 214) + dy, 18, gebogen ? 22 : 44);
      c.fillStyle = kit.shirt; c.fillRect(x - 9, (gebogen ? 224 : 232) + dy, 18, 4);
      c.fillStyle = '#14161c';
      c.beginPath(); c.ellipse(x + (x < 100 ? -3 : 3), (gebogen ? 236 : 260) + dy, 13, 7, 0, 0, 7); c.fill();
    };
    if (knie) { been(82, true); been(118, true); } else { been(84, false); been(116, false); }
    // broek
    c.fillStyle = kit.broek;
    c.beginPath(); c.moveTo(70, 172 + dy); c.lineTo(130, 172 + dy); c.lineTo(136, 208 + dy); c.lineTo(104, 202 + dy); c.lineTo(100, 190 + dy); c.lineTo(96, 202 + dy); c.lineTo(64, 208 + dy); c.closePath(); c.fill();
    // armen (onder het shirt beginnen, mouw in shirtkleur, onderarm in huidskleur)
    const arm = (zij, h) => {
      const sx = 100 + zij * 31, sy = 108 + dy;
      const b = h[0] * zij, onder = h[1] * zij;
      const ex = sx + Math.sin(b) * 32, ey = sy + Math.cos(b) * 32;
      const hx = ex + Math.sin(onder) * 30, hy = ey + Math.cos(onder) * 30;
      c.lineCap = 'round';
      c.strokeStyle = huid; c.lineWidth = 13; c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = kit.shirt; c.lineWidth = 17; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = kit.acc; c.lineWidth = 17; c.beginPath(); c.moveTo(ex - Math.sin(b) * 4, ey - Math.cos(b) * 4); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = huid; c.beginPath(); c.arc(hx, hy, 7.5, 0, 7); c.fill();
    };
    // het lichaam kantelt licht bij het dansje
    c.save();
    if (pose === 'dans') { c.translate(100, 170); c.rotate(0.07); c.translate(-100, -170); }
    arm(-1, armen.L); arm(1, armen.R);
    // shirt
    c.fillStyle = kit.shirt;
    c.beginPath(); c.moveTo(68, 98 + dy); c.quadraticCurveTo(100, 88 + dy, 132, 98 + dy); c.lineTo(136, 176 + dy); c.lineTo(64, 176 + dy); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(100, 98 + dy, 36, 78);
    c.fillStyle = kit.acc; c.fillRect(64, 170 + dy, 72, 6);
    // hals en kraag
    c.fillStyle = huidSchaduw; c.fillRect(91, 82 + dy, 18, 18);
    c.fillStyle = kit.acc; c.beginPath(); c.moveTo(86, 96 + dy); c.quadraticCurveTo(100, 112 + dy, 114, 96 + dy); c.lineTo(110, 94 + dy); c.quadraticCurveTo(100, 104 + dy, 90, 94 + dy); c.closePath(); c.fill();
    // rugnummer groot op het shirt
    c.fillStyle = kleurLicht(kit.shirt) ? '#14181f' : '#ffffff';
    c.font = '800 38px "SPO Display", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(a.nummer), 100, 142 + dy);
    // hoofd
    const hy = 60 + dy;
    haarAchter(c, a.haar, haar, hy);
    c.fillStyle = huid; c.beginPath(); c.ellipse(100, hy, 25, 28, 0, 0, 7); c.fill();
    c.beginPath(); c.arc(75.5, hy + 3, 5, 0, 7); c.arc(124.5, hy + 3, 5, 0, 7); c.fill();
    haarVoor(c, a.haar, haar, hy);
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.ellipse(90, hy + 2, 2.6, 3.4, 0, 0, 7); c.ellipse(110, hy + 2, 2.6, 3.4, 0, 0, 7); c.fill();
    c.strokeStyle = '#7a2d2d'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.arc(100, hy + 10, 9, 0.2, Math.PI - 0.2); c.stroke();
    c.restore();
    c.restore();
    return canvas;
  }
  const kleurLicht = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
  };
  function haarAchter(c, stijl, kleur, hy) {
    c.fillStyle = kleur;
    if (stijl === 'lang') { c.beginPath(); c.moveTo(70, hy - 8); c.quadraticCurveTo(66, hy + 50, 78, hy + 62); c.lineTo(122, hy + 62); c.quadraticCurveTo(134, hy + 50, 130, hy - 8); c.closePath(); c.fill(); }
    if (stijl === 'afro') { c.beginPath(); c.arc(100, hy - 8, 40, 0, 7); c.fill(); }
    if (stijl === 'knot') { c.beginPath(); c.arc(100, hy - 38, 11, 0, 7); c.fill(); }
  }
  function haarVoor(c, stijl, kleur, hy) {
    c.fillStyle = kleur;
    if (stijl === 'kaal') return;
    if (stijl === 'krullen') {
      for (let i = 0; i < 9; i++) { const h = Math.PI + (i / 8) * Math.PI; c.beginPath(); c.arc(100 + Math.cos(h) * 22, hy - 4 + Math.sin(h) * 24, 8.5, 0, 7); c.fill(); }
      return;
    }
    if (stijl === 'hanen') { c.beginPath(); c.moveTo(92, hy - 24); c.lineTo(96, hy - 46); c.lineTo(104, hy - 46); c.lineTo(108, hy - 24); c.closePath(); c.fill(); return; }
    // kort (en de basis onder lang, knot en afro): een kapje boven het voorhoofd
    c.beginPath(); c.moveTo(75, hy - 6); c.quadraticCurveTo(76, hy - 36, 100, hy - 33); c.quadraticCurveTo(124, hy - 36, 125, hy - 6);
    c.quadraticCurveTo(116, hy - 20, 100, hy - 20); c.quadraticCurveTo(84, hy - 20, 75, hy - 6); c.closePath(); c.fill();
  }

  // Het stadion: een breed plaatje (standaard 480 x 270 keer opties.schaal).
  function tekenStadion(canvas, sd, opties) {
    const o = opties || {};
    const s = schoonStadion(sd);
    const th = THEMA.find((x) => x.id === s.thema) || THEMA[0];
    const vd = VELD.find((x) => x.id === s.veld) || VELD[0];
    const trKleur = th.tribune || kleurIn(TRIBUNE, s.tribune, 'kleur');
    const sc = o.schaal || 1.5;
    const W = 480, H = 270;
    canvas.width = Math.round(W * sc);
    canvas.height = Math.round(H * sc);
    const c = canvas.getContext('2d');
    c.save();
    c.scale(sc, sc);
    // lucht
    const g = c.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, th.lucht[0]); g.addColorStop(1, th.lucht[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (th.sterren) { for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(255,255,255,${0.35 + rnd(i + 4) * 0.65})`; c.beginPath(); c.arc(rnd(i) * W, rnd(i + 70) * 70, 0.6 + rnd(i + 9) * 1.1, 0, 7); c.fill(); } }
    if (th.zon) { const z = c.createRadialGradient(240, 100, 4, 240, 100, 70); z.addColorStop(0, 'rgba(255,240,190,1)'); z.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = z; c.fillRect(120, 20, 240, 160); }
    // tribune: twee ringen vol publiek, in de kleur van de tribune
    const rij = (y0, y1, basis, n0) => {
      c.fillStyle = donkerder(basis, 0.55);
      c.beginPath(); c.moveTo(0, y1); c.lineTo(28, y0); c.lineTo(W - 28, y0); c.lineTo(W, y1); c.closePath(); c.fill();
      const rijen = Math.round((y1 - y0) / 7);
      for (let r = 0; r < rijen; r++) {
        const y = y0 + 4 + r * 7, marge = 28 * (1 - (r + 0.5) / rijen);
        for (let x = marge + 3; x < W - marge - 3; x += 7) {
          const k = rnd(n0 + r * 91 + x);
          c.fillStyle = k < 0.55 ? basis : k < 0.8 ? donkerder(basis, 0.75) : k < 0.92 ? '#f4efe6' : '#1a1d26';
          c.beginPath(); c.arc(x + (r % 2) * 3, y, 2.5, 0, 7); c.fill();
        }
      }
    };
    rij(50, 92, trKleur, 1);
    rij(92, 128, trKleur, 5000);
    // dak
    c.fillStyle = 'rgba(10,12,22,.85)'; c.fillRect(20, 44, W - 40, 7);
    // vlaggen op de rand van het dak
    vlaggen(c, s.vlag, W);
    // lichtmasten met gloed
    for (const x of [36, W - 36]) {
      c.fillStyle = '#20232d'; c.fillRect(x - 2, 20, 4, 40);
      const l = c.createRadialGradient(x, 20, 1, x, 20, 38);
      l.addColorStop(0, th.lamp); l.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = l; c.fillRect(x - 40, -20, 80, 80);
      c.fillStyle = th.lamp; c.fillRect(x - 11, 15, 22, 7);
    }
    // reclamebord met de naam
    c.fillStyle = '#10142a'; c.fillRect(0, 124, W, 18);
    c.fillStyle = th.lamp; c.globalAlpha = 0.9; c.fillRect(0, 124, W, 2); c.globalAlpha = 1;
    const naam = (s.naam || 'Mijn stadion').toUpperCase();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 12px "SPO Display", "Arial Black", sans-serif';
    c.fillText(naam, W / 2, 134, 420);
    // veld
    const top = 142, bodem = H;
    for (let i = 0; i < 12; i++) {
      const y0 = top + (bodem - top) * (i / 12) ** 1.15, y1 = top + (bodem - top) * ((i + 1) / 12) ** 1.15;
      for (let j = 0; j < 8; j++) {
        const f0 = (y0 - top) / (bodem - top), f1 = (y1 - top) / (bodem - top);
        const xa0 = W / 2 - (130 + 230 * f0) + j * ((260 + 460 * f0) / 8), xa1 = xa0 + (260 + 460 * f0) / 8;
        const xb0 = W / 2 - (130 + 230 * f1) + j * ((260 + 460 * f1) / 8), xb1 = xb0 + (260 + 460 * f1) / 8;
        const toggle = vd.soort === 0 ? i % 2 : vd.soort === 1 ? (i + j) % 2 : (i + j + (j > 3 ? 1 : 0)) % 2;
        c.fillStyle = vd.gras[vd.soort === 2 ? (Math.floor((i * 8 + j) / 3) + i) % 2 : toggle];
        c.beginPath(); c.moveTo(xa0, y0); c.lineTo(xa1, y0); c.lineTo(xb1, y1); c.lineTo(xb0, y1); c.closePath(); c.fill();
      }
    }
    // lijnen
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(W / 2 - 130, top); c.lineTo(W / 2 + 130, top); c.stroke();
    c.beginPath(); c.moveTo(W / 2 - 90, top); c.lineTo(W / 2 - 190, 220); c.lineTo(W / 2 + 190, 220); c.lineTo(W / 2 + 90, top); c.stroke();
    c.beginPath(); c.ellipse(W / 2, 232, 46, 14, 0, 0, 7); c.stroke();
    // doel
    c.strokeStyle = '#f4f4f4'; c.lineWidth = 2.2; c.strokeRect(W / 2 - 24, top + 3, 48, 15);
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.7;
    for (let x = -24; x <= 24; x += 6) { c.beginPath(); c.moveTo(W / 2 + x, top + 3); c.lineTo(W / 2 + x, top + 18); c.stroke(); }
    c.restore();
    return canvas;
  }
  function vlaggen(c, stijl, W) {
    if (stijl === 'geen') return;
    const kleuren = ['#ffd24a', '#ff4d6d', '#4dd2ff', '#7dff9a', '#ffffff'];
    if (stijl === 'wimpels') {
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(24, 41); c.quadraticCurveTo(W / 2, 54, W - 24, 41); c.stroke();
      for (let i = 0; i < 26; i++) {
        const x = 30 + i * ((W - 60) / 25), y = 41 + 13 * Math.sin((x - 24) / (W - 48) * Math.PI) * 0.92;
        c.fillStyle = kleuren[i % kleuren.length]; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.lineTo(x, y + 9); c.closePath(); c.fill();
      }
      return;
    }
    for (let i = 0; i < 9; i++) {
      const x = 52 + i * ((W - 104) / 8);
      c.fillStyle = '#d9dce6'; c.fillRect(x - 0.8, 24, 1.6, 22);
      if (stijl === 'banieren') { c.fillStyle = kleuren[i % 4]; c.fillRect(x, 24, 11, 19); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x, 24, 11, 3); }
      else if (stijl === 'sterren') { c.fillStyle = '#16224a'; c.fillRect(x, 24, 15, 11); c.fillStyle = '#ffd24a'; c.font = '9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', x + 7.5, 30); }
      else { ['#ff4d6d', '#ffb020', '#ffe14a', '#4dff9a', '#4dc2ff', '#b36aff'].forEach((k, n) => { c.fillStyle = k; c.fillRect(x, 24 + n * 2.5, 15, 2.5); }); }
    }
  }

  // ───────── Leesbare tekst (voor schermlezers en bijschriften) ─────────
  const naamVan = (lijst, id) => (lijst.find((x) => x.id === id) || lijst[0]).naam;
  function beschrijfAvatar(av) {
    const a = schoonAvatar(av);
    return `Voetballer met rugnummer ${a.nummer}, ${HUID_NAMEN[a.huid].toLowerCase()}e huid, haarstijl ${naamVan(HAAR, a.haar).toLowerCase()} in het ${HAARKLEUR_NAMEN[a.haarkleur].toLowerCase()}, tenue ${naamVan(KIT, a.kit).toLowerCase()}, juichstijl ${naamVan(JUICH, a.juich).toLowerCase()}`;
  }
  function beschrijfStadion(sd) {
    const s = schoonStadion(sd);
    return `${s.naam || 'Mijn stadion'}: thema ${naamVan(THEMA, s.thema).toLowerCase()}, ${naamVan(TRIBUNE, s.tribune).toLowerCase()}e tribune, ${naamVan(VLAG, s.vlag).toLowerCase()}, veld ${naamVan(VELD, s.veld).toLowerCase()}`;
  }

  const lib = {
    NAAM_MAX, HUID, HUID_NAMEN, HAARKLEUR, HAARKLEUR_NAMEN, HAAR, KIT, JUICH, TRIBUNE, THEMA, VELD, VLAG, LIJSTEN, ITEMS, SOORTEN, VELD_VAN, LIJST_VAN,
    STANDAARD_AVATAR, STANDAARD_STADION, schoonAvatar, schoonStadion, schoonToestand, schoonNaam, deelbaar, naarSchutter, naarThema,
    tekenAvatar, tekenStadion, beschrijfAvatar, beschrijfStadion,
  };
  globalThis.SPOVoetbal = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
