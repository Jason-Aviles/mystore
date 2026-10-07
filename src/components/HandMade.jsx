import { useEffect, useId, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { useStore } from '../context/StoreContext';
import { reducedMotion } from '../lib/motion';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

/* ============================================================
   HAND-MADE MOTION KIT — the anti-"smooth web" layer.
   • line boil   — SVG turbulence whose seed is redrawn 12×/sec, so
                   outlines wobble like hand-drawn animation on twos
   • on twos     — stop-motion stepping (steps ease) instead of buttery
                   tweens for the hand-drawn pieces
   • marker scribble reveal — the wordmark is uncovered by thick
                   marker strokes, not a fade
   • misregistration — pink + mint print layers sit slightly off and
                   jump on hover, like a risograph/screen print
   • sketch underlines + pen circles — rough strokes drawn under section
                   headings on scroll and around buttons on hover
   Everything is off when motion is paused (site toggle or OS setting).
   ============================================================ */

const TWOS = (frames) => `steps(${frames})`;

/* -------- boil filters (mounted once in Layout) -------- */
export function BoilDefs() {
  const { motionPaused } = useStore();
  const soft = useRef(null);
  const hard = useRef(null);

  useEffect(() => {
    if (motionPaused || reducedMotion()) return undefined;
    let seed = 1;
    // 12 fps on purpose — that stutter IS the hand-drawn feel
    const id = setInterval(() => {
      if (document.hidden) return;
      seed = (seed % 6) + 1;
      soft.current?.setAttribute('seed', String(seed));
      hard.current?.setAttribute('seed', String(seed + 7));
    }, 1000 / 12);
    return () => clearInterval(id);
  }, [motionPaused]);

  return (
    <svg className="boil-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="dd-boil" x="-5%" y="-10%" width="110%" height="120%">
        <feTurbulence ref={soft} type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="1" />
        <feDisplacementMap in="SourceGraphic" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="dd-boil-hard" x="-8%" y="-15%" width="116%" height="130%">
        <feTurbulence ref={hard} type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="8" />
        <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/* marker scribble — six hand-ish passes across a 900×300 box */
const SCRIBBLE = 'M-60 38 C 180 12, 520 58, 960 22 M960 22 C 640 92, 260 70, -60 118 M-60 118 C 260 140, 640 100, 960 152 '
  + 'M960 152 C 600 210, 300 170, -60 214 M-60 214 C 300 236, 620 206, 960 262 M960 262 C 620 320, 260 290, -60 330';

/** The gothic metal wordmark, drawn by hand.
    half: 'left' | 'right' shows only DARK / DIVINE (the hero splits it)
    reveal: 'now' | 'scroll' | 'none'  ·  delay in seconds (for 'now')

    PERFORMANCE (Oct 2026 fix): SVG masks inside the pinned, 3D-tilting hero
    were re-cut on every scroll frame and halved the frame rate. Now the
    colours are pre-tinted images (no glyph masks), the marker-scribble
    mask exists ONLY while it is drawing, and the boil filter runs only
    while drawing or hovered. At rest it is three plain images. */
const WM = { bone: '/media/brand/wordmark-bone.webp', pink: '/media/brand/wordmark-pink.webp', mint: '/media/brand/wordmark-mint.webp' };

export function HandWordmark({ className = '', label = 'Dark Divine', reveal = 'scroll', delay = 0, half = null, decorative = false }) {
  const { motionPaused } = useStore();
  const uid = useId().replace(/:/g, '');
  const root = useRef(null);
  const vb = half === 'left' ? '0 0 450 300' : half === 'right' ? '450 0 450 300' : '0 0 900 300';
  const still = motionPaused || reducedMotion() || reveal === 'none';
  const [drawing, setDrawing] = useState(!still);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return undefined;
    const prints = svg.querySelectorAll('.hw-print');
    const art = svg.querySelector('.hw-art');
    if (still) { setDrawing(false); gsap.set(prints, { opacity: 0.7, x: (i) => (i ? -3 : 3.5), y: (i) => (i ? 1.5 : -1.5) }); return undefined; }
    const scribble = svg.querySelector('.hw-scribble');
    const ctx = gsap.context(() => {
      gsap.set(scribble, { drawSVG: '0%' });
      gsap.set(prints, { opacity: 0 });
      const tl = gsap.timeline({ paused: true, delay, onComplete: () => setDrawing(false) })
        .to(scribble, { drawSVG: '100%', duration: 1.15, ease: TWOS(14) })
        .to(prints, { opacity: 0.7, duration: 0.01 }, 0.5)
        .fromTo(prints, { x: (i) => (i ? -14 : 14), y: (i) => (i ? 6 : -6) },
          { x: (i) => (i ? -3 : 3.5), y: (i) => (i ? 1.5 : -1.5), duration: 0.6, ease: TWOS(6) }, 0.5);
      if (reveal === 'now') tl.play();
      else ScrollTrigger.create({ trigger: svg, start: 'top 88%', once: true, onEnter: () => tl.play() });
    }, svg);
    return () => ctx.revert();
  }, [still, reveal, delay]);

  // hover (fine pointers): the print shudders out of register and the ink boils
  useEffect(() => {
    const svg = root.current;
    if (!svg || still) return undefined;
    const prints = svg.querySelectorAll('.hw-print');
    const art = svg.querySelector('.hw-art');
    const onEnter = () => {
      art.setAttribute('filter', 'url(#dd-boil-hard)');
      gsap.to(prints, { x: (i) => (i ? -9 : 10), y: (i) => (i ? 4 : -3), duration: 0.25, ease: TWOS(3), overwrite: true });
    };
    const onLeave = () => {
      art.removeAttribute('filter');
      gsap.to(prints, { x: (i) => (i ? -3 : 3.5), y: (i) => (i ? 1.5 : -1.5), duration: 0.4, ease: TWOS(4), overwrite: true });
    };
    svg.addEventListener('mouseenter', onEnter);
    svg.addEventListener('mouseleave', onLeave);
    return () => { svg.removeEventListener('mouseenter', onEnter); svg.removeEventListener('mouseleave', onLeave); };
  }, [still]);

  return (
    <svg ref={root} className={`hand-wm ${className}`} viewBox={vb} preserveAspectRatio="xMidYMid meet"
      role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
      {drawing && (
        <defs>
          <mask id={`s${uid}`} maskUnits="userSpaceOnUse" x="-80" y="-40" width="1060" height="400">
            <path className="hw-scribble" d={SCRIBBLE} fill="none" stroke="#fff" strokeWidth="128" strokeLinecap="round" strokeLinejoin="round" />
          </mask>
        </defs>
      )}
      <g mask={drawing ? `url(#s${uid})` : undefined}>
        <g className="hw-art" filter={drawing ? 'url(#dd-boil)' : undefined}>
          {/* off-register print layers (pre-tinted — no runtime masks) */}
          <image className="hw-print" href={WM.pink} x="0" y="0" width="900" height="300" />
          <image className="hw-print" href={WM.mint} x="0" y="0" width="900" height="300" />
          <image href={WM.bone} x="0" y="0" width="900" height="300" />
        </g>
      </g>
    </svg>
  );
}

/* -------- sketch underlines + pen circles (wired per route) -------- */
const UNDERLINES = [
  'M4 14 C 60 6, 140 18, 220 9 S 360 4, 396 12',
  'M3 10 C 90 18, 170 3, 260 13 C 320 19, 372 8, 397 11 M210 16 C 260 12, 330 18, 390 15',
  'M6 12 Q 100 2, 200 12 T 394 10',
];
const CIRCLE = 'M18 30 C 14 8, 96 2, 150 6 C 196 10, 214 26, 206 44 C 196 66, 120 74, 70 70 C 24 66, 6 50, 12 32 C 18 16, 60 6, 96 8';

/** Call once per route (after the page renders). Returns a cleanup. */
export function wireHandMade() {
  if (reducedMotion() || document.documentElement.classList.contains('motion-paused')) return () => {};
  const made = [];
  const triggers = [];

  // rough marker underline under section + page headings
  document.querySelectorAll('.section-head h2, .page-head h1').forEach((h, i) => {
    if (h.querySelector('.sketch-line')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 22');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('sketch-line');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', UNDERLINES[i % UNDERLINES.length]);
    svg.appendChild(path);
    h.classList.add('has-sketch');
    h.appendChild(svg);
    made.push(svg);
    gsap.set(path, { drawSVG: '0%' });
    triggers.push(ScrollTrigger.create({
      trigger: h, start: 'top 82%', once: true,
      onEnter: () => gsap.to(path, { drawSVG: '100%', duration: 0.8, ease: TWOS(10), delay: 0.25 }),
    }));
  });

  // pen circle around primary buttons on hover (fine pointers only)
  const onOver = (e) => {
    const btn = e.target.closest?.('.btn:not(.btn-sm):not(.btn-block)');
    if (!btn || btn.querySelector(':scope > .pen-circle')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 220 78');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('pen-circle');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CIRCLE);
    svg.appendChild(path);
    btn.appendChild(svg);
    gsap.fromTo(path, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5, ease: TWOS(7) });
    const leave = () => {
      btn.removeEventListener('mouseleave', leave);
      gsap.to(path, { drawSVG: '100% 100%', duration: 0.3, ease: TWOS(4), onComplete: () => svg.remove() });
    };
    btn.addEventListener('mouseleave', leave);
  };
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) document.addEventListener('mouseover', onOver);

  return () => {
    if (fine) document.removeEventListener('mouseover', onOver);
    triggers.forEach((t) => t.kill());
    made.forEach((n) => n.remove());
    document.querySelectorAll('.has-sketch').forEach((h) => h.classList.remove('has-sketch'));
    document.querySelectorAll('.pen-circle').forEach((n) => n.remove());
  };
}
