import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { CustomWiggle } from 'gsap/CustomWiggle';

/* ============================================================
   motion.js — shared advanced-GSAP layer.
   Every helper checks prefers-reduced-motion at CALL time and
   degrades to an instant/no-op result, so callers never need
   their own guard.
   ============================================================ */

gsap.registerPlugin(Flip, ScrambleTextPlugin, DrawSVGPlugin, Physics2DPlugin, CustomEase, CustomWiggle);

/* the brand ease — heavy start, long luxurious settle. Every entrance
   tween that doesn't name an ease inherits it, so the whole site moves
   with one accent. Scrubbed tweens still use 'none' explicitly. */
CustomEase.create('dd', 'M0,0 C0.25,0.05 0.28,1 1,1');
gsap.defaults({ ease: 'dd', duration: 0.8 });

let wiggleEase; // created once, lazily (CustomWiggle builds a CustomEase)
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export { Flip };

/** "Denied" shake — wrong code, missing size, etc. */
export function wiggle(el, { strength = 8 } = {}) {
  if (!el || reducedMotion()) return null;
  if (!wiggleEase) wiggleEase = CustomWiggle.create('dd-wiggle', { wiggles: 6, type: 'easeOut' });
  return gsap.fromTo(el, { x: 0 }, { x: strength, duration: 0.55, ease: 'dd-wiggle', clearProps: 'x' });
}

const SCRAMBLE_CHARS = '▓▒░/\\00DARKDIVINE';

/** Decode text into place. Pass `text` to change it, omit to decode what's there. */
export function scramble(el, text, vars = {}) {
  if (!el) return null;
  const finalText = text ?? el.textContent;
  if (reducedMotion()) { el.textContent = finalText; return null; }
  return gsap.to(el, {
    duration: vars.duration ?? 0.9,
    scrambleText: { text: finalText, chars: SCRAMBLE_CHARS, speed: 0.4, ...vars.scrambleText },
    ease: 'none',
    ...vars,
  });
}

/** Tween a displayed number (subtotal, ratings). `format` receives the live value. */
export function rollNumber(el, to, { from, format = (v) => v.toFixed(2), duration = 0.6 } = {}) {
  if (!el) return null;
  if (reducedMotion()) { el.textContent = format(to); return null; }
  const o = { v: from ?? (parseFloat(String(el.textContent).replace(/[^0-9.-]/g, '')) || 0) };
  return gsap.to(o, {
    v: to, duration, ease: 'power2.out', overwrite: true,
    onUpdate: () => { el.textContent = format(o.v); },
  });
}

/** One-shot ember burst (order confirmed). Particles clean themselves up. */
export function emberBurst(container, { count = 24 } = {}) {
  if (!container || reducedMotion()) return;
  const frag = document.createDocumentFragment();
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('span');
    p.className = 'ember';
    p.style.background = Math.random() > 0.35 ? 'var(--bone)' : 'var(--red)';
    frag.appendChild(p);
    parts.push(p);
  }
  container.appendChild(frag);
  parts.forEach((p) => {
    gsap.set(p, { x: 0, y: 0, scale: gsap.utils.random(0.5, 1.3) });
    gsap.to(p, {
      duration: gsap.utils.random(0.9, 1.6),
      physics2D: {
        velocity: gsap.utils.random(180, 420),
        angle: gsap.utils.random(-125, -55),
        gravity: 560,
      },
      opacity: 0,
      ease: 'none',
      onComplete: () => p.remove(),
    });
  });
}
