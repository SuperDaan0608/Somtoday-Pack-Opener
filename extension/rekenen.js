/* Cijfercalculator: wat moet je halen voor een gewenst gemiddelde?
 * Gewogen gemiddelde zoals scholen het doen: som(cijfer * weging) / som(wegingen).
 * Bovenaan staan pure rekenfuncties (geen DOM, ook te gebruiken in Node: tools/test-rekenen.js).
 * Daaronder de pagina zelf. */

// ===== Rekenfuncties (puur) =====

const EPS = 1e-9; // vangt kommagetal-afwijkingen op bij het afronden (bijv. 5,500000000001)

// "7,5", "7.5", " 7,5 ", ".5" en "7," zijn getallen. Alles anders (letters, min, 1e3, 7,5,3) niet: NaN.
function parseGetal(invoer) {
  if (typeof invoer === 'number') return Number.isFinite(invoer) ? invoer : NaN;
  if (typeof invoer !== 'string') return NaN;
  const t = invoer.trim();
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return NaN;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// Afronden op 1 decimaal. Omhoog is voor "wat moet ik minstens halen", omlaag voor "wat kan ik hoogstens halen".
function rondOmhoog(x) { return Math.ceil(x * 10 - EPS) / 10 + 0; }
function rondOmlaag(x) { return Math.floor(x * 10 + EPS) / 10 + 0; }
function rondAf(x) { return Math.round(x * 10 + EPS) / 10 + 0; }

// 7.5 -> "7,5" (altijd 1 decimaal, zoals Somtoday)
function formatCijfer(x) { return rondAf(x).toFixed(1).replace('.', ','); }
// Overige getallen (wegingen, sommen): geen overbodige nullen, komma als scheidingsteken.
function formatGetal(x, decimalen = 4) { return String(Number(x.toFixed(decimalen))).replace('.', ','); }

function gewogenGemiddelde(som, weging) { return weging > 0 ? som / weging : NaN; }

// Velden met hun toegestane waarden.
const VELDEN = {
  gemiddelde: { min: 1, max: 10 },                  // zelf invullen: huidig gemiddelde
  weging: { min: 1, max: 10000, geheel: true },     // zelf invullen: totale weging tot nu toe
  totaalWeging: { min: 0.1, max: 10000 },           // galerij: wegingen opgeteld (mag een komma hebben)
  som: { min: 0.1, max: 100000 },                   // galerij: cijfer x weging opgeteld
  gewenst: { min: 1, max: 10 },
  toetsWeging: { min: 1, max: 10, geheel: true },
  aantal: { min: 1, max: 5, geheel: true },
  mogelijk: { min: 1, max: 10 },
};
const LABELS = {
  vak: 'Vak',
  gemiddelde: 'Je huidige gemiddelde',
  weging: 'Totale weging van je cijfers tot nu toe',
  totaalWeging: 'Wegingen, opgeteld',
  som: 'Cijfers maal weging, opgeteld',
  gewenst: 'Gewenst gemiddelde',
  toetsWeging: 'Weging van de volgende toets',
  aantal: 'Aantal toetsen die nog komen',
  mogelijk: 'Een mogelijk cijfer',
};
const FOUT = {
  gemiddelde: 'Vul een getal in van 1,0 tot en met 10,0, bijvoorbeeld 6,8.',
  weging: 'Vul een heel getal in van 1 tot en met 10000, bijvoorbeeld 12.',
  totaalWeging: 'Vul een getal in dat groter is dan 0, bijvoorbeeld 9.',
  som: 'Vul een getal in dat groter is dan 0, bijvoorbeeld 64,5.',
  gewenst: 'Vul een getal in van 1,0 tot en met 10,0, bijvoorbeeld 5,5.',
  toetsWeging: 'Vul een heel getal in van 1 tot en met 10, bijvoorbeeld 2.',
  aantal: 'Kies een aantal van 1 tot en met 5.',
  mogelijk: 'Vul een cijfer in van 1,0 tot en met 10,0, bijvoorbeeld 6,5.',
};
const LEEG = {
  vak: 'Kies een vak om te beginnen.',
  gemiddelde: 'Vul je huidige gemiddelde in om te beginnen.',
  weging: 'Vul de totale weging van je cijfers in.',
  totaalWeging: 'Vul de wegingen in, opgeteld.',
  som: 'Vul in wat al je cijfers maal hun weging samen zijn.',
  gewenst: 'Vul in welk gemiddelde je wilt halen.',
  toetsWeging: 'Vul de weging van de volgende toets in.',
  aantal: 'Kies hoeveel toetsen er nog komen.',
  mogelijk: 'Vul een cijfer in om te zien wat er met je gemiddelde gebeurt.',
};

// Leest een veld. fout is null, 'leeg' of 'ongeldig'. waarde is dan NaN.
function leesVeld(naam, tekst) {
  const { min = -Infinity, max = Infinity, geheel = false } = VELDEN[naam] || {};
  if (tekst == null || String(tekst).trim() === '') return { waarde: NaN, fout: 'leeg' };
  const n = parseGetal(typeof tekst === 'number' ? tekst : String(tekst));
  if (!Number.isFinite(n)) return { waarde: NaN, fout: 'ongeldig' };
  if (geheel && Math.abs(n - Math.round(n)) > EPS) return { waarde: NaN, fout: 'ongeldig' };
  if (n < min - EPS || n > max + EPS) return { waarde: NaN, fout: 'ongeldig' };
  return { waarde: geheel ? Math.round(n) : n, fout: null };
}

// Uit de galerij (spo_galerij): alleen kaarten met een vak en een cijfer van 1 tot 10.
// Cijfer mag een getal of tekst zijn ("7,5"). Een weging die ontbreekt of kleiner dan 1 is, telt als 1 (zoals de galerij zelf).
function geldigeKaarten(galerij) {
  const uit = [];
  for (const k of Array.isArray(galerij) ? galerij : []) {
    if (!k || typeof k !== 'object' || typeof k.vak !== 'string' || !k.vak.trim()) continue;
    const cijfer = parseGetal(k.cijfer);
    if (!Number.isFinite(cijfer) || cijfer < 1 - EPS || cijfer > 10 + EPS) continue;
    let weging = parseGetal(k.weging);
    if (!Number.isFinite(weging) || weging <= 0) weging = 1;
    uit.push({ vak: k.vak, cijfer, weging, onderwerp: typeof k.onderwerp === 'string' ? k.onderwerp : '' });
  }
  return uit;
}

// [{ vak, aantal }], gesorteerd op naam
function vakkenUitGalerij(galerij) {
  const tel = new Map();
  for (const k of geldigeKaarten(galerij)) tel.set(k.vak, (tel.get(k.vak) || 0) + 1);
  return [...tel].map(([vak, aantal]) => ({ vak, aantal })).sort((a, b) => a.vak.localeCompare(b.vak, 'nl'));
}

// som(cijfer * weging) en som(wegingen) van de kaarten van een vak
function somUitGalerij(galerij, vak) {
  const kaarten = geldigeKaarten(galerij).filter((k) => k.vak === vak);
  let som = 0, weging = 0;
  for (const k of kaarten) { som += k.cijfer * k.weging; weging += k.weging; }
  return { som: Math.round(som * 1e6) / 1e6, weging: Math.round(weging * 1e6) / 1e6, aantal: kaarten.length, kaarten };
}

// Welk cijfer moet je gemiddeld halen op de toets(en) die nog komen?
// Alle toetsen krijgen dezelfde weging en hetzelfde cijfer: gewenst = (som + n*w*x) / (weging + n*w).
// status: 'gehaald' (nodig <= 1,0), 'onhaalbaar' (nodig > 10,0) of 'haalbaar'.
// nodig is naar boven afgerond op 1 decimaal, zodat je het gewenste gemiddelde zeker haalt.
// hoogste is het gemiddelde dat je haalt met overal een 10,0, naar beneden afgerond (belooft nooit te veel).
function benodigdCijfer({ som, weging, gewenst, toetsWeging, aantal = 1 }) {
  const extra = toetsWeging * aantal;
  const ruw = (gewenst * (weging + extra) - som) / extra;
  const nodig = rondOmhoog(ruw);
  const hoogste = rondOmlaag((som + extra * 10) / (weging + extra));
  const status = nodig <= 1 ? 'gehaald' : nodig > 10 ? 'onhaalbaar' : 'haalbaar';
  return { ruw, nodig, hoogste, status, extra };
}

// Wat wordt je gemiddelde als je op alle toetsen die nog komen dit cijfer haalt?
function nieuwGemiddelde({ som, weging, cijfer, toetsWeging, aantal = 1 }) {
  const extra = toetsWeging * aantal;
  const nu = som / weging;
  const nieuw = (som + extra * cijfer) / (weging + extra);
  return { nu, nieuw, extra };
}

const TABEL_GEWENST = [5.5, 6, 6.5, 7, 7.5, 8, 9];

// Rijen voor de tabel "Dit heb je nodig"
function tabelRijen(start, toetsWeging, aantal = 1, lijst = TABEL_GEWENST) {
  return lijst.map((gewenst) => {
    const r = benodigdCijfer({ som: start.som, weging: start.weging, gewenst, toetsWeging, aantal });
    const rij = { gewenst, gewenstTekst: formatCijfer(gewenst), status: r.status };
    if (r.status === 'haalbaar') { rij.nodigTekst = formatCijfer(r.nodig); rij.statusTekst = 'Haalbaar'; }
    else if (r.status === 'gehaald') { rij.nodigTekst = '1,0 of lager'; rij.statusTekst = 'Al gehaald'; }
    else { rij.nodigTekst = 'meer dan 10,0'; rij.statusTekst = 'Niet haalbaar'; rij.hoogsteTekst = formatCijfer(r.hoogste); }
    return rij;
  });
}

function enkelVoud(aantal, een, meer) { return aantal === 1 ? een : meer; }

// De uitkomst in woorden. voor + getal + na is samen de hele zin (tekst).
function uitkomstZin(res, { start, toetsWeging, aantal }) {
  const toetsen = enkelVoud(aantal, 'toets', 'toetsen');
  const nu = `Nu sta je op een ${formatCijfer(start.som / start.weging)} bij een totale weging van ${formatGetal(start.weging)}.`;
  const wegingZin = aantal === 1
    ? `De volgende toets heeft weging ${toetsWeging}.`
    : `Je haalt dit gemiddelde over de ${aantal} toetsen die nog komen, elk met weging ${toetsWeging}.`;
  let z;
  if (res.status === 'gehaald') {
    z = { soort: 'gehaald', voor: 'Je staat er al, zelfs met een 1,0 haal je het.', getal: '', na: '', detail: `${nu} ${wegingZin}` };
  } else if (res.status === 'onhaalbaar') {
    const max = formatCijfer(res.hoogste);
    z = {
      soort: 'onhaalbaar',
      voor: `Dat gemiddelde is niet meer haalbaar met ${enkelVoud(aantal, 'deze toets', 'deze toetsen')}. Het hoogste dat nog kan is `,
      getal: max, na: '.',
      detail: `Zelfs met een 10,0 voor ${enkelVoud(aantal, 'de toets', `alle ${aantal} toetsen`)} kom je niet verder dan een ${max}. ${nu}`,
    };
  } else {
    z = { soort: 'haalbaar', voor: 'Je moet gemiddeld een ', getal: formatCijfer(res.nodig), na: ' halen', detail: `${nu} ${wegingZin}` };
  }
  z.tekst = z.voor + z.getal + z.na;
  z.toetsen = toetsen;
  return z;
}

// "Wat als ik een X haal?"
function watAlsZin(start, toetsWeging, aantal, cijfer, gewenst) {
  const r = nieuwGemiddelde({ som: start.som, weging: start.weging, cijfer, toetsWeging, aantal });
  const nieuwTekst = formatCijfer(r.nieuw);
  const verschil = Math.round(rondAf(r.nieuw) * 10) - Math.round(rondAf(r.nu) * 10); // in tienden, zoals het op het scherm staat
  let verschilTekst;
  if (verschil === 0) verschilTekst = `Dat is afgerond hetzelfde als nu (${formatCijfer(r.nu)}).`;
  else verschilTekst = `Nu sta je op ${formatCijfer(r.nu)}. Dat is ${formatCijfer(Math.abs(verschil) / 10)} ${verschil > 0 ? 'hoger' : 'lager'}.`;
  const wie = aantal === 1 ? `een ${formatCijfer(cijfer)} haalt` : `op alle ${aantal} toetsen een ${formatCijfer(cijfer)} haalt`;
  let doel = '';
  if (Number.isFinite(gewenst)) {
    doel = r.nieuw >= gewenst - EPS
      ? ` Daarmee haal je je gewenste gemiddelde van ${formatCijfer(gewenst)}.`
      : ` Daarmee haal je je gewenste gemiddelde van ${formatCijfer(gewenst)} nog niet.`;
  }
  return { soort: 'ok', voor: `Als je ${wie}, wordt je gemiddelde een `, getal: nieuwTekst, na: '.', detail: verschilTekst + doel, nieuw: r.nieuw, nu: r.nu, verschil };
}

// Alles in een keer: ruwe tekst uit de velden in, wat er op het scherm moet komen uit.
// invoer: { modus: 'galerij'|'zelf', vak, som, totaalWeging, gemiddelde, weging, gewenst, toetsWeging, aantal, mogelijk }
function bereken(invoer) {
  const inv = invoer || {};
  const fouten = {};  // veldnaam -> melding bij dat veld (alleen als er iets staat dat niet klopt)
  const problemen = []; // in volgorde van het formulier: { naam, soort: 'leeg'|'ongeldig' }
  const lees = (naam) => {
    const r = leesVeld(naam, inv[naam]);
    if (r.fout) { problemen.push({ naam, soort: r.fout }); if (r.fout === 'ongeldig') fouten[naam] = FOUT[naam]; }
    return r.waarde;
  };

  // 1. Waar sta je nu?
  let start = null;
  if (inv.modus === 'galerij') {
    if (!inv.vak) problemen.push({ naam: 'vak', soort: 'leeg' });
    const som = lees('som'), totaal = lees('totaalWeging');
    if (Number.isFinite(som) && Number.isFinite(totaal)) {
      const gem = som / totaal;
      if (gem < 1 - EPS || gem > 10 + EPS) {
        fouten.som = 'Daar komt een gemiddelde uit dat lager is dan 1,0 of hoger dan 10,0. Controleer de twee getallen.';
        problemen.push({ naam: 'som', soort: 'ongeldig' });
      } else if (inv.vak) start = { som, weging: totaal, gemiddelde: gem };
    }
  } else {
    const gem = lees('gemiddelde'), weging = lees('weging');
    if (Number.isFinite(gem) && Number.isFinite(weging)) start = { som: Math.round(gem * weging * 1e6) / 1e6, weging, gemiddelde: gem };
  }

  // 2. Wat wil je halen?
  const gewenst = lees('gewenst');
  const toetsWeging = lees('toetsWeging');
  const aantal = lees('aantal');
  const toetsOk = Number.isFinite(toetsWeging) && Number.isFinite(aantal);

  const eerste = problemen[0];
  let melding = null;
  if (eerste) melding = eerste.soort === 'leeg' ? LEEG[eerste.naam] : `Er klopt nog iets niet bij “${LABELS[eerste.naam]}”. ${fouten[eerste.naam]}`;

  const uitkomst = start && toetsOk && Number.isFinite(gewenst)
    ? Object.assign(uitkomstZin(benodigdCijfer({ som: start.som, weging: start.weging, gewenst, toetsWeging, aantal }), { start, toetsWeging, aantal }), { gewenst })
    : null;
  const tabel = start && toetsOk ? tabelRijen(start, toetsWeging, aantal) : null;

  // 3. Wat als ik een X haal? (staat los van de rest: leeg is geen fout)
  let watAls;
  const m = leesVeld('mogelijk', inv.mogelijk);
  if (m.fout === 'ongeldig') { fouten.mogelijk = FOUT.mogelijk; watAls = { soort: 'fout', tekst: FOUT.mogelijk }; }
  else if (m.fout === 'leeg') watAls = { soort: 'leeg', tekst: LEEG.mogelijk };
  else if (!start || !toetsOk) watAls = { soort: 'wacht', tekst: 'Vul eerst hierboven in waar je nu staat en wat de volgende toets weegt.' };
  else watAls = watAlsZin(start, toetsWeging, aantal, m.waarde, gewenst);
  if (watAls.tekst == null) watAls.tekst = watAls.voor + watAls.getal + watAls.na;

  return { fouten, melding, start, uitkomst, tabel, watAls };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EPS, VELDEN, TABEL_GEWENST,
    parseGetal, rondOmhoog, rondOmlaag, rondAf, formatCijfer, formatGetal, gewogenGemiddelde, leesVeld,
    geldigeKaarten, vakkenUitGalerij, somUitGalerij, benodigdCijfer, nieuwGemiddelde, tabelRijen, uitkomstZin, watAlsZin, bereken,
  };
}

// ===== De pagina =====

(function () {
  'use strict';
  if (typeof document === 'undefined' || !document.getElementById('uitkomst')) return;

  const $ = (id) => document.getElementById(id);
  const el = (tag, klasse, ...kinderen) => {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    for (const k of kinderen) e.append(k);
    return e;
  };
  const SLEUTEL_GALERIJ = 'spo_galerij';
  const SNEL = [5.5, 6, 7, 8];
  const TEGENWOORDIG = globalThis.browser || globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`

  let galerij = [];
  let modus = 'zelf';
  let gekozen = false;      // heeft de gebruiker zelf een manier gekozen? Dan schakelen we niet meer om.
  let voorstel = { som: '', weging: '' };

  function opslag() { return TEGENWOORDIG && TEGENWOORDIG.storage && TEGENWOORDIG.storage.local ? TEGENWOORDIG.storage.local : null; }
  async function laadGalerij() {
    try {
      const lokaal = opslag();
      if (!lokaal) return [];
      const r = await lokaal.get(SLEUTEL_GALERIJ);
      return Array.isArray(r && r[SLEUTEL_GALERIJ]) ? r[SLEUTEL_GALERIJ] : [];
    } catch (_) { return []; }
  }

  // --- veld-hulpjes
  const VELD_ID = {
    som: 'g-som', totaalWeging: 'g-weging', gemiddelde: 'z-gem', weging: 'z-weging',
    gewenst: 'd-gew', toetsWeging: 'd-tw', aantal: 'd-n', mogelijk: 'w-cijfer',
  };
  for (const id of Object.values(VELD_ID)) {
    const hint = $(id + '-hint');
    if (hint) hint.dataset.standaard = hint.textContent;
  }
  function zetVeld(naam, fout) {
    const id = VELD_ID[naam], hint = $(id + '-hint');
    if (fout) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
    if (hint) { hint.textContent = fout || hint.dataset.standaard; hint.classList.toggle('fout', !!fout); }
  }

  // --- galerij: vak kiezen en voorstel invullen
  function vulVakken() {
    const sel = $('g-vak'), huidig = sel.value;
    const lijst = vakkenUitGalerij(galerij);
    sel.replaceChildren(new Option('Kies een vak', ''));
    for (const v of lijst) sel.append(new Option(`${v.vak} (${v.aantal} ${v.aantal === 1 ? 'cijfer' : 'cijfers'})`, v.vak));
    sel.value = lijst.some((v) => v.vak === huidig) ? huidig : '';
    const leeg = lijst.length === 0;
    $('g-leeg').hidden = !leeg;
    $('g-keuze').hidden = leeg;
  }
  function stelVoorOp() {
    const vak = $('g-vak').value;
    const info = $('g-info');
    info.hidden = !vak;
    if (!vak) { voorstel = { som: '', weging: '' }; $('g-som').value = ''; $('g-weging').value = ''; return; }
    const r = somUitGalerij(galerij, vak);
    voorstel = { som: formatGetal(r.som), weging: formatGetal(r.weging) };
    $('g-som').value = voorstel.som;
    $('g-weging').value = voorstel.weging;
    $('g-basis').textContent = `Op basis van ${r.aantal} ${r.aantal === 1 ? 'cijfer' : 'cijfers'} die je in de extensie hebt geopend.`;
    const lijst = $('g-lijst');
    lijst.replaceChildren();
    for (const k of r.kaarten) {
      const li = el('li');
      li.append(el('b', '', formatGetal(k.cijfer, 2)), document.createTextNode(` met weging ${formatGetal(k.weging)}`));
      if (k.onderwerp) li.append(el('span', 'onderwerp', ` ${k.onderwerp}`));
      lijst.append(li);
    }
  }

  function zetModus(nieuw) {
    modus = nieuw;
    $('deel-galerij').hidden = modus !== 'galerij';
    $('deel-zelf').hidden = modus !== 'zelf';
    $('m-' + modus).checked = true;
  }

  // --- uitkomsten op het scherm
  function zinInDom(doel, z, detail) {
    doel.replaceChildren();
    const p = el('p', 'zin ' + z.soort);
    if (z.voor) p.append(el('span', 'zin-deel', z.voor));
    if (z.getal) p.append(el('strong', 'getal', z.getal));
    if (z.na) p.append(el('span', 'zin-deel', z.na));
    doel.append(p);
    if (detail) doel.append(el('p', 'detail', detail));
  }

  function render() {
    const inv = {
      modus, vak: $('g-vak').value, som: $('g-som').value, totaalWeging: $('g-weging').value,
      gemiddelde: $('z-gem').value, weging: $('z-weging').value,
      gewenst: $('d-gew').value, toetsWeging: $('d-tw').value, aantal: $('d-n').value, mogelijk: $('w-cijfer').value,
    };
    const r = bereken(inv);
    for (const naam of Object.keys(VELD_ID)) zetVeld(naam, r.fouten[naam]);

    // voorstel aangepast? dan een knop om terug te gaan
    $('g-herstel').hidden = !(modus === 'galerij' && $('g-vak').value && (inv.som !== voorstel.som || inv.totaalWeging !== voorstel.weging));
    $('g-gem').textContent = modus === 'galerij' && r.start ? `Dat is een gemiddelde van ${formatCijfer(r.start.gemiddelde)}.` : '';
    $('g-gem').hidden = !$('g-gem').textContent;

    // snelkeuze
    const gew = parseGetal(inv.gewenst);
    for (const knop of document.querySelectorAll('#snel button')) knop.setAttribute('aria-pressed', String(Number.isFinite(gew) && Math.abs(gew - Number(knop.dataset.waarde)) < 1e-9));

    // uitkomst
    const paneel = $('u-paneel');
    for (const s of ['haalbaar', 'gehaald', 'onhaalbaar', 'melding']) paneel.classList.remove('s-' + s);
    if (r.uitkomst) {
      paneel.classList.add('s-' + r.uitkomst.soort);
      zinInDom($('uitkomst'), r.uitkomst, r.uitkomst.detail);
    } else {
      paneel.classList.add('s-melding');
      const galerijLeeg = modus === 'galerij' && vakkenUitGalerij(galerij).length === 0;
      const tekst = galerijLeeg ? 'Je galerij is nog leeg. Kies Zelf invullen om je gemiddelde in te vullen.' : r.melding || 'Vul hierboven je gegevens in.';
      zinInDom($('uitkomst'), { soort: 'melding', voor: tekst, getal: '', na: '' }, '');
    }

    // wat als
    zinInDom($('wat-als'), r.watAls.soort === 'ok' ? r.watAls : { soort: 'melding', voor: r.watAls.tekst, getal: '', na: '' }, r.watAls.soort === 'ok' ? r.watAls.detail : '');

    // tabel
    $('t-leeg').hidden = !!r.tabel;
    $('t-tabel').hidden = !r.tabel;
    const onhaalbaar = r.tabel && r.tabel.find((rij) => rij.status === 'onhaalbaar');
    $('t-max').hidden = !onhaalbaar;
    $('t-max').textContent = onhaalbaar ? `Het hoogste gemiddelde dat nog kan, is een ${onhaalbaar.hoogsteTekst}. Dat haal je met een 10,0 voor ${inv.aantal === '1' ? 'de toets' : 'alle toetsen'}.` : '';
    const body = $('t-body');
    body.replaceChildren();
    if (r.tabel) {
      for (const rij of r.tabel) {
        const tr = el('tr', 's-' + rij.status);
        const th = el('th'); th.scope = 'row'; th.textContent = rij.gewenstTekst;
        tr.append(th, el('td', 'nodig', rij.nodigTekst), el('td', 'status', rij.statusTekst));
        body.append(tr);
      }
    }
  }

  // --- aansluiten
  for (const id of ['g-som', 'g-weging', 'z-gem', 'z-weging', 'd-gew', 'd-tw', 'w-cijfer']) $(id).addEventListener('input', render);
  $('d-n').addEventListener('change', render);
  $('g-vak').addEventListener('change', () => { stelVoorOp(); render(); });
  for (const radio of document.querySelectorAll('input[name="modus"]')) {
    radio.addEventListener('change', () => { gekozen = true; zetModus(radio.value); render(); });
  }
  $('g-herstel').addEventListener('click', () => { stelVoorOp(); render(); $('g-som').focus(); });
  $('g-naar-zelf').addEventListener('click', () => { gekozen = true; zetModus('zelf'); render(); $('z-gem').focus(); });
  for (const waarde of SNEL) {
    const knop = el('button', 'chip', formatCijfer(waarde));
    knop.type = 'button';
    knop.dataset.waarde = String(waarde);
    knop.setAttribute('aria-pressed', 'false');
    knop.addEventListener('click', () => { $('d-gew').value = formatCijfer(waarde); render(); });
    $('snel').append(knop);
  }

  // Beginwaarden
  $('d-gew').value = '5,5';
  $('d-tw').value = '2';
  $('d-n').value = '1';
  zetModus('zelf');
  render();

  async function startGalerij() {
    galerij = await laadGalerij();
    vulVakken();
    if (!gekozen && vakkenUitGalerij(galerij).length) { zetModus('galerij'); }
    if (!$('g-vak').value) stelVoorOp(); else if ($('g-herstel').hidden) stelVoorOp();
    render();
  }
  startGalerij();
  try {
    const lokaal = opslag();
    if (lokaal && TEGENWOORDIG.storage.onChanged) {
      TEGENWOORDIG.storage.onChanged.addListener((wijz, gebied) => {
        if (gebied === 'local' && wijz[SLEUTEL_GALERIJ]) startGalerij();
      });
    }
  } catch (_) { /* geen opslag: geen live updates */ }
})();
