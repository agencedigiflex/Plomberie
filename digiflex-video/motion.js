/* Digiflex — l'agence au Canard
 * Composition 1920×1080 pilotée par une timeline GSAP en pause :
 * window.renderAt(t) affiche l'image exacte à l'instant t (rendu image par image),
 * window.SFX / window.MUFFLE listent les bruitages pour le mixage audio.
 */
(() => {
  const W = 1920, H = 1080;
  const stage = document.getElementById("stage");
  const tl = gsap.timeline({ paused: true });
  const SFX = (window.SFX = []);
  const MUFFLE = (window.MUFFLE = []);
  const procs = [];             // fonctions appelées à chaque image : f(t)

  // ---------------------------------------------------------------- utilitaires
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const rr = (a, b) => a + (b - a) * rnd();

  const sfx = (name, t, gain = 1) => SFX.push({ name, t: +t.toFixed(3), gain });

  const UNITLESS = new Set(["opacity", "zIndex", "flex", "fontWeight", "lineHeight"]);
  function el(tag, cls, parent, style = {}, html = "") {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const [k, v] of Object.entries(style)) e.style[k] = typeof v === "number" && !UNITLESS.has(k) ? v + "px" : v;
    if (html) e.innerHTML = html;
    (parent || stage).appendChild(e);
    return e;
  }
  const div = (cls, parent, style, html) => el("div", cls, parent, style, html);

  // --- timings de la voix off
  const SEG = TL.segs;
  const S = (i) => SEG[i].start;
  const E = (i) => SEG[i].start + SEG[i].dur;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  /** début du mot (n-ième occurrence) contenant `needle` dans la phrase i */
  function Wd(i, needles, occ = 0) {
    needles = [].concat(needles).map(norm);
    const ws = SEG[i].words;
    let seen = 0;
    for (const w of ws) {
      const n = norm(w.w);
      if (n && needles.some((x) => n.startsWith(x) || (x.length > 3 && n.includes(x)))) {
        if (seen++ === occ) return w.t;
      }
    }
    // repli : position proportionnelle dans le texte
    const txt = norm(SEG[i].text), p = txt.indexOf(needles[0]);
    console.warn("mot introuvable", i, needles, occ);
    return S(i) + SEG[i].dur * Math.max(0, p) / Math.max(1, txt.length);
  }
  const envAt = (t) => {
    const f = t * TL.fps, i = Math.floor(f), a = TL.env[i] || 0, b = TL.env[i + 1] || 0;
    return a + (b - a) * (f - i);
  };

  // ---------------------------------------------------------------- scènes
  function scene(bg) {
    const s = div("scene");
    div("bg", s, { background: bg });
    return s;
  }
  function showScene(s, t) { tl.set(s, { visibility: "visible" }, t); }
  function hideScene(s, t) { tl.set(s, { visibility: "hidden" }, t); }

  // transition : trois bandes obliques qui balaient l'écran ; renvoie l'instant du changement
  const wipeLayer = div("abs", stage, { inset: 0, zIndex: 60, pointerEvents: "none" });
  function wipe(t0, colors, from, to) {
    const panels = colors.map((c) => {
      const p = div("wipe", wipeLayer, { background: c });
      gsap.set(p, { x: -3300 });
      return p;
    });
    const st = 0.075, dIn = 0.42, hold = 0.06, dOut = 0.48;
    const n = panels.length;
    panels.forEach((p, k) => {
      tl.to(p, { x: -440, duration: dIn, ease: "power2.in" }, t0 + k * st);
      // sortie dans l'ordre inverse : chaque couleur se dévoile avant la scène
      tl.to(p, { x: 2300, duration: dOut, ease: "power2.out" }, t0 + dIn + hold + (n - 1) * st + (n - 1 - k) * st);
    });
    const swap = t0 + dIn + (panels.length - 1) * st + 0.02;
    sfx("whoosh", t0 + 0.05, 0.9);
    if (from) hideScene(from, swap);
    if (to) showScene(to, swap);
    return swap;
  }
  // transition : cercle qui s'ouvre (la nouvelle scène est au-dessus)
  function iris(t0, from, to, x, y, dur = 0.7) {
    showScene(to, t0);
    tl.fromTo(to, { clipPath: `circle(0px at ${x}px ${y}px)` },
      { clipPath: `circle(2400px at ${x}px ${y}px)`, duration: dur, ease: "power3.inOut", immediateRender: false }, t0);
    tl.set(to, { clipPath: "none" }, t0 + dur);
    if (from) hideScene(from, t0 + dur);
    sfx("whoosh", t0, 0.8);
    return t0 + dur * 0.6;
  }

  // ---------------------------------------------------------------- texte
  const hl = (txt, kind = "") => `<span class="hl ${kind}"><i></i>${txt}</span>`;
  /** une ligne de titre masquée qui « monte » à l'apparition */
  function line(parent, html, { x = 160, y, size = 120, cls = "", center = false } = {}) {
    const t = div(`t ${cls} ${center ? "center" : ""}`, parent, { left: x, top: y, fontSize: size });
    const ln = div("ln", t);
    const inn = el("span", "in", ln, {}, html);
    gsap.set(inn, { yPercent: 150, rotation: 3 });
    const his = t.querySelectorAll(".hl > i");
    if (his.length) gsap.set(his, { scaleX: 0 });
    return { el: t, inn, hls: t.querySelectorAll(".hl > i") };
  }
  function show(L, t, hlAt = null) {
    tl.to(L.inn, { yPercent: 0, rotation: 0, duration: 0.62, ease: "power4.out" }, t);
    if (L.hls.length) tl.to(L.hls, { scaleX: 1, duration: 0.42, ease: "power3.inOut", stagger: 0.08 }, hlAt ?? t + 0.12);
    return L;
  }
  function hide(Ls, t, stagger = 0.05) {
    [].concat(Ls).forEach((L, k) => tl.to(L.inn, { yPercent: -150, rotation: -2, duration: 0.36, ease: "power3.in" }, t + k * stagger));
  }
  /** apparition « sticker » avec rebond */
  function pop(e, t, { rot = 0, from = -16, dur = 0.55, ease = "back.out(2.4)", sound = "pop", gain = 0.7 } = {}) {
    gsap.set(e, { scale: 0, rotation: rot + from });
    tl.to(e, { scale: 1, rotation: rot, duration: dur, ease }, t);
    if (sound) sfx(sound, t, gain);
  }
  function unpop(e, t, dur = 0.3) { tl.to(e, { scale: 0, duration: dur, ease: "back.in(2)" }, t); }
  function tag(parent, text, { x, y, size = 60, bg = "var(--yellow)", color = "var(--ink)", rot = 0, shadow = null }) {
    const e = div("tag", parent, { left: x, top: y, fontSize: size, background: bg, color });
    if (shadow) e.style.boxShadow = `.12em .12em 0 ${shadow}`;
    e.textContent = text;
    gsap.set(e, { rotation: rot, scale: 0 });
    return e;
  }

  // ---------------------------------------------------------------- canard
  const D = {
    vb: "80 20 580 540",
    body: "M 222,226 C 152,258 102,316 102,392 C 102,474 156,534 252,536 L 512,536 C 590,532 634,470 638,380 C 640,300 628,250 606,218 C 598,206 586,206 578,218 C 545,262 482,276 420,264 C 400,260 392,258 386,256 L 300,240 Z",
    beakTop: "M 216,134 C 172,138 144,136 122,144 C 108,150 102,160 106,168 L 216,170 Z",
    beakBot: "M 106,167 C 108,175 114,178 124,180 C 154,190 182,210 216,234 L 216,167 Z",
    mouth: "M 216,150 L 112,167 L 216,214 Z",
    wing: "M 318,352 C 352,262 486,226 612,236 C 578,316 470,392 318,352 Z",
  };
  const ducks = [];
  /** canard du logo, vectoriel et animable (bec, œil, aile, flottaison) */
  function duck(parent, { x, y, w, flip = false, talk = true, bob = 1, eye = "var(--pink)", color = "#fff", phase = 0 }) {
    const h = w * 540 / 580;
    const e = div("duck" + (flip ? " flip" : ""), parent, { left: x, top: y, width: w, height: h });
    const b = div("bob", e);
    b.innerHTML = `<svg viewBox="${D.vb}">
      <path d="${D.body}" fill="${color}"/>
      <g class="wing" opacity="0"><path d="${D.wing}" fill="${color}" stroke="var(--pink)" stroke-width="13" stroke-linejoin="round"/></g>
      <g class="head">
        <path class="mouth" d="${D.mouth}" fill="var(--ink)"/>
        <circle cx="308" cy="152" r="116" fill="${color}"/>
        <path class="bb" d="${D.beakBot}" fill="${color}"/>
        <path class="bt" d="${D.beakTop}" fill="${color}"/>
        <circle class="eye" cx="247" cy="152" r="21" fill="${eye}"/>
      </g></svg>`;
    const d = {
      el: e, bobEl: b, w, h, x, y,
      head: b.querySelector(".head"), bt: b.querySelector(".bt"), bb: b.querySelector(".bb"),
      eye: b.querySelector(".eye"), wing: b.querySelector(".wing"),
      st: { talk: talk ? 1 : 0, bob, fly: 0, tilt: 0, ride: 0, open: 0 },
      phase, water: null,
    };
    gsap.set(e, { transformOrigin: "50% 90%" });
    ducks.push(d);
    return d;
  }
  function duckProc(t) {
    for (const d of ducks) {
      const sc = d.el.closest(".scene");
      if (sc && sc.style.visibility !== "visible") continue;
      const st = d.st;
      let by = Math.sin((t + d.phase) * 2.6) * 7 * st.bob;
      let br = Math.sin((t + d.phase) * 2.1 + 1) * 2.2 * st.bob;
      if (d.water && st.ride) {
        const cx = d.x + d.w / 2 + gsap.getProperty(d.el, "x");
        const wy = d.water.waveAt(cx, t);
        by += (wy - d.water.base) * st.ride;
        br += d.water.slopeAt(cx, t) * 12 * st.ride * (d.el.classList.contains("flip") ? -1 : 1);
      }
      if (st.fly) by += Math.sin(t * 9) * 6 * st.fly;
      d.bobEl.style.transform = `translateY(${by.toFixed(2)}px) rotate(${br.toFixed(2)}deg)`;
      // bec : s'ouvre avec l'énergie de la voix
      const o = Math.max(st.open, st.talk ? Math.min(1, envAt(t) * 1.15) : 0);
      d.bb.setAttribute("transform", `rotate(${(-17 * o).toFixed(2)} 214 168)`);
      d.bt.setAttribute("transform", `rotate(${(5 * o).toFixed(2)} 214 168)`);
      // tête
      d.head.setAttribute("transform", `rotate(${(st.tilt + o * 2).toFixed(2)} 300 250)`);
      // clignement
      const ph = (t + d.phase * 1.7) % 3.3;
      const s = ph < 0.07 ? 1 - ph / 0.07 * 0.9 : ph < 0.15 ? 0.1 + (ph - 0.07) / 0.08 * 0.9 : 1;
      d.eye.setAttribute("transform", `translate(247 152) scale(1 ${s.toFixed(3)}) translate(-247 -152)`);
      // aile (vol)
      if (st.fly > 0.001) {
        d.wing.setAttribute("opacity", Math.min(1, st.fly * 2).toFixed(2));
        d.wing.setAttribute("transform", `rotate(${(-38 * (0.5 + 0.5 * Math.sin(t * 22)) * st.fly).toFixed(1)} 330 340)`);
      } else d.wing.setAttribute("opacity", "0");
    }
  }
  procs.push(duckProc);

  /** filigrane du logo, comme sur la bannière */
  function watermark(parent, { x = 1430, y = 70, size = 480, rot = 11, op = 0.07 } = {}) {
    const e = div("abs", parent, { left: x, top: y, width: size, height: size, border: `${size * 0.035}px solid #fff`, borderRadius: size * 0.16 + "px", opacity: op, boxSizing: "border-box" });
    e.innerHTML = `<svg viewBox="${D.vb}" style="position:absolute;left:14%;top:8%;width:72%;overflow:visible"><path d="${D.body}" fill="#fff"/><circle cx="308" cy="152" r="116" fill="#fff"/><path d="${D.beakTop}" fill="#fff"/><path d="${D.beakBot}" fill="#fff"/></svg>
      <div style="position:absolute;left:0;right:0;bottom:9%;text-align:center;font:700 ${size * 0.13}px Poppins;letter-spacing:.04em;color:#fff">DIGIFLEX</div>`;
    gsap.set(e, { rotation: rot });
    return e;
  }

  /** logo Digiflex (badge) */
  function logo(parent, { x, y, size, shadow = "var(--ink)" }) {
    const e = div("abs", parent, { left: x, top: y, width: size, height: size, background: "var(--pink)", borderRadius: size * 0.17 + "px", border: `${size * 0.03}px solid #fff`, boxShadow: `${size * 0.05}px ${size * 0.05}px 0 ${shadow}`, boxSizing: "border-box" });
    const d = duck(e, { x: size * 0.13, y: size * 0.06, w: size * 0.68, bob: 0, talk: false, phase: 0.8 });
    div("abs", e, { left: 0, right: 0, bottom: size * 0.07, textAlign: "center", font: `700 ${size * 0.15}px/1 Poppins`, letterSpacing: ".04em", color: "#fff" }, "DIGIFLEX");
    return { el: e, duck: d };
  }

  // ---------------------------------------------------------------- eau
  /** plan d'eau : couche arrière (créée tout de suite) + couche avant (front()) */
  function water(parent, { level, w = W, h = H, back = "var(--pink-light)", front = "var(--pink-dark)", crest = "#fff", amp = 14, k = 0.0062, speed = 2.2 }) {
    const o = { st: { level, amp }, base: level, w, h, ducks: [] };
    const mk = () => {
      const s = el("div", "abs", parent, { left: 0, top: 0, width: w, height: h, pointerEvents: "none" });
      s.innerHTML = `<svg class="layer" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path/><path fill="none"/></svg>`;
      return s.querySelectorAll("path");
    };
    const [backP] = mk();
    backP.setAttribute("fill", back);
    let frontP = null, crestP = null, rip = null;
    o.front = () => {
      [frontP, crestP] = mk();
      frontP.setAttribute("fill", front);
      crestP.setAttribute("stroke", crest);
      crestP.setAttribute("stroke-width", "7");
      crestP.setAttribute("stroke-linecap", "round");
      rip = frontP.parentNode;
      o.frontEl = rip.parentNode;
      return o;
    };
    const y = (x, t, lvl, a, ph) => lvl + a * Math.sin(k * x + speed * t + ph) + a * 0.45 * Math.sin(k * 2.3 * x - speed * 1.6 * t + ph * 2);
    o.waveAt = (x, t) => y(x, t, o.st.level, o.st.amp, 0);
    o.slopeAt = (x, t) => (o.waveAt(x + 20, t) - o.waveAt(x - 20, t)) / 40;
    const path = (t, lvl, a, ph, closed) => {
      let d = "";
      for (let x = -30; x <= w + 30; x += 24) d += (d ? " L " : "M ") + x + " " + y(x, t, lvl, a, ph).toFixed(1);
      return closed ? d + ` L ${w + 30} ${h + 40} L -30 ${h + 40} Z` : d;
    };
    procs.push((t) => {
      if (parent.closest(".scene") && parent.closest(".scene").style.visibility !== "visible") return;
      backP.setAttribute("d", path(t, o.st.level - o.st.amp * 1.6, o.st.amp * 0.9, 2.4, true));
      if (frontP) {
        frontP.setAttribute("d", path(t, o.st.level, o.st.amp, 0, true));
        crestP.setAttribute("d", path(t, o.st.level, o.st.amp, 0, false));
        // ronds dans l'eau autour des canards qui flottent
        let html = "";
        for (const d of o.ducks) {
          if (!d.st.ride || d.st.fly > 0.5) continue;
          const cx = d.x + d.w / 2 + gsap.getProperty(d.el, "x");
          for (let r = 0; r < 2; r++) {
            const p = ((t * 0.55 + r * 0.5 + d.phase) % 1);
            const rx = d.w * (0.42 + p * 0.55), ry = rx * 0.12;
            html += `<ellipse cx="${cx}" cy="${o.waveAt(cx, t) + 6}" rx="${rx}" ry="${ry}" fill="none" stroke="#fff" stroke-width="${(6 * (1 - p)).toFixed(1)}" opacity="${(0.75 * (1 - p)).toFixed(2)}"/>`;
          }
        }
        let g = rip.querySelector("g.rip");
        if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("class", "rip"); rip.appendChild(g); }
        g.innerHTML = html;
      }
    });
    return o;
  }
  function float(d, w) { d.water = w; d.st.ride = 1; w.ducks.push(d); }

  /** gerbe de gouttes */
  function splash(parent, x, y, t, n = 14, { color = "#fff", spread = 260, height = 260, size = 22 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = rr(size * 0.4, size);
      const dEl = div("abs", parent, { left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", background: color, zIndex: 5 });
      gsap.set(dEl, { scale: 0 });
      const dur = rr(0.55, 0.85), dx = rr(-spread, spread), up = rr(height * 0.4, height);
      tl.set(dEl, { scale: 1 }, t);
      tl.to(dEl, { x: dx, duration: dur, ease: "none" }, t);
      tl.to(dEl, { y: -up, duration: dur * 0.45, ease: "power2.out" }, t);
      tl.to(dEl, { y: 80, duration: dur * 0.55, ease: "power2.in" }, t + dur * 0.45);
      tl.to(dEl, { scale: 0, duration: 0.2 }, t + dur - 0.2);
    }
  }
  /** éclats autour d'un point (traits jaunes) */
  function burst(parent, x, y, t, { n = 10, r0 = 120, r1 = 230, color = "var(--yellow)", thick = 16, rot = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * 360;
      const g = div("abs", parent, { left: x, top: y, width: 0, height: 0 });
      gsap.set(g, { rotation: a });
      const bar = div("abs", g, { left: r0, top: -thick / 2, width: r1 - r0, height: thick, borderRadius: thick, background: color });
      gsap.set(bar, { scaleX: 0, transformOrigin: "0 50%" });
      tl.to(bar, { scaleX: 1, duration: 0.22, ease: "power2.out" }, t);
      tl.to(bar, { x: (r1 - r0) * 0.7, scaleX: 0, transformOrigin: "100% 50%", duration: 0.3, ease: "power2.in" }, t + 0.22);
    }
  }

  // ---------------------------------------------------------------- navigateur
  function browser(parent, { x, y, w, h, url = "www.votre-entreprise.fr", shadow = "var(--ink)" }) {
    const e = div("browser", parent, { left: x, top: y, width: w, height: h, boxShadow: `16px 16px 0 ${shadow}` });
    e.innerHTML = `<div class="b-bar"><i></i><i></i><i></i><div class="b-url">${url}</div></div><div class="b-body"></div>`;
    return { el: e, body: e.querySelector(".b-body") };
  }
  const bx = (parent, x, y, w, h, bg, r = 10, extra = {}) => div("bx", parent, { left: x, top: y, width: w, height: h, background: bg, borderRadius: r + "px", ...extra });

  // =====================================================================
  // SCÈNE 1 — « Salut, moi c'est le Canard. »
  // =====================================================================
  const s1 = scene("var(--pink)");
  showScene(s1, 0);
  watermark(s1);
  const w1 = water(s1, { level: 900 });
  const d1 = duck(s1, { x: 190, y: 900 - 0.86 * 560 * 540 / 580, w: 560, flip: true, phase: 0.3 });
  w1.front();
  float(d1, w1);
  // le canard tombe du ciel et plonge
  gsap.set(d1.el, { y: -1100 });
  d1.st.ride = 0;
  tl.to(d1.el, { y: 0, duration: 0.5, ease: "power2.in" }, 0.15);
  tl.set(d1.st, { ride: 1 }, 0.65);
  tl.fromTo(d1.el, { scaleY: 0.78, scaleX: 1.16 }, { scaleY: 1, scaleX: 1, duration: 0.8, ease: "elastic.out(1.1, 0.35)", immediateRender: false }, 0.65);
  splash(s1, 470, 890, 0.64, 18);
  sfx("whoosh_down", 0.12, 0.7);
  sfx("splash", 0.6, 1);
  tl.fromTo(d1.st, { tilt: 0 }, { tilt: -8, duration: 0.4, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, S(0) - 0.1);

  const l1a = line(s1, "Salut&nbsp;!", { x: 890, y: 200, size: 190 });
  const l1b = line(s1, "Moi, c'est", { x: 905, y: 430, size: 120 });
  const l1c = line(s1, hl("le canard."), { x: 900, y: 565, size: 150 });
  show(l1a, Wd(0, "salut") - 0.05);
  show(l1b, Wd(0, "moi") - 0.05);
  show(l1c, Wd(0, "le") - 0.05, Wd(0, "canard"));

  // « Oui, le canard de Digiflex. »
  hide([l1a, l1b], S(1) - 0.3);
  tl.to(l1c.el, { y: -395, duration: 0.6, ease: "power3.inOut" }, S(1) - 0.2);
  const l1d = line(s1, "de", { x: 905, y: 480, size: 120 });
  show(l1d, Wd(1, "de") - 0.1);
  const lg1 = logo(s1, { x: 1130, y: 400, size: 320 });
  pop(lg1.el, Wd(1, "digiflex") - 0.05, { rot: -6, from: -30 });
  burst(s1, 1130 + 160, 400 + 160, Wd(1, "digiflex"), { n: 8, rot: 22.5, r0: 205, r1: 250 });

  // « Et non, je ne fais pas « coin-coin » en réunion. »
  hide([l1c, l1d], S(2) - 0.15);
  tl.to(lg1.el, { scale: 0, rotation: 20, duration: 0.35, ease: "back.in(2)" }, S(2) - 0.15);
  // « non » de la tête
  tl.to(d1.st, { keyframes: [{ tilt: 9, duration: 0.12 }, { tilt: -9, duration: 0.14 }, { tilt: 7, duration: 0.14 }, { tilt: 0, duration: 0.14 }] }, Wd(2, "non") - 0.05);
  const bub = div("bubble", s1, { left: 820, top: 150, width: 760, height: 330 });
  bub.innerHTML = `<svg viewBox="0 0 760 330" width="760" height="330" style="position:absolute;overflow:visible">
      <path d="M 70 10 H 690 Q 750 10 750 70 V 230 Q 750 290 690 290 H 170 L 40 330 L 100 290 H 70 Q 10 290 10 230 V 70 Q 10 10 70 10 Z" fill="#fff"/></svg>
    <div class="t ink" style="left:0;width:760px;top:92px;text-align:center;font-size:92px">«&nbsp;Coin-coin&nbsp;»</div>`;
  gsap.set(bub, { transformOrigin: "40px 330px" });
  pop(bub, Wd(2, "coin") - 0.12, { from: -10, sound: null });
  sfx("quack", Wd(2, "coin") - 0.02, 0.55);
  sfx("quack", Wd(2, "coin", 1) - 0.02, 0.45);
  // barré !
  const strike = div("abs", s1, { left: 870, top: 300, width: 680, height: 34, background: "var(--yellow)", borderRadius: "17px", boxShadow: "0 0 0 8px var(--pink)" });
  gsap.set(strike, { rotation: -9, scaleX: 0, transformOrigin: "0 50%" });
  tl.to(strike, { scaleX: 1, duration: 0.28, ease: "power3.out" }, Wd(2, "en") - 0.1);
  sfx("buzz", Wd(2, "en") - 0.1, 0.5);
  const l1e = line(s1, "pas en", { x: 905, y: 560, size: 120 });
  const l1f = line(s1, hl("réunion&nbsp;!"), { x: 900, y: 695, size: 150 });
  show(l1e, Wd(2, "en") - 0.15);
  show(l1f, Wd(2, "reunion") - 0.08);

  // =====================================================================
  // SCÈNE 2 — « Vous êtes pro. Vous assurez sur le terrain. »
  // =====================================================================
  const s2 = scene("var(--yellow)");
  const sw2 = wipe(E(2) - 0.12, ["var(--ink)", "var(--pink)", "var(--yellow)"], s1, s2);
  const l2a = line(s2, "Vous êtes", { x: 150, y: 150, size: 130, cls: "ink" });
  const l2b = line(s2, hl("pro.", "pink"), { x: 140, y: 290, size: 330 });
  show(l2a, Wd(3, "vous") - 0.12);
  show(l2b, Wd(3, "pro") - 0.1);
  const trades = [
    ["Plombier", 1090, 120, -6, "var(--ink)", "#fff"],
    ["Coiffeuse", 1470, 215, 5, "var(--pink)", "#fff"],
    ["Artisan", 1130, 300, 4, "#fff", "var(--ink)"],
    ["Restaurateur", 1290, 395, -4, "var(--ink)", "var(--yellow)"],
    ["Paysagiste", 1060, 490, -3, "var(--pink)", "#fff"],
    ["Électricien", 1360, 585, 6, "#fff", "var(--pink)"],
    ["Coach", 1150, 670, -7, "var(--ink)", "#fff"],
  ];
  const tA = Wd(3, "pro") + 0.05, tB = Wd(3, "terrain");
  const tagEls = trades.map(([txt, x, y, rot, bg, col], k) => {
    const e = tag(s2, txt, { x, y, size: 62, bg, color: col, rot, shadow: bg === "var(--ink)" ? "var(--pink)" : "var(--ink)" });
    pop(e, tA + (k * (tB - tA - 0.2)) / trades.length, { rot, gain: 0.35 });
    return e;
  });
  const l2c = line(s2, "Vous assurez", { x: 150, y: 680, size: 100, cls: "ink" });
  const l2d = line(s2, hl("sur le terrain.", "ink"), { x: 140, y: 800, size: 125 });
  show(l2c, Wd(3, "vous", 1) - 0.12);
  show(l2d, Wd(3, "sur") - 0.1, Wd(3, "terrain") - 0.1);
  const chk = div("abs", s2, { left: 1160, top: 800, width: 150, height: 150, borderRadius: "50%", background: "var(--pink)", boxShadow: "8px 8px 0 var(--ink)" },
    `<svg viewBox="0 0 100 100" style="position:absolute;inset:0"><path d="M 28 52 L 44 67 L 74 35" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  pop(chk, Wd(3, "terrain") + 0.15, { sound: "ding", gain: 0.5 });

  // =====================================================================
  // SCÈNE 3 — « Mais en ligne ? Parfois, ça patauge. »
  // =====================================================================
  const s3 = scene("var(--ink)");
  iris(S(4) - 0.45, s2, s3, 1300, 500, 0.6);
  const l3a = line(s3, "Mais", { x: 150, y: 170, size: 130 });
  const l3b = line(s3, hl("en ligne&nbsp;?"), { x: 140, y: 310, size: 150 });
  show(l3a, Wd(4, "mais") - 0.15);
  show(l3b, Wd(4, "en") - 0.1, Wd(4, "ligne"));
  const br3 = browser(s3, { x: 1010, y: 190, w: 760, h: 600, shadow: "var(--pink)" });
  gsap.set(br3.el, { y: 900, rotation: 8 });
  tl.to(br3.el, { y: 0, rotation: 0, duration: 0.7, ease: "back.out(1.4)" }, Wd(4, "mais") - 0.05);
  {
    const b = br3.body;
    bx(b, 40, 30, 220, 26, "var(--grey)", 13);
    bx(b, 470, 30, 250, 26, "var(--grey)", 13);
    const hero = bx(b, 40, 90, 680, 220, "var(--grey)", 16);
    hero.innerHTML = `<svg viewBox="0 0 100 100" style="position:absolute;left:290px;top:60px;width:100px;height:100px"><rect x="8" y="14" width="84" height="72" rx="8" fill="none" stroke="#c9bfc7" stroke-width="7"/><path d="M 12 74 L 38 48 L 56 66 L 70 54 L 90 74" fill="none" stroke="#c9bfc7" stroke-width="7"/><path d="M 20 90 L 80 10" stroke="var(--pink)" stroke-width="8" stroke-linecap="round"/></svg>`;
    const rows = [bx(b, 40, 340, 520, 22, "var(--grey)"), bx(b, 40, 380, 600, 22, "var(--grey)"), bx(b, 40, 420, 380, 22, "var(--grey)")];
    const err = div("tag", b, { left: 470, top: 330, fontSize: 64, background: "var(--yellow)", color: "var(--ink)" }, "404");
    gsap.set(err, { rotation: 8, scale: 0 });
    pop(err, Wd(4, "ligne") + 0.1, { rot: 8, sound: "buzz", gain: 0.45 });
    // ça patauge : l'eau monte dans le site, tout prend l'eau
    const tP = Wd(4, "patauge") - 0.35;
    const w3 = water(b, { level: 640, w: 760, h: 546, back: "var(--pink-light)", front: "var(--pink)", amp: 10, k: 0.012, speed: 3 });
    w3.front();
    tl.to(w3.st, { level: 250, duration: 1.3, ease: "power2.inOut" }, tP);
    [hero, ...rows, err].forEach((e, k) => tl.to(e, { y: `+=${rr(40, 90)}`, rotation: rr(-12, 12), duration: 1.2, ease: "power2.inOut" }, tP + 0.1 + k * 0.05));
    tl.to(br3.el, { keyframes: [{ rotation: -3, duration: 0.25 }, { rotation: 2.5, duration: 0.3 }, { rotation: -1.5, duration: 0.3 }, { rotation: 0, duration: 0.3 }] }, tP + 0.2);
    for (let k = 0; k < 6; k++) {
      const s = rr(14, 30), bubl = div("abs", b, { left: rr(80, 680), top: 520, width: s, height: s, borderRadius: "50%", border: "4px solid #fff", boxSizing: "border-box" });
      gsap.set(bubl, { opacity: 0 });
      const t0 = tP + 0.4 + k * 0.22;
      tl.fromTo(bubl, { opacity: 1, y: 0 }, { y: -rr(220, 300), opacity: 0, duration: 1.1, ease: "power1.in", immediateRender: false }, t0);
      if (k % 2 === 0) sfx("bloop", t0, 0.3);
    }
    MUFFLE.push([tP + 0.3, E(4) + 0.5]);
  }
  const l3c = line(s3, "Parfois,", { x: 150, y: 560, size: 110 });
  const l3d = line(s3, hl("ça patauge.", "pink"), { x: 140, y: 690, size: 150 });
  show(l3c, Wd(4, "parfois") - 0.12);
  show(l3d, Wd(4, "ca") - 0.1);
  tl.to(l3d.el, { keyframes: [{ y: 10, rotation: -1.5, duration: 0.3 }, { y: -4, rotation: 1, duration: 0.35 }, { y: 6, rotation: -0.5, duration: 0.35 }, { y: 0, rotation: 0, duration: 0.35 }] }, Wd(4, "patauge") + 0.2);

  // transition : l'eau envahit tout l'écran et devient le fond rose suivant
  const flood = water(s3, { level: H + 60, back: "var(--pink-light)", front: "var(--pink)", crest: "var(--pink)", amp: 22, k: 0.005, speed: 3.2 });
  flood.front();
  const tFlood = E(4) + 0.05;
  tl.to(flood.st, { level: -80, duration: 0.75, ease: "power2.in" }, tFlood);
  sfx("whoosh", tFlood, 0.9);
  sfx("splash", tFlood + 0.55, 0.6);

  // =====================================================================
  // SCÈNE 4 — « Chez Digiflex, on aide les TPE et PME… » + « Qualitative. Pas du bricolage. »
  // =====================================================================
  const s4 = scene("var(--pink)");
  showScene(s4, tFlood + 0.75);
  hideScene(s3, tFlood + 0.75);
  watermark(s4, { x: -140, y: 640, rot: -12, size: 520 });
  const l4a = line(s4, `Chez ${hl("Digiflex,", "white")}`, { x: 150, y: 120, size: 96 });
  const l4b = line(s4, "on aide les", { x: 150, y: 245, size: 96 });
  show(l4a, Wd(5, "chez") - 0.15, Wd(5, "digiflex"));
  show(l4b, Wd(5, "aide") - 0.25);
  const tpe = tag(s4, "TPE", { x: 150, y: 385, size: 136, rot: -5, shadow: "var(--ink)" });
  const pme = tag(s4, "PME", { x: 560, y: 398, size: 136, bg: "#fff", color: "var(--pink)", rot: 4, shadow: "var(--ink)" });
  pop(tpe, Wd(5, ["tp", "te"]) - 0.05, { rot: -5 });
  pop(pme, Wd(5, "et", 0) + 0.12, { rot: 4 });
  const l4c = line(s4, "une vraie", { x: 150, y: 620, size: 96 });
  const l4d = line(s4, hl("présence en ligne."), { x: 140, y: 740, size: 112 });
  show(l4c, Wd(5, "vraie") - 0.25);
  show(l4d, Wd(5, "presence") - 0.1);

  const br4 = browser(s4, { x: 1080, y: 200, w: 690, h: 560, url: "www.votre-entreprise.fr" });
  gsap.set(br4.el, { scale: 0, rotation: -8 });
  tl.to(br4.el, { scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.6)" }, Wd(5, "aide") - 0.1);
  sfx("pop", Wd(5, "aide") - 0.1, 0.5);
  {
    const b = br4.body, t0 = Wd(5, "aide") + 0.3, t1 = Wd(5, "ligne");
    const parts = [
      bx(b, 34, 26, 44, 44, "var(--pink)", 22),
      bx(b, 92, 38, 130, 20, "var(--ink)", 10),
      bx(b, 420, 38, 70, 16, "#d8cfd6", 8), bx(b, 506, 38, 70, 16, "#d8cfd6", 8), bx(b, 592, 32, 70, 28, "var(--pink)", 14),
      bx(b, 34, 100, 300, 34, "var(--ink)", 8), bx(b, 34, 146, 250, 34, "var(--ink)", 8),
      bx(b, 34, 200, 280, 14, "#d8cfd6", 7), bx(b, 34, 224, 240, 14, "#d8cfd6", 7),
      bx(b, 34, 262, 150, 46, "var(--yellow)", 23),
      bx(b, 370, 96, 286, 220, "var(--pink)", 18),
      bx(b, 34, 350, 190, 120, "#F4EFF3", 14), bx(b, 250, 350, 190, 120, "#F4EFF3", 14), bx(b, 466, 350, 190, 120, "#F4EFF3", 14),
    ];
    const hd = duck(parts[10], { x: 48, y: 24, w: 190, talk: false, bob: 0.6, eye: "var(--pink)", phase: 1.3 });
    hd.st.talk = 0;
    parts.forEach((p, k) => {
      gsap.set(p, { scale: 0, transformOrigin: "0 50%" });
      tl.to(p, { scale: 1, duration: 0.4, ease: "back.out(1.8)" }, t0 + (k * (t1 - t0)) / parts.length);
    });
    for (let k = 0; k < 4; k++) sfx("click", t0 + (k * (t1 - t0)) / 4, 0.6);
  }
  // le Canard perché sur le site
  const d4 = duck(s4, { x: 1560, y: 200 - 170 + 10, w: 190, flip: false, phase: 0.6 });
  gsap.set(d4.el, { scale: 0 });
  tl.to(d4.el, { scale: 1, duration: 0.5, ease: "back.out(2.5)" }, Wd(5, "digiflex") + 0.1);
  sfx("pop", Wd(5, "digiflex") + 0.1, 0.5);

  // « Qualitative. Pas du bricolage. »
  hide([l4a, l4b], S(6) - 0.35);
  unpop(tpe, S(6) - 0.3); unpop(pme, S(6) - 0.25);
  hide([l4c, l4d], S(6) - 0.2);
  // le site se décale pour laisser la place au titre
  tl.to(br4.el, { x: 120, scale: 0.85, duration: 0.6, ease: "power3.inOut" }, S(6) - 0.35);
  tl.to(d4.el, { x: 75, y: 42, duration: 0.6, ease: "power3.inOut" }, S(6) - 0.35);
  const l4e = line(s4, hl("Qualitative.", "white"), { x: 140, y: 230, size: 124 });
  show(l4e, Wd(6, "qualitati") - 0.15, Wd(6, "qualitati"));
  const star = div("abs", s4, { left: 1150, top: 175, width: 140, height: 140, borderRadius: "50%", background: "var(--yellow)", boxShadow: "8px 8px 0 var(--ink)" },
    `<svg viewBox="0 0 100 100" style="position:absolute;inset:0"><path d="M 28 52 L 44 67 L 74 35" fill="none" stroke="var(--ink)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  pop(star, Wd(6, "qualitati") + 0.45, { rot: 10, sound: "ding", gain: 0.55 });
  const l4f = line(s4, "Pas du", { x: 150, y: 500, size: 110 });
  const l4g = line(s4, "bricolage.", { x: 145, y: 625, size: 150, cls: "ink" });
  show(l4f, Wd(6, "pas") - 0.12);
  show(l4g, Wd(6, "bricolage") - 0.1);
  const tape = div("abs", s4, { left: 120, top: 698, width: 900, height: 24, background: "var(--yellow)", borderRadius: "12px", boxShadow: "0 0 0 6px var(--pink)" });
  gsap.set(tape, { rotation: -3, scaleX: 0, transformOrigin: "0 50%" });
  tl.to(tape, { scaleX: 1, duration: 0.3, ease: "power3.out" }, Wd(6, "bricolage") + 0.45);
  sfx("stamp", Wd(6, "bricolage") + 0.45, 0.7);
  const qBadge = tag(br4.el, "✓ Pro", { x: 470, y: 470, size: 46, bg: "var(--yellow)", rot: -8, shadow: "var(--ink)" });
  pop(qBadge, Wd(6, "qualitati") + 0.6, { rot: -8, sound: null });

  // =====================================================================
  // SCÈNE 5 — Les offres : one page, vitrine, boutique — WordPress, WooCommerce, Shopify
  // =====================================================================
  const s5 = scene("var(--ink)");
  wipe(E(6) - 0.05, ["var(--yellow)", "#fff", "var(--ink)"], s4, s5);
  const cardY = 150, cw = 470, ch = 520;
  const cards = [
    { x: 165, label: "Site one page", needle: ["site"], occ: 0 },
    { x: 725, label: "Site vitrine", needle: ["site"], occ: 1 },
    { x: 1285, label: "Boutique en ligne", needle: ["boutique"], occ: 0 },
  ];
  const cardGroup = div("abs", s5, { left: 0, top: 0, width: W, height: H });
  cards.forEach((c, k) => {
    const br = browser(cardGroup, { x: c.x, y: cardY, w: cw, h: ch, url: ["one-page.fr", "vitrine.fr", "boutique.fr"][k], shadow: ["var(--pink)", "var(--yellow)", "#fff"][k] });
    const b = br.body;
    if (k === 0) {
      // one page : longue page qui défile
      const pg = div("abs", b, { left: 0, top: 0, width: cw, height: 1400 });
      const cols = ["var(--pink)", "#F4EFF3", "var(--yellow)", "#F4EFF3", "var(--pink)", "#F4EFF3"];
      cols.forEach((col, j) => {
        const sec = bx(pg, 24, 24 + j * 230, cw - 48, 206, col, 16);
        bx(sec, 24, 30, 180, 22, j % 2 ? "var(--ink)" : "#fff", 11);
        bx(sec, 24, 66, 260, 14, j % 2 ? "#cfc5cd" : "rgba(255,255,255,.7)", 7);
        bx(sec, 24, 90, 220, 14, j % 2 ? "#cfc5cd" : "rgba(255,255,255,.7)", 7);
      });
      procs.push((t) => { pg.style.transform = `translateY(${-((Math.max(0, t - S(7)) * 140) % 690).toFixed(1)}px)`; });
    } else if (k === 1) {
      // vitrine : menu à onglets + pages
      ["Accueil", "Services", "Contact"].forEach((n, j) => div("abs", b, { left: 24 + j * 140, top: 22, width: 124, height: 40, borderRadius: "20px", background: j === 0 ? "var(--yellow)" : "#F4EFF3", font: "700 16px/40px Poppins", textAlign: "center", color: "var(--ink)" }, n));
      const heroV = bx(b, 24, 84, cw - 48, 170, "var(--ink)", 16);
      bx(heroV, 26, 40, 220, 26, "#fff", 13); bx(heroV, 26, 80, 160, 26, "var(--yellow)", 13);
      duck(heroV, { x: 270, y: 20, w: 140, talk: false, bob: 0.5, phase: 2 });
      for (let j = 0; j < 3; j++) { const c2 = bx(b, 24 + j * 144, 276, 130, 150, "#F4EFF3", 14); bx(c2, 16, 18, 40, 40, ["var(--pink)", "var(--yellow)", "var(--ink)"][j], 20); bx(c2, 16, 76, 90, 12, "#cfc5cd", 6); bx(c2, 16, 98, 70, 12, "#cfc5cd", 6); }
    } else {
      // boutique : grille de produits + panier
      for (let j = 0; j < 4; j++) {
        const px = 24 + (j % 2) * 216, py = 76 + Math.floor(j / 2) * 186;
        const p = bx(b, px, py, 196, 170, "#F4EFF3", 14);
        bx(p, 14, 14, 168, 92, ["var(--pink)", "var(--yellow)", "var(--ink)", "var(--pink-light)"][j], 10);
        bx(p, 14, 118, 90, 12, "#cfc5cd", 6);
        div("abs", p, { left: 14, top: 136, font: "800 italic 20px Poppins", color: "var(--ink)" }, ["29 €", "49 €", "19 €", "39 €"][j]);
        bx(p, 140, 128, 42, 30, "var(--pink)", 15);
      }
      const cart = div("abs", b, { left: cw - 92, top: 14, width: 60, height: 48 },
        `<svg viewBox="0 0 60 48" width="60" height="48"><path d="M 4 6 H 14 L 20 34 H 46 L 52 14 H 17" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="23" cy="42" r="4" fill="var(--ink)"/><circle cx="43" cy="42" r="4" fill="var(--ink)"/></svg>`);
      const badge = div("abs", cart, { left: 36, top: -8, width: 28, height: 28, borderRadius: "50%", background: "var(--pink)", color: "#fff", font: "700 15px/28px Poppins", textAlign: "center" }, "0");
      bx(b, 24, 24, 150, 26, "var(--ink)", 13);
      procs.push((t) => { badge.textContent = String(Math.max(0, Math.min(9, Math.floor((t - Wd(7, "boutique") - 0.6) / 0.45) + 1))); });
    }
    const L = line(cardGroup, c.label, { x: c.x - 20, y: cardY + ch + 46, size: 52, cls: k === 2 ? "yel" : "" });
    L.el.style.width = cw + 40 + "px"; L.el.style.textAlign = "center";
    const tIn = Wd(7, c.needle, c.occ) - 0.2;
    gsap.set(br.el, { y: 820, rotation: [-9, 6, -6][k] });
    tl.to(br.el, { y: 0, rotation: [-2, 1.5, -1.5][k], duration: 0.7, ease: "back.out(1.5)" }, tIn);
    sfx("whoosh", tIn, 0.45);
    sfx("pop", tIn + 0.35, 0.4);
    show(L, tIn + 0.25);
  });
  // « On construit tout ça sur WordPress, WooCommerce et Shopify. »
  tl.to(cardGroup, { y: -95, scale: 0.86, transformOrigin: "50% 0%", duration: 0.7, ease: "power3.inOut" }, S(8) - 0.3);
  const l5a = line(s5, `On construit tout ça ${hl("sur", "pink")}&nbsp;:`, { y: 735, size: 76, center: true });
  show(l5a, Wd(8, "construit") - 0.2, Wd(8, "sur"));
  const techs = [
    ["WordPress", "#fff", "var(--ink)", "wordpress", 330],
    ["WooCommerce", "var(--pink)", "#fff", "woo", 760],
    ["Shopify", "var(--yellow)", "var(--ink)", "shopify", 1300],
  ];
  const techRow = div("abs", s5, { left: 0, top: 880, width: W, display: "flex", justifyContent: "center", gap: "56px" });
  techs.forEach(([txt, bg, col, needle], k) => {
    const e = tag(techRow, txt, { x: 0, y: 0, size: 72, bg, color: col, rot: [-3, 2, -2][k] });
    e.style.position = "relative";
    pop(e, Wd(8, needle) - 0.08, { rot: [-3, 2, -2][k], gain: 0.55 });
  });

  // =====================================================================
  // SCÈNE 6 — « Notre philosophie : des pros qui font confiance à des pros. »
  //           « Vous gardez votre métier, on s'occupe du web. »
  // =====================================================================
  const s6 = scene("var(--yellow)");
  iris(E(8) + 0.1, s5, s6, 960, 540, 0.7);
  const l6a = line(s6, "Notre philosophie&nbsp;:", { x: 150, y: 120, size: 64, cls: "pk" });
  show(l6a, Wd(9, "notre") - 0.15);
  const l6b = line(s6, "Des pros", { y: 250, size: 190, cls: "ink", center: true });
  const l6c = line(s6, hl("qui font confiance", "pink"), { y: 470, size: 120, center: true });
  const l6d = line(s6, "à des pros.", { y: 640, size: 190, cls: "ink", center: true });
  show(l6b, Wd(9, "des") - 0.15);
  show(l6c, Wd(9, "qui") - 0.12, Wd(9, "confiance") - 0.05);
  show(l6d, Wd(9, "a", 0) - 0.15);
  // deux badges « PRO » qui se tapent dans la main
  const proL = div("abs", s6, { left: 70, top: 600, width: 210, height: 210, borderRadius: "50%", background: "var(--pink)", boxShadow: "10px 10px 0 var(--ink)", font: "800 italic 74px/210px Poppins", color: "#fff", textAlign: "center" }, "PRO");
  const proR = div("abs", s6, { left: 1640, top: 160, width: 210, height: 210, borderRadius: "50%", background: "var(--ink)", boxShadow: "10px 10px 0 var(--pink)", font: "800 italic 74px/210px Poppins", color: "var(--yellow)", textAlign: "center" }, "PRO");
  pop(proL, Wd(9, "pros", 0) - 0.05, { rot: -10, gain: 0.5 });
  pop(proR, Wd(9, "pros", 1) - 0.05, { rot: 10, gain: 0.5 });
  sfx("ding", Wd(9, "confiance") + 0.1, 0.35);

  // écran partagé : votre métier | le web
  const tSplit = S(10) - 0.35;
  hide([l6a, l6b, l6c, l6d], tSplit - 0.1, 0.04);
  unpop(proL, tSplit - 0.1); unpop(proR, tSplit - 0.05);
  const right = div("abs", s6, { left: 960, top: 0, width: 960, height: H, background: "var(--pink)" });
  gsap.set(right, { xPercent: 100 });
  tl.to(right, { xPercent: 0, duration: 0.6, ease: "power3.inOut" }, tSplit);
  sfx("whoosh", tSplit, 0.6);
  const l6e = line(s6, "Vous gardez", { x: 120, y: 200, size: 92, cls: "ink" });
  const l6f = line(s6, hl("votre métier.", "white"), { x: 110, y: 320, size: 104 });
  show(l6e, Wd(10, "vous") - 0.1);
  show(l6f, Wd(10, "votre") - 0.1, Wd(10, "metier"));
  const l6g = line(right, "On s'occupe", { x: 120, y: 200, size: 92 });
  const l6h = line(right, hl("du web."), { x: 110, y: 320, size: 130 });
  show(l6g, Wd(10, "occupe") - 0.35);
  show(l6h, Wd(10, "web") - 0.15);
  // icônes : clé à molette / code
  const wrench = div("abs", s6, { left: 300, top: 560, width: 380, height: 380 },
    `<svg viewBox="0 0 100 100" width="380" height="380"><path d="M 64 10 A 22 22 0 0 0 44 40 L 14 70 A 9 9 0 0 0 27 83 L 57 53 A 22 22 0 0 0 87 33 L 74 42 L 62 35 L 58 22 Z" fill="var(--ink)"/><circle cx="21" cy="76" r="4" fill="var(--yellow)"/></svg>`);
  pop(wrench, Wd(10, "metier") + 0.05, { rot: -12, from: -40, gain: 0.5 });
  tl.to(wrench, { rotation: 6, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: 1 }, Wd(10, "metier") + 0.6);
  const code = div("abs", right, { left: 140, top: 620, width: 300, height: 220, borderRadius: "34px", background: "#fff", boxShadow: "12px 12px 0 var(--ink)", font: "800 italic 120px/220px Poppins", color: "var(--pink)", textAlign: "center" }, "&lt;/&gt;");
  pop(code, Wd(10, "web") + 0.05, { rot: 6, gain: 0.5 });
  const d6 = duck(right, { x: 520, y: 520, w: 330, flip: false, phase: 2.2 });
  gsap.set(d6.el, { y: 700 });
  tl.to(d6.el, { y: 0, duration: 0.6, ease: "back.out(1.6)" }, Wd(10, "occupe") - 0.2);

  // =====================================================================
  // SCÈNE 7 — « Et pourquoi un canard ? … Il nage. Il vole. Il flotte. »
  // =====================================================================
  const s7 = scene("var(--pink)");
  wipe(E(10) + 0.05, ["var(--ink)", "var(--yellow)", "var(--pink)"], s6, s7);
  watermark(s7, { x: 1500, y: -120, rot: 14, size: 440 });
  const w7 = water(s7, { level: H + 80, amp: 16 });
  const d7 = duck(s7, { x: 1180, y: 940 - 0.86 * 500 * 540 / 580, w: 500, flip: false, phase: 0.9 });
  w7.front();
  w7.base = 940;
  float(d7, w7);
  gsap.set(d7.el, { scale: 0 });
  tl.to(w7.st, { level: 940, duration: 0.8, ease: "power2.out" }, S(11) - 0.5);
  tl.to(d7.el, { scale: 1, duration: 0.6, ease: "back.out(2.2)" }, S(11) - 0.15);
  sfx("pop", S(11) - 0.15, 0.6);
  const q = div("t yel", s7, { left: 1380, top: 250, fontSize: 230 }, "?");
  gsap.set(q, { scale: 0, rotation: -30, transformOrigin: "50% 80%" });
  tl.to(q, { scale: 1, rotation: 12, duration: 0.5, ease: "back.out(3)" }, Wd(11, "canard") - 0.05);
  tl.to(q, { rotation: -8, duration: 0.35, ease: "sine.inOut", yoyo: true, repeat: 3 }, Wd(11, "canard") + 0.45);
  sfx("bloop", Wd(11, "canard"), 0.5);
  tl.to(d7.st, { tilt: 10, duration: 0.35, ease: "power2.out" }, Wd(11, "pourquoi"));
  tl.to(d7.st, { tilt: 0, duration: 0.4 }, E(11) + 0.2);
  const l7a = line(s7, "Et pourquoi", { x: 150, y: 170, size: 140 });
  const l7b = line(s7, hl("un canard&nbsp;?"), { x: 140, y: 330, size: 170 });
  show(l7a, Wd(11, "pourquoi") - 0.25);
  show(l7b, Wd(11, "un") - 0.1, Wd(11, "canard"));
  // « Parce que le canard ne coule jamais. »
  hide([l7a, l7b], S(12) - 0.3);
  unpop(q, S(12) - 0.3);
  const l7c = line(s7, "Le canard", { x: 150, y: 150, size: 110 });
  const l7d = line(s7, "ne coule", { x: 150, y: 285, size: 150 });
  const l7e = line(s7, hl("jamais.", "white"), { x: 140, y: 450, size: 190 });
  show(l7c, Wd(12, "canard") - 0.25);
  show(l7d, Wd(12, "coule") - 0.2);
  show(l7e, Wd(12, "jamais") - 0.1);
  // vague : l'eau monte d'un coup, le canard reste à flot
  tl.to(w7.st, { level: 760, amp: 26, duration: 0.8, ease: "power2.inOut" }, Wd(12, "coule") - 0.1);
  sfx("splash", Wd(12, "coule") + 0.2, 0.6);
  // un « site bricolé » coule, lui
  const brick = tag(s7, "site bricolé", { x: 820, y: 690, size: 46, bg: "var(--ink)", color: "#fff", rot: -6 });
  s7.insertBefore(brick, w7.frontEl);   // il coule… sous la surface
  pop(brick, Wd(12, "coule") - 0.05, { rot: -6, gain: 0.4 });
  tl.to(brick, { y: 620, rotation: 28, duration: 1.4, ease: "power2.in" }, Wd(12, "coule") + 0.45);
  tl.set(brick, { opacity: 0 }, Wd(12, "coule") + 1.9);
  sfx("bloop", Wd(12, "jamais") + 0.2, 0.35);
  hide([l7c, l7d, l7e], S(13) - 0.25);
  // « Il nage. Il vole. Il flotte. »
  const l7f = line(s7, "Il nage.", { x: 150, y: 120, size: 150 });
  const l7g = line(s7, hl("Il vole."), { x: 140, y: 300, size: 150 });
  const l7h = line(s7, "Il flotte.", { x: 150, y: 480, size: 150, cls: "ink" });
  const tN = Wd(13, "nage") - 0.15, tV = Wd(13, "vole") - 0.15, tF = Wd(13, "flotte") - 0.15;
  show(l7f, tN); show(l7g, tV, tV + 0.05); show(l7h, tF);
  tl.to(d7.el, { x: -300, duration: tV - tN + 0.1, ease: "power1.inOut" }, tN - 0.1);
  sfx("splash", tN, 0.3);
  // il vole (ride passe à 0 en même temps que le canard monte : mouvement continu)
  tl.to(d7.st, { fly: 1, duration: 0.15 }, tV - 0.05);
  tl.to(d7.st, { ride: 0, duration: 0.75, ease: "power2.out" }, tV - 0.05);
  tl.to(d7.el, { y: -430, x: -120, rotation: -10, duration: 0.75, ease: "power2.out" }, tV - 0.05);
  splash(s7, 1180 - 300 + 250, 780, tV, 12, { spread: 200, height: 200, size: 20 });
  sfx("whoosh", tV - 0.05, 0.6);
  // il flotte
  tl.to(d7.el, { y: 0, x: -160, rotation: 0, duration: 0.6, ease: "power2.in" }, tF - 0.25);
  tl.to(d7.st, { ride: 1, duration: 0.6, ease: "power2.in" }, tF - 0.25);
  tl.to(d7.st, { fly: 0, duration: 0.2 }, tF + 0.2);
  splash(s7, 1180 - 160 + 250, 780, tF + 0.35, 14);
  sfx("splash", tF + 0.33, 0.6);
  tl.to(w7.st, { amp: 14, level: 800, duration: 0.8, ease: "power2.out" }, tF + 0.35);

  // « Exactement ce qu'on veut pour votre business. »
  const tC = S(14) - 0.35;
  hide([l7f, l7g, l7h], tC - 0.05, 0.04);
  tl.to(w7.st, { level: H + 120, duration: 0.7, ease: "power2.in" }, tC);
  tl.to(d7.el, { y: 600, duration: 0.6, ease: "power2.in" }, tC);
  const l7i = line(s7, "Exactement ce qu'on veut", { x: 150, y: 110, size: 78 });
  const l7j = line(s7, "pour", { x: 150, y: 215, size: 78 });
  const l7k = line(s7, hl("votre business."), { x: 140, y: 320, size: 120 });
  show(l7i, Wd(14, "exactement") - 0.15);
  show(l7j, Wd(14, "pour") - 0.15);
  show(l7k, Wd(14, "votre") - 0.1, Wd(14, "business") - 0.05);
  // courbe de croissance + le canard qui surfe dessus
  const chart = el("div", "abs", s7, { left: 0, top: 0, width: W, height: H });
  const pts = [[640, 1000], [820, 880], [960, 930], [1140, 740], [1300, 800], [1500, 560], [1640, 610], [1790, 380]];
  const dPath = "M " + pts.map((p) => p.join(" ")).join(" L ");
  chart.innerHTML = `<svg class="layer" width="${W}" height="${H}">
      <g stroke="rgba(255,255,255,.22)" stroke-width="3">${[500, 650, 800, 950].map((y) => `<line x1="600" y1="${y}" x2="1860" y2="${y}"/>`).join("")}</g>
      <path class="cp" d="${dPath}" fill="none" stroke="var(--yellow)" stroke-width="24" stroke-linejoin="round" stroke-linecap="round"/>
      <path class="ah" d="M -46 -34 L 8 0 L -46 34" fill="none" stroke="var(--yellow)" stroke-width="24" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  const cp = chart.querySelector(".cp"), ah = chart.querySelector(".ah");
  gsap.set(chart, { opacity: 0 });
  const L = cp.getTotalLength();
  const cst = { p: 0 };
  cp.style.strokeDasharray = L; cp.style.strokeDashoffset = L;
  gsap.set(ah, { opacity: 0 });
  const tC0 = Wd(14, "veut") - 0.2, tC1 = Wd(14, "business") + 0.5;
  tl.to(chart, { opacity: 1, duration: 0.3 }, tC0 - 0.3);
  tl.to(cst, { p: 1, duration: tC1 - tC0, ease: "power1.inOut" }, tC0);
  sfx("rise", tC0, 0.7);
  const d7b = duck(chart, { x: 0, y: 0, w: 170, flip: true, phase: 1.7, bob: 0.4 });
  gsap.set(d7b.el, { scale: 0 });
  tl.to(d7b.el, { scale: 1, duration: 0.35, ease: "back.out(2)" }, tC0);
  procs.push((t) => {
    cp.style.strokeDashoffset = (L * (1 - cst.p)).toFixed(1);
    const at = cp.getPointAtLength(L * cst.p), nx = cp.getPointAtLength(Math.min(L, L * cst.p + 6));
    const ang = Math.atan2(nx.y - at.y, nx.x - at.x) * 180 / Math.PI;
    d7b.el.style.left = (at.x - d7b.w / 2) + "px";
    d7b.el.style.top = (at.y - d7b.h * 0.88) + "px";
    d7b.bobEl.style.rotate = (cst.p < 1 ? ang * 0.5 : 0) + "deg";
    ah.setAttribute("transform", `translate(${pts[7][0] + 6} ${pts[7][1] - 8}) rotate(-53)`);
  });
  tl.to(ah, { opacity: 1, duration: 0.1 }, tC1 - 0.05);
  burst(chart, pts[7][0], pts[7][1], tC1, { n: 9, r0: 60, r1: 150 });
  sfx("ding", tC1, 0.5);

  // =====================================================================
  // SCÈNE 8 — « Digiflex, l'agence au Canard. »
  // =====================================================================
  const s8 = scene("var(--pink)");
  const sw8 = wipe(S(15) - 0.75, ["var(--yellow)", "#fff", "var(--pink)"], s7, s8);
  watermark(s8, { x: -160, y: 520, rot: -14, size: 600, op: 0.06 });
  watermark(s8, { x: 1500, y: -140, rot: 12, size: 520, op: 0.06 });
  const tHit = S(15) - 0.05;
  const lg8 = logo(s8, { x: 960 - 190, y: 150, size: 380 });
  gsap.set(lg8.el, { scale: 0, rotation: -25 });
  tl.to(lg8.el, { scale: 1, rotation: -4, duration: 0.9, ease: "elastic.out(1, 0.45)" }, tHit);
  burst(s8, 960, 150 + 190, tHit + 0.05, { n: 14, r0: 250, r1: 380, thick: 18 });
  lg8.duck.st.talk = 1;
  // confettis
  for (let i = 0; i < 34; i++) {
    const c = ["var(--yellow)", "#fff", "var(--ink)"][i % 3], s = rr(14, 30);
    const cf = div("abs", s8, { left: 960, top: 340, width: s, height: i % 2 ? s : s * 0.5, background: c, borderRadius: i % 4 === 0 ? "50%" : "4px" });
    gsap.set(cf, { scale: 0 });
    const a = rr(0, Math.PI * 2), r = rr(380, 900), dur = rr(1.4, 2.2);
    tl.set(cf, { scale: 1 }, tHit);
    tl.to(cf, { x: Math.cos(a) * r, duration: dur, ease: "power3.out" }, tHit);
    tl.to(cf, { y: Math.sin(a) * r * 0.6 - 120, duration: dur * 0.4, ease: "power3.out" }, tHit);
    tl.to(cf, { y: `+=${rr(500, 800)}`, rotation: rr(-540, 540), duration: dur * 1.4, ease: "power1.in" }, tHit + dur * 0.4);
  }
  const l8a = line(s8, "Digiflex,", { y: 590, size: 190, center: true });
  const l8b = line(s8, hl("l'agence au Canard."), { y: 800, size: 110, center: true });
  show(l8a, Wd(15, "digiflex") - 0.05);
  show(l8b, Wd(15, "agence") - 0.15, Wd(15, "canard") - 0.1);
  const slogan = div("label", s8, { left: 0, width: W, top: 975, textAlign: "center", fontSize: 30, color: "#fff", letterSpacing: ".22em", opacity: 0 }, "On code &nbsp;·&nbsp; on stylise &nbsp;·&nbsp; on déploie");
  tl.to(slogan, { opacity: 1, y: -10, duration: 0.6, ease: "power2.out" }, E(15) + 0.3);
  tl.to(lg8.el, { rotation: 3, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, E(15) + 0.4);
  sfx("quack", E(15) + 1.2, 0.35);
  tl.to(lg8.duck.st, { open: 1, duration: 0.08, yoyo: true, repeat: 1 }, E(15) + 1.2);
  // fin
  tl.set({}, {}, TL.total);
  window.MUSIC_HIT = tHit;

  // ---------------------------------------------------------------- rendu
  const DURATION = (window.DURATION = TL.total);
  window.renderAt = (t) => {
    tl.seek(Math.min(t, DURATION), false);
    for (const f of procs) f(t);
  };
  window.cues = () => ({ total: DURATION, music_hit: tHit, vo_start: S(0), vo_end: E(SEG.length - 1), sfx: SFX.slice().sort((a, b) => a.t - b.t), muffle: MUFFLE });

  const params = new URLSearchParams(location.search);
  if (params.has("t")) {
    document.fonts.ready.then(() => { window.renderAt(parseFloat(params.get("t"))); window.READY = true; });
  } else if (params.has("render")) {
    document.fonts.ready.then(() => { window.renderAt(0); window.READY = true; });
  } else {
    // aperçu interactif avec le son mixé
    document.body.classList.add("preview");
    const frame = document.getElementById("frame");
    const fit = () => {
      const s = Math.min(innerWidth / W, (innerHeight - 70) / H);
      frame.style.transform = `scale(${s})`;
      frame.style.marginRight = `${W * (s - 1)}px`; frame.style.marginBottom = `${H * (s - 1)}px`;
    };
    addEventListener("resize", fit); fit();
    const audio = new Audio("audio/mix.m4a");
    const btn = document.getElementById("play"), scrub = document.getElementById("scrub"), clock = document.getElementById("clock");
    let playing = false, t0 = 0, tStart = 0;
    const now = () => (audio.readyState > 0 && !audio.paused ? audio.currentTime : playing ? tStart + (performance.now() - t0) / 1000 : tStart);
    const loop = () => {
      const t = Math.min(now(), DURATION);
      window.renderAt(t);
      scrub.value = String(Math.round((t / DURATION) * 1000));
      clock.textContent = t.toFixed(2) + " s";
      if (t >= DURATION) { playing = false; btn.textContent = "▶ Lecture"; tStart = 0; }
      if (playing) requestAnimationFrame(loop);
    };
    btn.onclick = () => {
      playing = !playing;
      btn.textContent = playing ? "❚❚ Pause" : "▶ Lecture";
      if (playing) { t0 = performance.now(); audio.currentTime = tStart; audio.play().catch(() => {}); loop(); }
      else { tStart = now(); audio.pause(); }
    };
    scrub.oninput = () => { tStart = (scrub.value / 1000) * DURATION; audio.currentTime = tStart; if (!playing) loop(); };
    document.fonts.ready.then(() => window.renderAt(0));
  }
})();
