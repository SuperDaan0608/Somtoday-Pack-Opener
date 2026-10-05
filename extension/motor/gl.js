/*
 * Somtoday Pack Opener — gl.js
 * Een kleine WebGL2-laag: programma's (zo mogelijk parallel gecompileerd, zodat de pagina niet vastloopt),
 * render-doelen, de bloom-keten en de laatste nabewerking.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const SH = () => SPO.shaders;

  class Programma {
    constructor(motor, naam, vs, fs) {
      const gl = motor.gl;
      this.motor = motor;
      this.naam = naam;
      this.prog = gl.createProgram();
      this.vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(this.vs, vs);
      gl.compileShader(this.vs);
      this.fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(this.fs, fs);
      gl.compileShader(this.fs);
      gl.attachShader(this.prog, this.vs);
      gl.attachShader(this.prog, this.fs);
      gl.linkProgram(this.prog);
      this.loc = new Map();
      this.klaar = false;
      this.ok = false;
    }

    // true zodra het programma gecompileerd is (gelukt of niet).
    controleer() {
      if (this.klaar) return true;
      const gl = this.motor.gl;
      const ext = this.motor.parallel;
      if (ext && !gl.getProgramParameter(this.prog, ext.COMPLETION_STATUS_KHR)) return false;
      this.klaar = true;
      this.ok = !!gl.getProgramParameter(this.prog, gl.LINK_STATUS);
      if (!this.ok) {
        const fout = [gl.getShaderInfoLog(this.vs), gl.getShaderInfoLog(this.fs), gl.getProgramInfoLog(this.prog)].filter(Boolean).join('\n');
        this.motor.fouten.push(this.naam + ': ' + fout);
        if (this.motor.debug) console.error('[pakket] shader ' + this.naam + ' mislukt:\n' + fout);
      }
      // de ruwe shaders mogen weg, het programma blijft
      gl.deleteShader(this.vs);
      gl.deleteShader(this.fs);
      return true;
    }

    gebruik() {
      this.motor.gl.useProgram(this.prog);
      return this;
    }

    l(naam) {
      let v = this.loc.get(naam);
      if (v === undefined) {
        v = this.motor.gl.getUniformLocation(this.prog, naam);
        this.loc.set(naam, v);
      }
      return v;
    }

    f1(n, a) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform1f(l, a);
    }
    f2(n, a, b) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform2f(l, a, b);
    }
    f3(n, a, b, c) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform3f(l, a, b, c);
    }
    f4(n, a, b, c, d) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform4f(l, a, b, c, d);
    }
    v3(n, v) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform3f(l, v[0], v[1], v[2]);
    }
    i1(n, a) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform1i(l, a);
    }
    i2(n, a, b) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform2i(l, a, b);
    }
    v4s(n, arr) {
      const l = this.l(n);
      if (l) this.motor.gl.uniform4fv(l, arr);
    }
    // Koppelt een tekstuur aan een sampler: eenheid u.
    tex(n, u, t) {
      const gl = this.motor.gl;
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(gl.TEXTURE_2D, t);
      const l = this.l(n);
      if (l) gl.uniform1i(l, u);
    }
  }

  class Motor {
    constructor(canvas, gl, opties) {
      this.canvas = canvas;
      this.gl = gl;
      this.debug = !!(opties && opties.debug);
      this.fouten = [];
      this.parallel = gl.getExtension('KHR_parallel_shader_compile');
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      this.maxAniso = this.aniso ? Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 1;
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.p = {};
      this.doelen = null;
      this.breedte = 0;
      this.hoogte = 0;
      this.formaat = this.kiesFormaat();
      this.teken = { draws: 0 };
      this.kwaliteit = 0;
      this.leeg = this.maakLeegTextuur();
      this.bouwProgrammas();
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.frontFace(gl.CW); // onze vlakken zijn met de klok mee getekend
    }

    static maak(canvas, opties) {
      let gl = null;
      try {
        gl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
        });
      } catch (e) {
        gl = null;
      }
      return gl ? new Motor(canvas, gl, opties) : null;
    }

    // Welk formaat gebruiken we voor de beelden waar licht in wordt opgeteld? Liefst kleine HDR-
    // doelen (11-11-10 bit float: 4 bytes per pixel), dan 16-bit float, en anders gewoon 8 bit.
    kiesFormaat() {
      const gl = this.gl;
      const kandidaten = [];
      if (gl.getExtension('EXT_color_buffer_float')) {
        kandidaten.push({ naam: 'r11g11b10f', int: gl.R11F_G11F_B10F, fmt: gl.RGB, type: gl.UNSIGNED_INT_10F_11F_11F_REV });
        kandidaten.push({ naam: 'rgba16f', int: gl.RGBA16F, fmt: gl.RGBA, type: gl.HALF_FLOAT });
      } else if (gl.getExtension('EXT_color_buffer_half_float')) {
        kandidaten.push({ naam: 'rgba16f', int: gl.RGBA16F, fmt: gl.RGBA, type: gl.HALF_FLOAT });
      }
      kandidaten.push({ naam: 'rgba8', int: gl.RGBA8, fmt: gl.RGBA, type: gl.UNSIGNED_BYTE });
      for (const k of kandidaten) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, k.int, 4, 4, 0, k.fmt, k.type, null);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(f);
        gl.deleteTexture(t);
        if (ok) return k;
      }
      return kandidaten[kandidaten.length - 1];
    }

    maakLeegTextuur() {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    }

    bouwProgrammas() {
      const s = SH();
      const mk = (naam, vs, fs) => (this.p[naam] = new Programma(this, naam, vs, fs));
      mk('neer', s.VS_VOL, s.FS_NEER);
      mk('op', s.VS_VOL, s.FS_OP);
      mk('post', s.VS_VOL, s.FS_POST);
      mk('warp', s.VS_VOL, s.FS_WARP);
      mk('stralen', s.VS_VOL, s.FS_STRALEN);
      mk('licht', s.VS_VOL, s.FS_LICHT);
      mk('arena', s.VS_VOL, s.FS_ARENA);
      mk('pak', s.VS_PAK, s.FS_PAK);
      mk('kaart', s.VS_VLAK, s.FS_KAART);
      mk('plaat', s.VS_VLAK, s.FS_PLAAT);
      mk('deeltjes', s.VS_DEELTJES, s.FS_DEELTJES);
    }

    // Zijn alle programma's klaar? Zonder parallelle compilatie blokkeert dit tot ze klaar zijn.
    alleKlaar() {
      let klaar = true;
      for (const n in this.p) if (!this.p[n].controleer()) klaar = false;
      return klaar;
    }

    get gelukt() {
      return Object.values(this.p).every((p) => p.ok);
    }

    // ───────── render-doelen ─────────
    maakDoel(w, h, hdr = true) {
      const gl = this.gl;
      const f = hdr ? this.formaat : { int: gl.RGBA8, fmt: gl.RGBA, type: gl.UNSIGNED_BYTE };
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.int, w, h, 0, f.fmt, f.type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    }

    verwijderDoel(d) {
      if (!d) return;
      this.gl.deleteTexture(d.tex);
      this.gl.deleteFramebuffer(d.fbo);
    }

    // Stelt de grootte in waarop we daadwerkelijk tekenen (in echte pixels) en maakt de doelen opnieuw.
    zetGrootte(w, h) {
      w = Math.max(16, Math.round(w));
      h = Math.max(16, Math.round(h));
      if (this.doelen && w === this.breedte && h === this.hoogte) return;
      const gl = this.gl;
      if (this.doelen) {
        this.verwijderDoel(this.doelen.scene);
        this.doelen.neer.forEach((d) => this.verwijderDoel(d));
        this.doelen.op.forEach((d) => this.verwijderDoel(d));
      }
      this.breedte = w;
      this.hoogte = h;
      this.canvas.width = w;
      this.canvas.height = h;
      const neer = [];
      const op = [];
      let bw = w;
      let bh = h;
      const niveaus = Math.min(5, Math.max(2, Math.floor(Math.log2(Math.min(w, h) / 24))));
      for (let i = 0; i < niveaus; i++) {
        bw = Math.max(2, Math.ceil(bw / 2));
        bh = Math.max(2, Math.ceil(bh / 2));
        neer.push(this.maakDoel(bw, bh));
        if (i < niveaus - 1) op.push(this.maakDoel(bw, bh));
      }
      this.doelen = { scene: this.maakDoel(w, h), neer, op };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ───────── tekenen ─────────
    doel(d) {
      const gl = this.gl;
      if (d) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo);
        gl.viewport(0, 0, d.w, d.h);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.breedte, this.hoogte);
      }
    }

    // modus: 'geen' | 'optel' (licht) | 'alpha' (voorgemengd) | 'alpha-normaal'
    mengen(modus) {
      const gl = this.gl;
      if (modus === 'geen') gl.disable(gl.BLEND);
      else {
        gl.enable(gl.BLEND);
        if (modus === 'optel') gl.blendFunc(gl.ONE, gl.ONE);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
    }

    volledig() {
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.teken.draws++;
    }

    // Bloom: helder deel eruit halen, steeds kleiner maken en weer terug opgeteld.
    bloom(drempel) {
      const gl = this.gl;
      const { scene, neer, op } = this.doelen;
      this.mengen('geen');
      const n = this.p.neer.gebruik();
      let bron = scene;
      for (let i = 0; i < neer.length; i++) {
        this.doel(neer[i]);
        n.tex('uSrc', 0, bron.tex);
        n.f2('uTexel', 1 / bron.w, 1 / bron.h);
        n.f1('uDrempel', i === 0 ? drempel : 0);
        this.volledig();
        bron = neer[i];
      }
      const u = this.p.op.gebruik();
      let laag = neer[neer.length - 1];
      for (let i = neer.length - 2; i >= 0; i--) {
        this.doel(op[i]);
        u.tex('uLaag', 0, laag.tex);
        u.tex('uHoog', 1, neer[i].tex);
        u.f2('uTexel', 1 / laag.w, 1 / laag.h);
        u.f1('uSterkte', 0.85);
        this.volledig();
        laag = op[i];
      }
      return laag; // het resultaat met alle niveaus bij elkaar
    }

    // ───────── tekstuur uit een canvas ─────────
    tekstuur(bron, { mip = true, herhaal = false } = {}) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bron);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (mip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const w = herhaal ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      return t;
    }

    // Werkt een bestaande tekstuur bij (bijvoorbeeld het cijfer tijdens het optellen).
    verversTekstuur(t, bron) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bron);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    // Eén keer ‘droog’ tekenen met elk programma, zodat het stuurprogramma alles klaarzet vóór het
    // eerste echte beeld. Dat voorkomt een hapering midden in de animatie.
    opwarmen() {
      const gl = this.gl;
      this.zetGrootte(this.breedte || 64, this.hoogte || 64);
      const klein = this.maakDoel(16, 16);
      this.doel(klein);
      this.mengen('optel');
      for (let u = 0; u < 6; u++) {
        gl.activeTexture(gl.TEXTURE0 + u);
        gl.bindTexture(gl.TEXTURE_2D, this.leeg);
      }
      for (const n in this.p) {
        const p = this.p[n];
        if (!p.ok) continue;
        p.gebruik();
        if (n === 'pak') {
          p.i2('uRaster', 2, 2);
          gl.drawArrays(gl.TRIANGLES, 0, 24);
        } else if (n === 'deeltjes') {
          p.i1('uPer', 1);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 2);
        } else if (n === 'kaart' || n === 'plaat') {
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      this.verwijderDoel(klein);
      this.teken.draws = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    verwijder() {
      const gl = this.gl;
      try {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {
        /* al weg */
      }
    }
  }

  SPO.Motor = Motor;
})();
