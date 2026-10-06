import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { emberBurst } from '../lib/motion';
import { useStore } from '../context/StoreContext';

/* The spiked-D emblem as a live GSAP object.
   Built from alpha-masked layers, so it stays razor sharp at any size:
   - entrance: 9 horizontal slices fly in skewed from both sides and SLAM
     together → shockwave ring + ember burst
   - idle: chrome sheen loops, glow breathes, the mark tilts toward the
     cursor in 3D, and a random glitch tears it apart every few seconds
     (slices offset + pink/mint RGB split)
   - click / tap: strike — punch scale, shockwave, embers
   Motion paused (system setting or the site toggle) = the still emblem. */

const SLICES = 9;

export default function EmblemFX({ size = 220, className = '', label = 'Dark Divine emblem', entrance = 'scroll' }) {
  const { motionPaused } = useStore();
  const root = useRef(null);

  useEffect(() => {
    const el = root.current;
    if (!el || motionPaused) return undefined;
    const q = gsap.utils.selector(el);
    const slices = q('.efx-slice');
    const ghosts = q('.efx-ghost');
    const ring = q('.efx-ring')[0];
    const stage = q('.efx-stage')[0];
    let glitchCall;
    let started = false;
    const cleanups = []; // ctx isn't assigned until gsap.context() returns

    const ctx = gsap.context(() => {
      gsap.set(slices, { x: (i) => (i % 2 ? 1 : -1) * gsap.utils.random(140, 320), skewX: (i) => (i % 2 ? -28 : 28), autoAlpha: 0 });
      gsap.set(stage, { transformPerspective: 900 });

      const shock = () => {
        gsap.fromTo(ring, { scale: 0.35, autoAlpha: 0.9, borderWidth: 6 }, { scale: 2.1, autoAlpha: 0, borderWidth: 0, duration: 0.9, ease: 'expo.out' });
        emberBurst(el, { count: 26 });
      };

      const intro = gsap.timeline({ paused: true, onComplete: idle })
        .to(slices, { x: 0, skewX: 0, autoAlpha: 1, duration: 0.75, ease: 'expo.out', stagger: { each: 0.045, from: 'random' } })
        .fromTo(stage, { scale: 1.35, rotationY: -60, filter: 'blur(6px) brightness(2.4)' },
          { scale: 1, rotationY: 0, filter: 'blur(0px) brightness(1)', duration: 0.9, ease: 'back.out(2.2)' }, 0)
        .add(shock, 0.62)
        .fromTo(ghosts, { autoAlpha: 0.9, x: (i) => (i ? 14 : -14) }, { autoAlpha: 0, x: 0, duration: 0.5, ease: 'power3.out' }, 0.62);

      function glitch() {
        const tl = gsap.timeline();
        tl.to(slices, { x: () => gsap.utils.random(-26, 26), duration: 0.06, ease: 'steps(1)', stagger: 0.01 })
          .to(ghosts, { autoAlpha: 0.85, x: (i) => (i ? 9 : -9), duration: 0.06, ease: 'steps(1)' }, 0)
          .to(slices, { x: () => gsap.utils.random(-12, 12), duration: 0.05, ease: 'steps(1)' })
          .to(slices, { x: 0, duration: 0.08, ease: 'steps(1)' })
          .to(ghosts, { autoAlpha: 0, x: 0, duration: 0.25 }, '-=0.05');
        glitchCall = gsap.delayedCall(gsap.utils.random(3.5, 7), glitch);
      }

      function idle() {
        gsap.to(q('.efx-sheen'), { backgroundPosition: '-60% 0', duration: 2.6, ease: 'sine.inOut', repeat: -1, repeatDelay: 1.4 });
        gsap.to(q('.efx-glow'), { opacity: 0.95, scale: 1.12, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.to(stage, { y: -6, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        glitchCall = gsap.delayedCall(gsap.utils.random(2.5, 4.5), glitch);
      }

      const start = () => { if (!started) { started = true; intro.play(); } };
      if (entrance === 'now') start();
      else {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
        }, { threshold: 0.35 });
        io.observe(el);
        cleanups.push(() => io.disconnect());
      }

      // cursor tilt — fine pointers only
      const fine = window.matchMedia('(pointer: fine)').matches;
      const rx = gsap.quickTo(stage, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(stage, 'rotationY', { duration: 0.6, ease: 'power3' });
      const onMove = (e) => {
        if (!started) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
        const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
        ry(gsap.utils.clamp(-28, 28, dx * 70));
        rx(gsap.utils.clamp(-22, 22, -dy * 55));
      };
      if (fine) window.addEventListener('pointermove', onMove, { passive: true });

      const onStrike = () => {
        if (!started) return;
        gsap.timeline()
          .to(stage, { scale: 0.86, duration: 0.09, ease: 'power2.in' })
          .to(stage, { scale: 1, duration: 0.7, ease: 'elastic.out(1.1, 0.35)' })
          .add(shock, 0.09);
      };
      el.addEventListener('click', onStrike);

      cleanups.push(() => {
        window.removeEventListener('pointermove', onMove);
        el.removeEventListener('click', onStrike);
        glitchCall?.kill();
      });
    }, el);

    return () => { cleanups.forEach((fn) => fn()); ctx.revert(); };
  }, [motionPaused, entrance]);

  const step = 100 / SLICES;
  return (
    <div ref={root} className={`efx ${className}`} style={{ '--efx': `${size}px` }} role="img" aria-label={label}>
      <span className="efx-glow" aria-hidden="true" />
      <span className="efx-ring" aria-hidden="true" />
      <div className="efx-stage" aria-hidden="true">
        <span className="efx-ghost pink" />
        <span className="efx-ghost mint" />
        {Array.from({ length: SLICES }, (_, i) => (
          <span key={i} className="efx-slice"
            style={{ clipPath: `inset(${(i * step).toFixed(3)}% 0 ${Math.max(0, 100 - (i + 1) * step - 0.4).toFixed(3)}% 0)` }}>
            <span className="efx-chrome" />
            <span className="efx-sheen" />
          </span>
        ))}
      </div>
    </div>
  );
}
