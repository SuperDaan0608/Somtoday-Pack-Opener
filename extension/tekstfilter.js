// Tekstfilter (v3.0). Draait in de browser, bij de schrijver EN bij de lezer: de server kan nooit inhoud lezen.
// Gebruik (window.SPOTekst, of require() in Node):
//   SPOTekst.controleer(tekst, { max: 300, soort: 'naam' | 'tekst' })  ->  { ok, schoon, reden, melding }
//        reden: '' | 'woord' | 'persoonlijk' | 'tekens' | 'lengte' | 'hulp'. 'melding' is de nette tekst voor de gebruiker.
//   SPOTekst.toon(tekst)             tekst van ANDEREN: komt hij niet door het filter, dan staat er '•••'
//   SPOTekst.toonNaam(tekst, std)    idem voor een naam: valt hij af, dan komt de standaardnaam terug (bijv. 'Vriend a1b2')
//   SPOTekst.veilig(tekst)           alleen onzichtbare tekens, richtingtekens en gestapelde tekens (zalgo) weghalen
//   SPOTekst.koppel(veld, opties)    filter op een invoerveld: melding eronder, setCustomValidity, blokkeert verzenden
//   SPOTekst.geldig(veld)            controleert een gekoppeld veld nu meteen (true/false) en toont de melding
// Het filter weigert nooit met het woord erbij: de gebruiker krijgt alleen "Deze tekst kan niet. Kies andere woorden."
// De woordenlijst staat apart in tekstfilter-woorden.js (laad die EERST).
(function (wortel, fabriek) {
  'use strict';
  var W = null;
  if (typeof module === 'object' && module.exports) { try { W = require('./tekstfilter-woorden.js'); } catch (e) { W = null; } }
  else W = wortel.SPOTekstWoorden || null;
  var api = fabriek(W);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SPOTekst = api;
  else if (!(typeof module === 'object' && module.exports)) wortel.SPOTekst = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (W) {
  'use strict';

  var MAX_TEKST = 300, MAX_NAAM = 24, MAX_EMOJI = 10, MAX_EMOJI_NAAM = 3;
  var STREEPJES = '\u2022\u2022\u2022'; // \u2022\u2022\u2022

  // ---- Meldingen (nooit het woord noemen) ----
  var MELDING = {
    woord: 'Deze tekst kan niet. Kies andere woorden.',
    persoonlijk: 'Zet hier geen persoonlijke gegevens, zoals een telefoonnummer, e-mailadres, link of gebruikersnaam.',
    tekens: 'Deze tekst bevat tekens die niet kunnen. Gebruik gewone letters, cijfers en emoji.',
    lengte: 'Deze tekst is te lang.',
    hulp: 'Wat je schrijft klinkt zwaar. Je hebt niets verkeerds gedaan door het te typen. Praat erover met iemand die je vertrouwt, of bel of chat gratis en anoniem met 113 Zelfmoordpreventie: 113.nl of 0800-0113. Deze tekst wordt niet met anderen gedeeld.'
  };

  // ---- Tekens ----
  // Onzichtbare tekens, richtingtekens en besturingstekens (op \n en \t na). De bestaande STUUR_TEKENS in vriendenlib.js hoort hierbij.
  var ONZ = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0E\uFEFF\u3164\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E0FFF}]/gu;
  var PRIV = /[\uE000-\uF8FF]/g;
  var SPATIES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t]/g;
  var ZWJ_OK = /(\p{Extended_Pictographic}\uFE0F?)\u200D(?=\p{Extended_Pictographic})/gu; // een echte emoji-samenstelling blijft heel
  var EMOJI_EENHEID = '\\p{Extended_Pictographic}[\\uFE0F\\u20E3\\u{1F3FB}-\\u{1F3FF}\\uE001]*';
  var EMOJI_REEKS = new RegExp('(?:' + EMOJI_EENHEID + ')+', 'gu');
  var EMOJI_ENKEL = new RegExp(EMOJI_EENHEID, 'gu');

  function beperkEmoji(s, n) {
    return s.replace(EMOJI_REEKS, function (reeks) {
      var delen = reeks.match(EMOJI_ENKEL) || [];
      return delen.length <= n ? reeks : delen.slice(0, n).join('');
    });
  }
  function telEmojiReeks(s) {
    var max = 0, m = s.match(EMOJI_REEKS) || [];
    for (var i = 0; i < m.length; i++) max = Math.max(max, (m[i].match(EMOJI_ENKEL) || []).length);
    return max;
  }
  function tel(s) { var n = 0; for (var c of s) { n++; if (c) { /* telt tekens, geen UTF-16-delen */ } } return n; }

  // Alleen onzichtbaar, richting en zalgo weg; gewone tekst blijft zoals hij was.
  function veilig(tekst) {
    if (typeof tekst !== 'string') return '';
    var s = tekst.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n').replace(SPATIES, ' ');
    s = s.replace(PRIV, '').replace(ZWJ_OK, '$1\uE001').replace(ONZ, '');
    s = s.replace(/^\p{M}+/u, '').replace(/(\p{M}{2})\p{M}+/gu, '$1');
    s = beperkEmoji(s, MAX_EMOJI);
    return s.replace(/\uE001/g, '\u200D');
  }

  // ---- Normaliseren voor de woordcontrole ----
  var LOOK = {};
  function zet(van, naar) { for (var i = 0; i < van.length; i++) LOOK[van[i]] = naar; }
  // Cyrillisch
  zet('\u0430\u0105', 'a'); zet('\u0432', 'b'); zet('\u0435\u0451\u0454', 'e'); zet('\u043A', 'k'); zet('\u043C', 'm'); zet('\u043D\u04BB', 'h');
  zet('\u043E', 'o'); zet('\u0440', 'p'); zet('\u0441', 'c'); zet('\u0442', 't'); zet('\u0443', 'y'); zet('\u0445', 'x'); zet('\u0456\u0457', 'i');
  zet('\u0458', 'j'); zet('\u0455', 's'); zet('\u0501', 'd'); zet('\u051B', 'q'); zet('\u051D', 'w'); zet('\u04CF', 'l'); zet('\u0433', 'r');
  zet('\u043F', 'n'); zet('\u0438', 'u'); zet('\u044C', 'b'); zet('\u0437', '3');
  // Grieks
  zet('\u03B1', 'a'); zet('\u03B2', 'b'); zet('\u03B3', 'y'); zet('\u03B5', 'e'); zet('\u03B7', 'n'); zet('\u03B9', 'i'); zet('\u03BA', 'k');
  zet('\u03BC', 'u'); zet('\u03BD', 'v'); zet('\u03BF\u03C3', 'o'); zet('\u03C1', 'p'); zet('\u03C4', 't'); zet('\u03C5', 'u'); zet('\u03C7', 'x');
  zet('\u03C9', 'w'); zet('\u03F2', 'c'); zet('\u03F3', 'j');
  // Latijn met streepjes, kleine hoofdletters en omgedraaide letters
  zet('\u00F8', 'o'); zet('\u00F0', 'd'); zet('\u0142', 'l'); zet('\u0111', 'd'); zet('\u0127', 'h'); zet('\u0167', 't'); zet('\u0131', 'i');
  zet('\u0237', 'j'); zet('\u0251', 'a'); zet('\u0261', 'g'); zet('\u0269', 'i'); zet('\u028B', 'v'); zet('\u0138', 'k'); zet('\u014B', 'n');
  zet('\u1D00', 'a'); zet('\u0299', 'b'); zet('\u1D04', 'c'); zet('\u1D05', 'd'); zet('\u1D07', 'e'); zet('\uA730', 'f'); zet('\u0262', 'g');
  zet('\u029C', 'h'); zet('\u026A', 'i'); zet('\u1D0A', 'j'); zet('\u1D0B', 'k'); zet('\u029F', 'l'); zet('\u1D0D', 'm'); zet('\u0274', 'n');
  zet('\u1D0F', 'o'); zet('\u1D18', 'p'); zet('\u0280', 'r'); zet('\uA731', 's'); zet('\u1D1B', 't'); zet('\u1D1C', 'u'); zet('\u1D20', 'v');
  zet('\u1D21', 'w'); zet('\u028F', 'y'); zet('\u1D22', 'z');
  zet('\u0250', 'a'); zet('\u01DD', 'e'); zet('\u025F', 'f'); zet('\u0183', 'g'); zet('\u0265', 'h'); zet('\u1D09', 'i'); zet('\u027E', 'j');
  zet('\u029E', 'k'); zet('\u026F', 'm'); zet('\u0279', 'r'); zet('\u0287', 't'); zet('\u028C', 'v'); zet('\u028D', 'w'); zet('\u028E', 'y');
  LOOK['\u00DF'] = 'ss'; LOOK['\u00E6'] = 'ae'; LOOK['\u0153'] = 'oe';

  // Alles naar eenvoudige kleine letters: NFKC (fullwidth, omcirkeld, wiskundige letters), lookalikes, accenten weg.
  function basis(tekst) {
    var s = String(tekst).normalize('NFKC').replace(PRIV, '').replace(ONZ, '').replace(/\u200D/g, '');
    s = s.toLowerCase().replace(/[^\u0000-\u007F]/g, function (c) { return Object.prototype.hasOwnProperty.call(LOOK, c) ? LOOK[c] : c; });
    return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\r\n\t]+/g, ' ');
  }
  var CIJFERS = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't' };
  var SYMBOLEN = { '@': 'a', '$': 's', '!': 'i', '+': 't', '(': 'c', '\u20AC': 'e', '\u00A3': 'l', '|': 'i', '\u00A1': 'i', '\u00A7': 's', '\u00A2': 'c' };
  // Leetspeak per woord: cijfers alleen in een woord met letters; symbolen alleen tussen letters (of vooraan: $hit, (unt).
  function leet(b, eenIsL) {
    if (!/[0-9@$!+(|\u20AC\u00A3\u00A1\u00A7\u00A2]/.test(b)) return b;
    return b.split(' ').map(function (w) {
      if (!/[a-z]/.test(w)) return w;
      var t = '';
      for (var i = 0; i < w.length; i++) {
        var c = w[i];
        if (c === '1') t += eenIsL ? 'l' : 'i';
        else if (CIJFERS[c]) t += CIJFERS[c];
        else t += c;
      }
      var uit = '', j = 0;
      while (j < t.length) {
        if (SYMBOLEN[t[j]] === undefined) { uit += t[j]; j++; continue; }
        // Een rijtje symbolen ($$, !!) als geheel: alleen omzetten als er een letter vooraan staat (of $ ( vooraan) en een letter achter.
        var e = j;
        while (e < t.length && SYMBOLEN[t[e]] !== undefined) e++;
        var l = j > 0 && /[a-z]/.test(t[j - 1]), r = e < t.length && /[a-z]/.test(t[e]);
        var vooraan = j === 0 && r && '@$(\u00A7\u00A2'.indexOf(t[j]) >= 0;
        for (var q = j; q < e; q++) uit += (l && r) || vooraan ? SYMBOLEN[t[q]] : t[q];
        j = e;
      }
      return uit;
    }).join(' ');
  }
  function canon(s) { return s.replace(/([a-z])\1+/g, '$1'); }
  function cap2(s) { return s.replace(/([a-z0-9])\1{2,}/g, '$1$1'); }
  function voegLosseLetters(v) {
    var delen = v.split(' '), uit = [], buf = '';
    function leeg() { if (buf) { uit.push(buf); buf = ''; } }
    for (var i = 0; i < delen.length; i++) {
      if (/^[a-z]$/.test(delen[i])) buf += delen[i]; else { leeg(); if (delen[i]) uit.push(delen[i]); }
    }
    leeg();
    return uit.join(' ');
  }
  // Alle leesvarianten van de tekst: gesplitst op leestekens (k.u.t -> kut), met tekens tussen letters weg (kl.ootzak), 1=i en 1=l.
  function varianten(b) {
    var uit = [];
    [false, true].forEach(function (eenIsL) {
      var l = leet(b, eenIsL);
      var v1 = l.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      var v2 = l.replace(/(?<=[\p{L}\p{N}])[^\p{L}\p{N}\s]+(?=[\p{L}\p{N}])/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      [v1, v2].forEach(function (v) { v = voegLosseLetters(v); if (uit.indexOf(v) < 0) uit.push(v); });
    });
    return uit;
  }

  // Ondersteboven getypte tekst (ʇnʞ): de omgedraaide letters terugzetten en de volgorde omkeren.
  var ROT = { '\u0250': 'a', '\u01DD': 'e', '\u025F': 'f', '\u0183': 'g', '\u0265': 'h', '\u1D09': 'i', '\u027E': 'j', '\u029E': 'k', '\u026F': 'm', '\u0279': 'r', '\u0287': 't', '\u028C': 'v', '\u028D': 'w', '\u028E': 'y', n: 'u', u: 'n', d: 'p', p: 'd', b: 'q', q: 'b' };
  function draaiom(t) {
    var s = t.toLowerCase();
    if (!/[\u0250\u01DD\u025F\u0183\u0265\u1D09\u027E\u029E\u026F\u0279\u0287\u028C\u028D\u028E]/.test(s)) return '';
    return basis(Array.from(s).reverse().map(function (c) { return Object.prototype.hasOwnProperty.call(ROT, c) ? ROT[c] : c; }).join(''));
  }

  // ---- Lijsten klaarzetten ----
  function breidUit(lijst) {
    var uit = [];
    (lijst || []).forEach(function (r) {
      var i = r.indexOf('+');
      if (i < 0) { uit.push(r); return; }
      var stam = r.slice(0, i);
      uit.push(stam);
      r.slice(i + 1).split(',').forEach(function (s) { if (s) uit.push(stam + s); });
    });
    return uit;
  }
  // Patroon van een woord uit de lijst: een enkele letter mag in de tekst herhaald zijn (kuuuut, vanaf drie keer; aan het eind ook twee keer),
  // een dubbele letter (boob, gook) moet minstens twee keer staan. Zo blijft 'negeer' iets anders dan 'neger'.
  function patroon(w) {
    var src = '', i = 0;
    while (i < w.length) {
      var j = i;
      while (j < w.length && w[j] === w[i]) j++;
      var k = j - i, ch = w[i].replace(/[^a-z0-9]/g, '');
      if (ch) src += k === 1 ? ch + (j === w.length ? '{1,2}' : '(?:' + ch + '{2,})?') : ch + '{' + k + ',}';
      i = j;
    }
    return src;
  }
  var L = null;
  function lijsten() {
    if (L) return L;
    if (!W) return null;
    var set = function (a) { var s = new Set(); a.forEach(function (x) { s.add(x); }); return s; };
    var zin = function (a) { return (a || []).map(function (z) { return canon(z); }); };
    var uitz = new Set();
    breidUit(W.uitzondering).forEach(function (x) { uitz.add(x); uitz.add(canon(x)); });
    var woorden = new Map();
    breidUit(W.woorden).forEach(function (w) {
      var c = canon(w), re = new RegExp('^' + patroon(w) + '$');
      if (!woorden.has(c)) woorden.set(c, []);
      woorden.get(c).push(re);
    });
    var delen = function (lijst, anker) {
      return breidUit(lijst).map(function (w) { return { c: canon(w), re: new RegExp((anker ? '^' : '') + patroon(w)) }; });
    };
    L = {
      woorden: woorden,
      exact: set(breidUit(W.exact).map(cap2)),
      begin: delen(W.begin, true),
      stam: delen(W.stam, false),
      zinnen: zin(W.zinnen), dreiging: zin(W.dreiging), hulp: zin(W.hulp), hulpStam: (W.hulpStam || []).map(canon),
      uitz: uitz,
      uitzZin: (W.uitzonderingZin || []).map(function (z) { return basis(z).replace(/[^a-z0-9]+/g, ' ').trim(); })
    };
    return L;
  }
  function omgekeerd(s) { return s.split('').reverse().join(''); }

  function woordIn(t, c, l) {
    var res = l.woorden.get(c);
    if (!res) return false;
    for (var i = 0; i < res.length; i++) if (res[i].test(t)) return true;
    return false;
  }
  function tokenSlecht(t, l, omgedraaid) {
    if (!t) return false;
    var c = canon(t);
    if (l.uitz.has(t) || l.uitz.has(c)) return false;
    if (omgedraaid) {
      // Omgekeerd getypt (reknak): alleen lange woorden, anders wordt 'regen' ineens 'neger'.
      if (c.length < 6) return false;
      if (woordIn(t, c, l) && c.length >= 6) return true;
      for (var a = 0; a < l.stam.length; a++) if (l.stam[a].c.length >= 6 && c.indexOf(l.stam[a].c) >= 0 && l.stam[a].re.test(t)) return true;
      return false;
    }
    if (woordIn(t, c, l) || l.exact.has(cap2(t))) return true;
    for (var i = 0; i < l.begin.length; i++) if (c.indexOf(l.begin[i].c) === 0 && l.begin[i].re.test(t)) return true;
    for (var j = 0; j < l.stam.length; j++) if (c.indexOf(l.stam[j].c) >= 0 && l.stam[j].re.test(t)) return true;
    return false;
  }
  function tokensSlecht(tokens, l) {
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (tokenSlecht(t, l, false)) return true;
      var zonderCijfer = t.replace(/[0-9]+$/, '');
      if (zonderCijfer !== t && zonderCijfer.length > 2 && tokenSlecht(zonderCijfer, l, false)) return true;
      if (t.length >= 6 && tokenSlecht(omgekeerd(t), l, true)) return true;
      // Losse stukjes (k ut, ku t): twee naastliggende stukken samenvoegen als een ervan heel kort is.
      if (i + 1 < tokens.length && (t.length <= 2 || tokens[i + 1].length <= 2) && /^[a-z]+$/.test(t + tokens[i + 1])) {
        if (tokenSlecht(t + tokens[i + 1], l, false)) return true;
      }
    }
    return false;
  }
  function zinZit(v, lijst) {
    var p = ' ' + canon(v) + ' ';
    for (var i = 0; i < lijst.length; i++) if (p.indexOf(' ' + lijst[i] + ' ') >= 0) return true;
    // Zonder spaties getypt ('ikmaakjedood'): alleen binnen een lang woord.
    var tokens = v.split(' ');
    for (var k = 0; k < lijst.length; k++) {
      var z = lijst[k].replace(/ /g, '');
      if (z.length < 10) continue;
      for (var t = 0; t < tokens.length; t++) if (tokens[t].length >= z.length && canon(tokens[t]).indexOf(z) >= 0) return true;
    }
    return false;
  }
  function hulpStam(v, l) {
    var p = canon(v.replace(/ /g, ''));
    var tokens = v.split(' ');
    for (var i = 0; i < l.hulpStam.length; i++) {
      for (var t = 0; t < tokens.length; t++) if (canon(tokens[t]).indexOf(l.hulpStam[i]) >= 0) return true;
    }
    return p.indexOf('zelfmoord') >= 0 && v.indexOf('zelf moord') >= 0;
  }

  // ---- Persoonlijke gegevens ----
  var TLD = 'nl|com|be|net|org|eu|de|io|gg|ly|tv|app|xyz|info|shop|dev|uk|fr|ru|cc|link|online|store|club|site';
  var RE_LINK = new RegExp('(?:^|[^a-z0-9@])((?:[a-z0-9][a-z0-9-]*\\.)+)(' + TLD + ')(?![a-z0-9])', 'gi');
  var PLAT = '(?:snap(?:chat)?|insta(?:gram)?|tik\\s?tok|discord|whats\\s?app|telegram|kik|twitch|youtube|skype|facetime|signal|roblox|bereal|pinterest|reddit|twitter)';
  var RE_PERS = [
    /(?:https?|ftp):|:\/\/|\bwww\b|\b(?:t|wa)\.me\b/,
    /\b(?:punt|dot)\s+(?:nl|com|be|net|org|eu|de)\b|\((?:dot|punt)\)|\[(?:dot|punt)\]/,
    /[a-z0-9._%+\-]+\s*(?:@|\(at\)|\[at\]|\{at\})\s*[a-z0-9\-]+\s*(?:\.|\(dot\)|\[dot\]|\s+dot\s+|\s+punt\s+)\s*[a-z]{2,}/,
    /\b[a-z0-9._\-]+\s+(?:at|apestaart)\s+[a-z0-9\-]+\s+(?:dot|punt)\s+[a-z]{2,}\b/,
    /\b(?:gmail|hotmail|outlook|icloud|yahoo|ziggo|kpnmail|protonmail|gmx)\b/,
    /(?:^|[^a-z0-9._@])@[a-z0-9][a-z0-9._]+/,
    new RegExp('\\b' + PLAT + '\\b\\s*(?::|=|=>|-|\\bis\\b|\\bheet\\b|\\bnaam\\b|\\buser(?:name)?\\b|\\bacc(?:ount)?\\b|@)\\s*[a-z0-9._]{3,}'),
    new RegExp('\\b' + PLAT + '\\b\\s+(?=[a-z0-9._]*[a-z])(?=[a-z0-9._]*[0-9_.])[a-z0-9._]{3,}'),
    /\b(?:ig|tt|dc|wa|snap|insta)\s*(?::|=|@)\s*[a-z0-9._]{3,}/,
    /\b(?:add|dm|pm|app|appen|bel|bellen|mail|snap|text|whatsapp)\s+(?:me|mij|m)\b/,
    new RegExp('\\b(?:mijn|m.n|my)\\s+(?:' + PLAT.slice(3, -1) + '|mail|email|e-?mail|adres|address|username|gebruikersnaam)\\s*(?:is|=|:|-)'),
    /\b[a-z]{3,}(?:straat|laan|weg|plein|gracht|singel|dijk|pad|kade|steeg|hof|park|dreef)\s+\d{1,4}\s?[a-z]?\b/,
    /\b[1-9]\d{3}[a-z]{2}\s*,?\s*\d{1,4}\b/
  ];
  var CIJFERWOORDEN = new Set(['nul', 'zero', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'oh']);
  var EENHEDEN = new Set(['KM', 'KG', 'MG', 'ML', 'CL', 'DL', 'CM', 'MM', 'HZ', 'KB', 'MB', 'GB', 'TB', 'MS', 'NM', 'KJ', 'KW', 'KV', 'MV', 'EV']);

  function persoonlijk(tekst) {
    var o = tekst.normalize('NFKC').replace(PRIV, '').replace(ONZ, '').replace(/\u200D/g, '');
    var b = basis(tekst);
    // Links met punt-tld; een hoofdletter direct achter de punt ('ok.De leraar') is een zin zonder spatie, geen link.
    var m;
    RE_LINK.lastIndex = 0;
    while ((m = RE_LINK.exec(o)) !== null) {
      var tld = m[2];
      var idx = m.index + m[0].length - tld.length;
      if (/^[A-Z]/.test(o.slice(idx, idx + 1)) && /^[a-z]/.test(o.slice(idx - 2, idx - 1))) continue;
      return true;
    }
    for (var i = 0; i < RE_PERS.length; i++) if (RE_PERS[i].test(b)) return true;
    // Telefoonnummers: negen of meer cijfers achter elkaar, ook met spaties, streepjes of haakjes ertussen.
    var d = b.replace(/(?<=\d)[\s\-.()\/_*\u00B7]+(?=\d)/g, '');
    if (/\d{9,}/.test(d)) return true;
    if (/(?:\+|\b00)\s*31[\s\-.()]*\(?0?\)?[\s\-.()]*[1-9](?:[\s\-.()]*\d){7,8}/.test(b)) return true;
    // Postcode in hoofdletters (1234 AB), behalve eenheden zoals 1000 KM.
    var pm = o.match(/\b[1-9]\d{3}\s?([A-Z]{2})\b/);
    if (pm && !EENHEDEN.has(pm[1]) && /[A-Z]{2}\b/.test(pm[0])) return true;
    // Cijfers als woorden: 'nul zes twaalf ...'
    var woorden = b.replace(/[^a-z ]+/g, ' ').split(/\s+/), reeks = 0;
    for (var k = 0; k < woorden.length; k++) { if (CIJFERWOORDEN.has(woorden[k])) { reeks++; if (reeks >= 8) return true; } else reeks = 0; }
    return false;
  }

  // ---- Controleren ----
  function fout(reden, extra) { return { ok: false, schoon: '', reden: reden, melding: (extra && extra.melding) || MELDING[reden] }; }
  function heeftSlechteTekens(tekst, soort) {
    var tmp = tekst.replace(PRIV, '\uE000').replace(ZWJ_OK, '$1');
    if (/\uE000/.test(tmp)) return true;
    ONZ.lastIndex = 0;
    if (ONZ.test(tmp)) { ONZ.lastIndex = 0; return true; }
    ONZ.lastIndex = 0;
    if (/\p{M}{3,}/u.test(tekst.normalize('NFC'))) return true;
    if (telEmojiReeks(tekst) > (soort === 'naam' ? MAX_EMOJI_NAAM : MAX_EMOJI)) return true;
    if (soort === 'naam') {
      if (/(.)\1{4,}/u.test(tekst)) return true;
      var zonderEmoji = tekst.replace(EMOJI_REEKS, '').replace(/[\uFE0F\u200D]/g, '');
      if (!/^[\p{L}\p{N} .'\u2019\-_!?&,+]*$/u.test(zonderEmoji)) return true;
      if (/[\n]/.test(tekst)) return true;
    }
    return false;
  }

  function controleer(tekst, opties) {
    var o = opties || {};
    // 'code' (vriendcode, link): alleen de tekenset en de lengte controleren, geen woorden.
    var soort = o.soort === 'naam' ? 'naam' : o.soort === 'code' ? 'code' : 'tekst';
    var max = typeof o.max === 'number' && o.max > 0 ? o.max : (soort === 'naam' ? MAX_NAAM : soort === 'code' ? 400 : MAX_TEKST);
    if (typeof tekst !== 'string') return fout('tekens');
    if (tekst.length > max * 4 + 20) return fout('lengte', { melding: MELDING.lengte + ' Hou het onder ' + max + ' tekens.' });
    var l = lijsten();
    if (!l) return fout('woord'); // woordenlijst niet geladen: liever dicht dan open
    if (heeftSlechteTekens(tekst, soort)) return fout('tekens');
    var schoon = veilig(tekst).trim();
    if (tel(schoon) > max) return fout('lengte', { melding: MELDING.lengte + ' Hou het onder ' + max + ' tekens.' });
    if (!schoon) return { ok: true, schoon: '', reden: '', melding: '' };
    if (soort === 'code') {
      return /^[A-Za-z0-9_\-+=\/:.?&#%~@ ]*$/.test(schoon) ? { ok: true, schoon: schoon, reden: '', melding: '' } : fout('tekens');
    }

    var b = basis(schoon);
    var draai = draaiom(schoon);
    var vs = draai ? varianten(draai) : [];
    l.uitzZin.forEach(function (z) {
      var schoner = ' ' + b.replace(/[^a-z0-9]+/g, ' ') + ' ';
      if (schoner.indexOf(' ' + z + ' ') >= 0) b = schoner.split(' ' + z + ' ').join(' ').trim();
    });
    vs = varianten(b).concat(vs);
    var i;
    for (i = 0; i < vs.length; i++) if (zinZit(vs[i], l.dreiging)) return fout('woord');
    for (i = 0; i < vs.length; i++) if (zinZit(vs[i], l.hulp) || hulpStam(vs[i], l)) return fout('hulp');
    for (i = 0; i < vs.length; i++) if (zinZit(vs[i], l.zinnen) || tokensSlecht(vs[i] ? vs[i].split(' ') : [], l)) return fout('woord');
    if (persoonlijk(schoon)) return fout('persoonlijk');
    return { ok: true, schoon: schoon, reden: '', melding: '' };
  }

  // Tekst van ANDEREN: komt hij niet door het filter, dan '•••'. Lengte telt hier ruim (de lezer-lib begrenst zelf al).
  var toonGeheugen = new Map();
  function toon(tekst) {
    if (typeof tekst !== 'string' || !tekst) return '';
    var oud = toonGeheugen.get(tekst);
    if (oud !== undefined) return oud;
    var r = controleer(tekst, { max: 2000 });
    var uit = r.ok ? r.schoon : STREEPJES;
    if (toonGeheugen.size > 2000) toonGeheugen.clear();
    toonGeheugen.set(tekst, uit);
    return uit;
  }
  function toonNaam(tekst, standaard) {
    if (typeof tekst !== 'string' || !tekst.trim()) return standaard;
    var r = controleer(tekst, { soort: 'naam', max: 40 });
    return r.ok && r.schoon ? r.schoon : standaard;
  }

  // ---- Invoervelden ----
  var STIJL_ID = 'spo-tekstfilter-stijl';
  function zetStijl(doc) {
    if (!doc || doc.getElementById(STIJL_ID) || !doc.head) return;
    var st = doc.createElement('style');
    st.id = STIJL_ID;
    st.textContent = '.spo-tekst-melding{margin:6px 0 0;padding:0;font-size:.85em;line-height:1.4;color:#c0392b;font-weight:600}' +
      '.spo-tekst-melding[hidden]{display:none}' +
      '.spo-tekst-melding.spo-tekst-hulp{padding:10px 12px;border-radius:10px;border:1px solid rgba(80,150,220,.55);background:rgba(80,150,220,.14);color:inherit;font-weight:400}' +
      '.spo-tekst-melding a{color:inherit;font-weight:700;text-decoration:underline}' +
      '@media (prefers-color-scheme: dark){.spo-tekst-melding:not(.spo-tekst-hulp){color:#ff8a7a}}';
    doc.head.appendChild(st);
  }
  function maakMelding(el, r, max) {
    var doc = el.ownerDocument;
    var m = el._spoMelding;
    if (!m) {
      m = doc.createElement('div');
      m.className = 'spo-tekst-melding';
      m.setAttribute('role', 'status');
      m.setAttribute('aria-live', 'polite');
      m.hidden = true;
      m.id = 'spo-tm-' + Math.random().toString(36).slice(2, 8);
      el.insertAdjacentElement('afterend', m);
      el._spoMelding = m;
      var d = el.getAttribute('aria-describedby');
      el.setAttribute('aria-describedby', d ? d + ' ' + m.id : m.id);
    }
    m.textContent = '';
    m.classList.toggle('spo-tekst-hulp', r.reden === 'hulp');
    if (r.ok) { m.hidden = true; return; }
    if (r.reden === 'hulp') {
      m.append('Wat je schrijft klinkt zwaar. Je hebt niets verkeerds gedaan door het te typen. Praat erover met iemand die je vertrouwt, of bel of chat gratis en anoniem met 113 Zelfmoordpreventie: ');
      var a1 = doc.createElement('a'); a1.href = 'https://113.nl'; a1.target = '_blank'; a1.rel = 'noopener noreferrer'; a1.textContent = '113.nl';
      var a2 = doc.createElement('a'); a2.href = 'tel:08000113'; a2.textContent = '0800-0113';
      m.append(a1, ' of ', a2, '. Deze tekst wordt niet met anderen gedeeld.');
    } else m.textContent = r.melding;
    m.hidden = false;
  }
  function opties(el, o) {
    o = o || {};
    var soort = o.soort || (el.dataset && el.dataset.tekstfilter) || 'tekst';
    if (soort !== 'naam' && soort !== 'code') soort = 'tekst';
    var max = o.max;
    if (!max && el.dataset && el.dataset.tekstfilterMax) max = parseInt(el.dataset.tekstfilterMax, 10);
    return { soort: soort, max: max };
  }
  function controleVeld(el, o) {
    var r = controleer(el.value, opties(el, o));
    // Een leeg veld is hier altijd goed; 'verplicht' regelt de pagina zelf.
    maakMelding(el, r);
    el.setCustomValidity(r.ok ? '' : r.melding);
    if (el.setAttribute) el.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
    return r;
  }
  function koppel(el, o) {
    if (!el || el._spoGekoppeld) return el && el._spoGekoppeld;
    if (el.dataset && el.dataset.tekstfilter === 'uit' && !(o && o.soort)) return null; // bewust uitgezet (bijv. een cijferveld)
    zetStijl(el.ownerDocument);
    var doe = function () { return controleVeld(el, o); };
    el.addEventListener('input', doe);
    el.addEventListener('change', doe);
    el.addEventListener('blur', doe);
    var form = el.form;
    var opSubmit = function (e) {
      if (!controleVeld(el, o).ok) { e.preventDefault(); e.stopImmediatePropagation(); el.focus(); }
    };
    if (form) form.addEventListener('submit', opSubmit, true);
    var h = { controleer: doe, geldig: function () { return doe().ok; }, ontkoppel: function () {
      el.removeEventListener('input', doe); el.removeEventListener('change', doe); el.removeEventListener('blur', doe);
      if (form) form.removeEventListener('submit', opSubmit, true);
      el.setCustomValidity(''); if (el._spoMelding) el._spoMelding.hidden = true; el._spoGekoppeld = null;
    } };
    el._spoGekoppeld = h;
    el.tekstfilterGeldig = h.geldig;
    doe();
    return h;
  }
  // Voor knoppen die zelf opslaan: eerst dit aanroepen. Koppelt het veld als dat nog niet is gebeurd.
  function geldig(el, o) {
    if (!el) return false;
    if (el.dataset && el.dataset.tekstfilter === 'uit' && !(o && o.soort)) return true;
    if (!el._spoGekoppeld) koppel(el, o);
    return controleVeld(el, o).ok;
  }

  return {
    controleer: controleer, toon: toon, toonNaam: toonNaam, veilig: veilig, koppel: koppel, geldig: geldig,
    MELDING: MELDING, STREEPJES: STREEPJES, MAX_TEKST: MAX_TEKST, MAX_NAAM: MAX_NAAM,
    _basis: basis, _varianten: function (t) { return varianten(basis(t)); }
  };
});
