import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { reducedMotion, scramble } from './motion';

gsap.registerPlugin(ScrollTrigger, SplitText);

/* ============================================================
   THE EFFECTS ENGINE — named, hand-tuned GSAP signatures.
   Elements opt in with data-fx="name"; runFx() dispatches on
   route mount (called from usePageMotion inside the motionOK
   tier — the whole engine no-ops under reduced motion).
   Hand-made mandates: no linear entrance eases, jittered
   staggers (±5%), small overshoots, 0.25s rhythm grid.
   ============================================================ */

const jitter = (base) => () => base * gsap.utils.random(0.95, 1.07);

/* -- GUILLOTINE: title splits into halves that shear and slam back -- */
function guillotine(el) {
  const wrap = document.createElement('span');
  wrap.className = 'fx-guillotine';
  wrap.setAttribute('aria-hidden', 'true');
  const top = document.createElement('span');
  const bot = document.createElement('span');
  top.className = 'fxg-half fxg-top'; bot.className = 'fxg-half fxg-bot';
  top.textContent = el.textContent; bot.textContent = el.textContent;
  wrap.appendChild(top); wrap.appendChild(bot);
  el.classList.add('fxg-host');
  el.appendChild(wrap);
  gsap.timeline({ delay: 0.25 })
    .fromTo(top, { xPercent: -115 }, { xPercent: 0, duration: 0.72, ease: 'power4.out' }, 0)
    .fromTo(bot, { xPercent: 115 }, { xPercent: 0, duration: 0.72, ease: 'power4.out' }, 0.07)
    .fromTo(wrap, { '--gap': '6px' }, { '--gap': '0px', duration: 0.34, ease: 'back.out(2.1)' }, 0.68);
}

/* -- INFERNO: chars ignite bottom-up, red glow cools to bone -- */
function inferno(el) {
  const split = new SplitText(el, { type: 'chars' });
  gsap.timeline({ delay: 0.25 })
    .fromTo(split.chars,
      { y: 34, opacity: 0, filter: 'blur(7px)', color: '#efb6c4', textShadow: '0 0 18px rgba(239,182,196,0.9)' },
      {
        y: 0, opacity: 1, filter: 'blur(0px)', duration: jitter(0.8), stagger: { each: 0.03, from: 'random' }, ease: 'power3.out',
      })
    .to(split.chars, { color: 'inherit', textShadow: '0 0 0 rgba(239,182,196,0)', duration: 1.1, stagger: 0.02, ease: 'power2.inOut' }, 0.55);
}

/* -- VENETIAN: lines flip open like blinds -- */
function venetian(el) {
  const split = new SplitText(el, { type: 'lines', linesClass: 'fx-blind' });
  gsap.set(el, { perspective: 600 });
  gsap.fromTo(split.lines,
    { rotationX: -86, opacity: 0, transformOrigin: 'center top' },
    { rotationX: 0, opacity: 1, duration: jitter(0.9), stagger: 0.12, ease: 'back.out(1.5)', delay: 0.25 });
}

/* -- ECHO: two ghosts trail the heading with scroll velocity -- */
function echo(el) {
  const mk = (o) => {
    const g = el.cloneNode(true);
    g.classList.add('fx-echo');
    g.style.opacity = o;
    g.setAttribute('aria-hidden', 'true');
    el.parentElement.appendChild(g);
    return g;
  };
  const g1 = mk(0.22); const g2 = mk(0.1);
  const q1x = gsap.quickTo(g1, 'y', { duration: 0.35, ease: 'power2.out' });
  const q2x = gsap.quickTo(g2, 'y', { duration: 0.55, ease: 'power2.out' });
  const clamp = gsap.utils.clamp(-26, 26);
  ScrollTrigger.create({
    trigger: el, start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      const v = clamp(self.getVelocity() / 90);
      q1x(v); q2x(v * 1.7);
      gsap.delayedCall(0.2, () => { q1x(0); q2x(0); });
    },
  });
}

/* -- SHATTER: image enters as tumbling 3D shards -- */
function shatter(el) {
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (!img) return;
  const host = img.parentElement;
  host.classList.add('fx-shatter-host');
  const cols = 5; const rows = 4;
  const frag = document.createDocumentFragment();
  const shards = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const s = document.createElement('div');
      s.className = 'fx-shard';
      s.style.cssText = `left:${(c / cols) * 100}%;top:${(r / rows) * 100}%;width:${100 / cols}%;height:${100 / rows}%;background-image:url('${img.currentSrc || img.src}');background-size:${cols * 100}% ${rows * 100}%;background-position:${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%;`;
      frag.appendChild(s);
      shards.push(s);
    }
  }
  host.appendChild(frag);
  gsap.set(img, { opacity: 0 });
  gsap.set(host, { perspective: 900 });
  gsap.fromTo(shards,
    { z: () => gsap.utils.random(-260, 260), rotationX: () => gsap.utils.random(-75, 75), rotationY: () => gsap.utils.random(-75, 75), opacity: 0 },
    {
      z: 0, rotationX: 0, rotationY: 0, opacity: 1,
      duration: jitter(1.05), stagger: { each: 0.028, from: 'random' }, ease: 'power3.out',
      scrollTrigger: { trigger: host, start: 'top 82%', once: true },
      onComplete: () => { gsap.set(img, { opacity: 1 }); shards.forEach((s) => s.remove()); },
    });
}

/* -- DIAGONAL SLICE: media revealed through 6 slanted slivers -- */
function slice(el) {
  const host = el.tagName === 'IMG' || el.tagName === 'VIDEO' ? el.parentElement : el;
  host.classList.add('fx-slice-host');
  const covers = [];
  for (let i = 0; i < 6; i += 1) {
    const c = document.createElement('div');
    c.className = 'fx-slice';
    c.style.left = `${i * 17 - 2}%`;
    host.appendChild(c);
    covers.push(c);
  }
  gsap.to(covers, {
    yPercent: -102, duration: jitter(0.85), stagger: 0.075, ease: 'power4.inOut', delay: 0.1,
    scrollTrigger: { trigger: host, start: 'top 85%', once: true },
    onComplete: () => covers.forEach((c) => c.remove()),
  });
}

/* -- GRID RIPPLE: hover pulses the whole grid from the hovered card -- */
function gridRipple(grid) {
  const cards = () => gsap.utils.toArray(grid.querySelectorAll('.pcard'));
  let last = 0;
  const onOver = (e) => {
    const card = e.target.closest('.pcard');
    if (!card || Date.now() - last < 650) return;
    last = Date.now();
    const list = cards();
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    gsap.fromTo(list, { scale: 1 }, {
      scale: 0.975, duration: 0.24, ease: 'power2.out', yoyo: true, repeat: 1,
      stagger: { each: 0.05, grid: [Math.ceil(list.length / cols), cols], from: list.indexOf(card) },
    });
  };
  grid.addEventListener('mouseover', onOver);
  return () => grid.removeEventListener('mouseover', onOver);
}

/* -- X-RAY: a color spotlight follows the cursor over dimmed media -- */
function xray(el) {
  el.classList.add('fx-xray');
  const setX = gsap.quickSetter(el, '--xr-x', 'px');
  const setY = gsap.quickSetter(el, '--xr-y', 'px');
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    setX(e.clientX - r.left); setY(e.clientY - r.top);
  };
  el.addEventListener('mousemove', onMove);
  return () => el.removeEventListener('mousemove', onMove);
}

/* -- LIQUID: media stretches in and settles elastically -- */
function liquid(el) {
  gsap.fromTo(el,
    { scaleY: 1.35, scaleX: 0.82, skewY: 3, opacity: 0, transformOrigin: 'center bottom' },
    {
      scaleY: 1, scaleX: 1, skewY: 0, opacity: 1, duration: jitter(1.15), ease: 'elastic.out(1, 0.62)',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
}

/* -- POSSESSION: idle corruption — random chars scramble and heal -- */
function possession(el) {
  const split = new SplitText(el, { type: 'chars' });
  const cycle = () => {
    const marks = gsap.utils.shuffle(split.chars.slice()).slice(0, 3);
    marks.forEach((c) => scramble(c, undefined, { duration: 0.5 }));
    gsap.delayedCall(gsap.utils.random(2.8, 5.5), cycle);
  };
  gsap.delayedCall(2, cycle);
}

/* -- WORD GRAVITY: words drop in and squash on landing -- */
function wordGravity(el) {
  const split = new SplitText(el, { type: 'words' });
  gsap.timeline({ delay: 0.25 })
    .fromTo(split.words,
      { y: -110, opacity: 0, rotation: () => gsap.utils.random(-9, 9) },
      { y: 0, opacity: 1, rotation: 0, duration: jitter(0.7), stagger: 0.11, ease: 'bounce.out' })
    .to(split.words, { scaleY: 0.92, duration: 0.09, stagger: 0.11, yoyo: true, repeat: 1, transformOrigin: 'center bottom' }, 0.5);
}

/* -- DUST: slow drifting motes for atmosphere zones -- */
function dust(host) {
  const N = 12;
  const tweens = [];
  for (let i = 0; i < N; i += 1) {
    const m = document.createElement('span');
    m.className = 'fx-mote';
    m.style.left = `${gsap.utils.random(2, 98)}%`;
    m.style.top = `${gsap.utils.random(5, 95)}%`;
    const s = gsap.utils.random(0.5, 1.6);
    m.style.transform = `scale(${s})`;
    host.appendChild(m);
    tweens.push(gsap.to(m, {
      x: `random(-60, 60)`, y: `random(-80, 40)`, opacity: gsap.utils.random(0.12, 0.4),
      duration: gsap.utils.random(7, 14), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: gsap.utils.random(0, 5),
    }));
  }
  // perf: motes drift only while the zone is on screen
  ScrollTrigger.create({
    trigger: host, start: 'top bottom', end: 'bottom top',
    onToggle: (self) => tweens.forEach((t) => (self.isActive ? t.play() : t.pause())),
  });
}

/* -- VENOM DRIP (hover): letters melt down and snap back -- */
function venomDrip(el) {
  const split = new SplitText(el, { type: 'chars' });
  let busy = false;
  const onEnter = () => {
    if (busy) return;
    busy = true;
    gsap.timeline({ onComplete: () => { busy = false; } })
      .to(split.chars, { scaleY: 1.55, y: 4, transformOrigin: 'center top', duration: 0.3, stagger: 0.025, ease: 'power2.in' })
      .to(split.chars, { scaleY: 1, y: 0, duration: 0.55, stagger: 0.025, ease: 'elastic.out(1.1, 0.5)' }, 0.32);
  };
  el.addEventListener('mouseenter', onEnter);
  return () => el.removeEventListener('mouseenter', onEnter);
}

/* -- KEN BURNS DUEL: two crops of one image pan opposite ways forever -- */
function kenBurns(el) {
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (!img) return;
  const twin = img.cloneNode();
  twin.classList.add('fx-kb-twin');
  twin.setAttribute('aria-hidden', 'true');
  img.parentElement.appendChild(twin);
  gsap.set([img, twin], { scale: 1.18 });
  gsap.to(img, { xPercent: -4, yPercent: 3, duration: 11, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to(twin, { xPercent: 4, yPercent: -3, duration: 11, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.fromTo(twin, { opacity: 0 }, { opacity: 0.55, duration: 5.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
}

/* -- CHAR ORBIT: characters fly in on arcs from the edges and lock in -- */
function charOrbit(el) {
  const split = new SplitText(el, { type: 'chars' });
  gsap.fromTo(split.chars,
    {
      x: () => gsap.utils.random(-140, 140),
      y: () => gsap.utils.random(-90, 90),
      rotation: () => gsap.utils.random(-160, 160),
      opacity: 0,
    },
    {
      x: 0, y: 0, rotation: 0, opacity: 1,
      duration: jitter(1.1), stagger: { each: 0.024, from: 'edges' }, ease: 'power3.inOut',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
}

/* -- FLICKER: neon tube stutters awake -- */
function flicker(el) {
  gsap.fromTo(el, { opacity: 0 }, {
    opacity: 1, duration: 0.9, ease: 'rough({ template: power1.out, strength: 2.5, points: 24, randomize: true, clamp: true })',
    scrollTrigger: { trigger: el, start: 'top 92%', once: true },
  });
}

/* ============================================================
   THE TEN — serpent-mythology signatures, second generation.
   ============================================================ */

/* -- FANG BITE (hover): two fangs sink into the word, venom wells at the wounds -- */
function fangBite(el) {
  let busy = false;
  const onEnter = (e) => {
    if (busy) return;
    busy = true;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const marks = [-7, 7].map((off) => {
      const m = document.createElement('span');
      m.className = 'fx-fang';
      m.style.left = `${x + off}px`;
      el.appendChild(m);
      return m;
    });
    gsap.timeline({ onComplete: () => { marks.forEach((m) => m.remove()); busy = false; } })
      .fromTo(marks, { y: -16, opacity: 0, scaleY: 0.4 }, { y: 0, opacity: 1, scaleY: 1, duration: 0.12, ease: 'power3.in' })
      .to(el, { y: 2.5, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.1)
      .to(marks, { height: 12, backgroundColor: '#a9dcc4', duration: 0.4, ease: 'power2.out' }, 0.24)
      .to(marks, { opacity: 0, y: 8, duration: 0.4, ease: 'power2.in' }, 0.7);
  };
  el.style.position = 'relative';
  el.addEventListener('mouseenter', onEnter);
  return () => el.removeEventListener('mouseenter', onEnter);
}

/* -- SHED SKIN: a translucent husk of the element peels away on scroll-enter -- */
function shedSkin(el) {
  ScrollTrigger.create({
    trigger: el, start: 'top 80%', once: true,
    onEnter: () => {
      const husk = el.cloneNode(true);
      husk.setAttribute('aria-hidden', 'true');
      husk.querySelectorAll('[data-fx]').forEach((x) => x.removeAttribute('data-fx'));
      const r = el.getBoundingClientRect();
      Object.assign(husk.style, {
        position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
        margin: 0, pointerEvents: 'none', zIndex: 5, opacity: 0.35, filter: 'grayscale(1) contrast(0.8)',
      });
      document.body.appendChild(husk);
      gsap.to(husk, {
        y: -44, rotation: 3.5, scaleY: 1.12, opacity: 0, transformOrigin: 'center bottom',
        duration: 1.4, ease: 'power2.out', onComplete: () => husk.remove(),
      });
      gsap.fromTo(el, { filter: 'brightness(1.35) saturate(1.2)' }, { filter: 'brightness(1) saturate(1)', duration: 1, ease: 'power2.out', clearProps: 'filter' });
    },
  });
}

/* -- CONSTRICTOR: an invisible coil squeezes the element before releasing it into place -- */
function constrictor(el) {
  gsap.fromTo(el,
    { scaleX: 1.14, scaleY: 0.82, opacity: 0 },
    {
      keyframes: [
        { scaleX: 0.9, scaleY: 1.1, opacity: 1, duration: 0.28, ease: 'power2.inOut' },
        { scaleX: 1.05, scaleY: 0.96, duration: 0.22, ease: 'power2.inOut' },
        { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.5)' },
      ],
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
}

/* -- SERPENT PUPIL: a slit-pupil eye that WATCHES the cursor from inside the element -- */
function serpentPupil(el) {
  const eye = document.createElement('span');
  eye.className = 'fx-pupil';
  eye.innerHTML = '<i></i>';
  el.style.position = 'relative';
  el.appendChild(eye);
  const iris = eye.querySelector('i');
  const qx = gsap.quickTo(iris, 'x', { duration: 0.4, ease: 'power2.out' });
  const blink = () => {
    gsap.to(eye, { scaleY: 0.08, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.inOut' });
    gsap.delayedCall(gsap.utils.random(4, 9), blink);
  };
  gsap.delayedCall(3, blink);
  const onMove = (e) => {
    const r = eye.getBoundingClientRect();
    qx(gsap.utils.clamp(-5, 5, (e.clientX - (r.left + r.width / 2)) / 40));
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  return () => window.removeEventListener('mousemove', onMove);
}

/* -- MOLT REVEAL: image surfaces as diamond scales that flip over row by row -- */
function molt(el) {
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (!img) return;
  const host = img.parentElement;
  host.classList.add('fx-shatter-host');
  const cols = 7; const rows = 5;
  const scales = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const s = document.createElement('div');
      s.className = 'fx-scale-cell';
      s.style.cssText = `left:${(c / cols) * 100}%;top:${(r / rows) * 100}%;width:${100 / cols + 0.5}%;height:${100 / rows + 0.5}%;background-image:url('${img.currentSrc || img.src}');background-size:${cols * 100}% ${rows * 100}%;background-position:${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%;`;
      host.appendChild(s);
      scales.push(s);
    }
  }
  gsap.set(img, { opacity: 0 });
  gsap.set(host, { perspective: 700 });
  gsap.fromTo(scales, { rotationY: 92, opacity: 0 }, {
    rotationY: 0, opacity: 1, duration: 0.65,
    stagger: { each: 0.035, grid: [rows, cols], from: 'start', axis: null },
    ease: 'power2.out',
    scrollTrigger: { trigger: host, start: 'top 82%', once: true },
    onComplete: () => { gsap.set(img, { opacity: 1 }); scales.forEach((s) => s.remove()); },
  });
}

/* -- RATTLE: warning shake that intensifies while hovering a destructive control -- */
function rattle(el) {
  let tween;
  const onEnter = () => {
    tween = gsap.to(el, {
      x: 1.5, duration: 0.05, yoyo: true, repeat: -1, ease: 'none',
      modifiers: { x: (x) => `${parseFloat(x) * gsap.utils.random(0.6, 1.6)}px` },
    });
    gsap.to(el, { color: '#efb6c4', duration: 0.3 });
  };
  const onLeave = () => { tween?.kill(); gsap.to(el, { x: 0, color: 'inherit', duration: 0.25, clearProps: 'color' }); };
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  return () => { tween?.kill(); el.removeEventListener('mouseenter', onEnter); el.removeEventListener('mouseleave', onLeave); };
}

/* -- HATCH: the element cracks out of an egg-shell wash (fractured clip shards fall away) -- */
function hatch(el) {
  ScrollTrigger.create({
    trigger: el, start: 'top 84%', once: true,
    onEnter: () => {
      const shellTop = document.createElement('span');
      const shellBot = document.createElement('span');
      [shellTop, shellBot].forEach((s, i) => {
        s.className = 'fx-shell';
        s.style.clipPath = i === 0
          ? 'polygon(0 0, 100% 0, 100% 38%, 82% 46%, 65% 36%, 48% 50%, 30% 38%, 14% 48%, 0 40%)'
          : 'polygon(0 40%, 14% 48%, 30% 38%, 48% 50%, 65% 36%, 82% 46%, 100% 38%, 100% 100%, 0 100%)';
        el.appendChild(s);
      });
      el.style.position = 'relative';
      gsap.timeline()
        .to(el, { x: 1.5, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, 0)
        .to(shellTop, { y: -34, rotation: -4, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.35)
        .to(shellBot, { y: 30, rotation: 3, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.42)
        .call(() => { shellTop.remove(); shellBot.remove(); });
    },
  });
}

/* -- HEAT VISION: pit-viper thermal — media glows infrared until the cursor "cools" it to true color -- */
function heatVision(el) {
  el.classList.add('fx-heat');
  const onEnter = () => gsap.to(el, { '--heat': 0, duration: 1.1, ease: 'power2.out' });
  const onLeave = () => gsap.to(el, { '--heat': 1, duration: 1.6, ease: 'power2.inOut' });
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  return () => { el.removeEventListener('mouseenter', onEnter); el.removeEventListener('mouseleave', onLeave); };
}

/* -- COIL COUNTER: numbers wind in like a tightening coil (rotation + radius decay per digit) -- */
function coilCounter(el) {
  const split = new SplitText(el, { type: 'chars' });
  gsap.fromTo(split.chars,
    {
      rotation: () => gsap.utils.random(220, 340),
      x: (i) => Math.cos(i) * 60,
      y: (i) => Math.sin(i * 1.7) * 42,
      opacity: 0, scale: 0.4,
    },
    {
      rotation: 0, x: 0, y: 0, opacity: 1, scale: 1,
      duration: jitter(1.0), stagger: 0.06, ease: 'back.out(1.4)',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
}

/* -- SLITHER WAKE: the cursor leaves a fading trail of serpent-scale diamonds -- */
function slitherWake(zone) {
  let last = 0;
  const onMove = (e) => {
    const now = performance.now();
    if (now - last < 46) return; // throttle: ~2 scales per 100ms max
    last = now;
    const s = document.createElement('span');
    s.className = 'fx-wake';
    s.style.left = `${e.clientX}px`;
    s.style.top = `${e.clientY}px`;
    s.style.background = Math.random() > 0.5 ? 'rgba(239,182,196,0.5)' : 'rgba(169,220,196,0.5)';
    document.body.appendChild(s);
    gsap.fromTo(s,
      { scale: 0.4, opacity: 0.8, rotation: 45 },
      { scale: gsap.utils.random(1.1, 1.7), opacity: 0, y: gsap.utils.random(4, 14), duration: 0.75, ease: 'power2.out', onComplete: () => s.remove() });
  };
  zone.addEventListener('mousemove', onMove, { passive: true });
  return () => zone.removeEventListener('mousemove', onMove);
}

const REGISTRY = {
  guillotine, inferno, venetian, echo, shatter, slice, xray, liquid, possession, wordGravity, dust, venomDrip, kenBurns, charOrbit, flicker,
  fangBite, shedSkin, constrictor, serpentPupil, molt, rattle, hatch, heatVision, coilCounter, slitherWake,
};

/** Dispatch all data-fx elements on the current page. Returns cleanups. */
export function runFx() {
  if (reducedMotion()) return [];
  const cleanups = [];
  document.querySelectorAll('[data-fx], [data-fx2]').forEach((el) => {
    if (el.dataset.fxDone) return;
    el.dataset.fxDone = '1';
    [el.dataset.fx, el.dataset.fx2].filter(Boolean).forEach((name) => {
      const fn = REGISTRY[name];
      if (fn) {
        const out = fn(el);
        if (typeof out === 'function') cleanups.push(out);
      }
    });
  });
  document.querySelectorAll('[data-fx-grid]').forEach((g) => {
    if (!g.dataset.fxDone) { g.dataset.fxDone = '1'; const out = gridRipple(g); if (out) cleanups.push(out); }
  });
  return cleanups;
}
