/*
 * Somtoday Pack Opener — openingen/proef.js
 * Alleen voor ontwikkelaars (zit niet in de extensie, wel in stage.html): het kleinste werkende voorbeeld van een
 * opening. Kijk met stage.html?opening=proef&cijfer=8.4&direct=true&stil=true&debug=1 hoe het eruitziet. Neem dit
 * bestand als uitgangspunt voor een echte opening en lees motor/openingen/LEESMIJ.md.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  SPO.OPENINGEN.proef = { naam: 'Proef', knop: 'Proef starten', tekst: 'Een proefopening.', aria: 'Proef' }; // teksten voor het startscherm
  const { KOP, GEMEEN, VS_VOL } = SPO.shaders;

  // Eén shader over het hele beeld. p loopt van -0,5 tot 0,5 in de hoogte (zie LEESMIJ).
  const FS_RING = `${KOP}
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom, uTime, uLaad, uAlpha, uOnthuld;
uniform vec3 uKleur;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float r = length(p);
  vec3 col = vec3(.008, .012, .035) + vec3(.2, .3, .6) * .12 * exp(-r * 3.);
  float ring = exp(-pow((r - .1 - .28 * uLaad) * 16., 2.));
  // tot het hoogtepunt blijft alles koel; pas dan komt de kleur van het niveau
  col += mix(vec3(.45, .65, 1.), uKleur, uOnthuld) * ring * (.35 + 1.6 * uLaad);
  col *= 1. + .04 * (h21(gl_FragCoord.xy + uTime) - .5);
  o = vec4(col * uAlpha, 1.);
}`;

  SPO.openingen.proef = {
    naam: 'proef',

    // Worden gecompileerd zodra deze opening aan de beurt is. In de code heet het programma c.prog('ring').
    shaders: { ring: { vs: VS_VOL, fs: FS_RING, teken: 'vol' } },

    // Tijden in seconden vanaf de start. E = hoogtepunt, K0 = hier begint de kaart. Houd rekening met d.snel.
    tijdlijn(d) {
      const E = d.snel ? 2.2 : 4.5;
      return { E, K0: E + 1, fotos: [0.8, E - 0.8, E + 0.1, E + 0.5, E + 0.9] };
    },

    // Extra afbeeldingen (canvas). Mag een gewone functie zijn of een generator die tussendoor `yield` doet.
    art() {
      return {};
    },

    // Wordt één keer aangeroepen als de scène wordt opgebouwd. c is de omgeving (zie LEESMIJ).
    maak(c) {
      const { tl, I } = c;
      const E = tl.E;
      const p = c.prog('ring');

      // Eenmalige gebeurtenissen: geluid, trillen. (Niet visueel: het beeld is een functie van t.)
      c.at(0.1, () => c.audio.whoosh(0.7));
      c.at(0.3, () => c.audio.riser(E - 0.3, 0.8));
      c.at(E - 0.1, () => c.audio.scheur(0.9));
      c.at(E, () => {
        c.audio.boem(0.8);
        c.trillen([30, 20, 60]);
      });
      // Camera-schok, flits en schokgolf: ook vooraf aangemeld, de motor rekent ze per beeld uit.
      c.schok(E, 0.05, 0.28);
      c.flits(E, 0.6, 0.05);
      c.golf(E, 1.5, 1, 0);
      // Een eigen deeltjesbron: wij tekenen die zelf met c.zend.
      const vonken = c.e({ mode: 0, t0: E, delay: 0.05, life: 1.4, n: Math.round(300 + 900 * I), org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.25, 1.6], grav: [0, -0.4], drag: 1.2, size: [0.002, 0.006], col1: c.kl, col2: [1, 0.96, 0.85], seed: 5 });

      function ring(t, laad) {
        p.gebruik();
        c.basis(p); // zet uRes, uShake en uZoom
        p.f1('uTime', t);
        p.f1('uLaad', laad);
        p.f1('uOnthuld', t >= E ? 1 : 0);
        p.f1('uAlpha', 1 - c.sm(t, tl.K0 - 0.1, tl.K0 + 0.3));
        p.v3('uKleur', c.kl); // live: bij een Icoon wisselt die van tint
        c.motor.mengen('optel');
        c.motor.volledig();
      }

      return {
        teken(t) {
          ring(t, t >= E ? 1 : c.ramp(t, 0.3, E) * 0.95);
          if (t >= E - 0.01 && t <= E + 1.6) c.zend(t, vonken);
          // wensen voor de nabewerking: alleen invullen wat je anders wilt dan standaard
          c.post.zoom = 1 + 0.04 * c.sm(t, 0.3, E);
          c.post.rad = t >= E ? 0.25 * Math.exp(-(t - E) / 0.25) : 0;
        },
        // het rustige beeld op het startscherm (voordat je klikt)
        wacht(t) {
          ring(t, 0.1 + 0.05 * Math.sin(t));
        },
        // continu trillen van de camera (optioneel); stoten via c.schok
        schud(t) {
          return t > E - 1 && t < E ? 0.004 * c.ramp(t, E - 1, E) : 0;
        },
      };
    },
  };
})();
