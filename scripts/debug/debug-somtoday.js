/*
 * Somtoday Pack Opener DEBUG-BUILD: de ontvanger op Somtoday.
 * Het testmenu (debug.html) kan niet zelf in de Somtoday-pagina tekenen. Daarom zet het een opdracht in chrome.storage.local
 * ('spo_debug_cmd': { ts, cmd, ... }) en voert dit script hem uit. Dit bestand zit ALLEEN in de debug-zip (scripts/package-debug.sh).
 * Een opdracht werkt alleen als hij hoogstens 8 seconden oud is en dit tabblad zichtbaar is.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoDebugSomtoday) return;
  window.__spoDebugSomtoday = true;

  // Een klein label in de hoek, zodat je nooit vergeet dat dit de debug-build is.
  function label() {
    const h = document.createElement('spo-debug-label');
    const s = h.attachShadow({ mode: 'open' });
    s.innerHTML = '<style>:host{position:fixed;right:6px;bottom:6px;z-index:2147483647;pointer-events:none}' +
      'b{display:block;font:800 10px/1 system-ui,sans-serif;letter-spacing:.08em;color:#fff;background:#d6203b;padding:3px 6px;border-radius:5px;opacity:.85}</style><b>DEBUG</b>';
    (document.body || document.documentElement).appendChild(h);
  }
  if (document.body) label(); else document.addEventListener('DOMContentLoaded', label);

  // Huisdier: 'slaapt' forceren (true/false) of weer de klok volgen (null). huisdier.js leest globalThis.__spoDebugSlaap.
  function zetSlaap(w) {
    globalThis.__spoDebugSlaap = typeof w === 'boolean' ? w : undefined;
    try { if (window.SPOHuisdier) window.SPOHuisdier.tekenNu(); } catch (e) { /* geen huisdier */ }
  }

  const FEEST_LESSEN = [{ vak: 'Wiskunde', tijd: '09:00 tot 09:50' }, { vak: 'Engels', tijd: '10:00 tot 10:50' }];

  function voerUit(c) {
    switch (c.cmd) {
      case 'toast':
        if (typeof window.__spoDebugToon === 'function') window.__spoDebugToon(c.melding || {});
        break;
      case 'emoji': {
        const lijst = Array.isArray(c.emoji) && c.emoji.length ? c.emoji : ['\u{1F525}'];
        const n = Math.max(1, Math.min(40, c.aantal | 0 || 12));
        for (let i = 0; i < n; i++) {
          setTimeout(() => document.dispatchEvent(new CustomEvent('spo-emoji-in', { detail: { emoji: lijst[i % lijst.length], naam: i % 3 === 0 ? 'Debug' : '' } })), i * 160);
        }
        break;
      }
      case 'uitval':
        if (typeof window.__spoDebugFeest === 'function') window.__spoDebugFeest(FEEST_LESSEN);
        break;
      case 'evolutie':
        if (window.SPOHuisdier) window.SPOHuisdier.evolutie(Math.max(1, Math.min(4, c.stadium | 0 || 1)));
        break;
    }
  }

  const laatste = new Set();
  function opdracht(c) {
    if (!c || typeof c !== 'object' || typeof c.cmd !== 'string') return;
    if (Date.now() - (c.ts || 0) > 8000 || laatste.has(c.ts)) return;
    if (document.visibilityState !== 'visible') return;
    laatste.add(c.ts);
    try { voerUit(c); } catch (e) { console.warn('[debug]', e); }
  }

  try {
    chrome.storage.onChanged.addListener((w, gebied) => {
      if (gebied !== 'local') return;
      if (w.spo_debug_cmd) opdracht(w.spo_debug_cmd.newValue);
      if (w.spo_debug) zetSlaap((w.spo_debug.newValue || {}).slaap);
    });
    chrome.storage.local.get('spo_debug').then((r) => { if (r.spo_debug && typeof r.spo_debug.slaap === 'boolean') zetSlaap(r.spo_debug.slaap); });
  } catch (e) { /* geen opslag */ }
})();
