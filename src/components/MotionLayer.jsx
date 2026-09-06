import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

/* ============================================================
   MotionLayer — the cinematic chrome:
   1) Preloader: brand reveal + counter + curtain lift (once/session)
   2) Custom cursor: bone dot + lagging ring, reacts to links/buttons
   Both respect prefers-reduced-motion and skip touch devices.
   ============================================================ */

export function Preloader({ paused = false }) {
  const [show, setShow] = useState(() => !paused && !sessionStorage.getItem('dd_loaded'));
  const root = useRef(null);

  useGSAP(() => {
    if (!show || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sessionStorage.setItem('dd_loaded', '1');
      setShow(false);
      return;
    }
    document.body.style.overflow = 'hidden';
    const chars = root.current.querySelectorAll('.pl-char');
    const count = { v: 0 };
    const numEl = root.current.querySelector('.pl-count');

    /* finale: the preloader's serpent mark FLIES to its seat in the header
       (a fixed clone travels while the curtain lifts), so the brand mark
       never blinks out — it lands. */
    const handoff = () => {
      const from = root.current?.querySelector('.pl-mark');
      const to = document.querySelector('.site-header .logo-mark');
      if (!from || !to) return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ghost = document.createElement('span');
      ghost.className = 'logo-mark';
      Object.assign(ghost.style, {
        position: 'fixed', left: `${a.left}px`, top: `${a.top}px`,
        width: `${a.width}px`, height: `${a.height}px`, zIndex: 1600, pointerEvents: 'none',
      });
      document.body.appendChild(ghost);
      gsap.set(from, { opacity: 0 });
      gsap.set(to, { opacity: 0 });
      gsap.to(ghost, {
        left: b.left, top: b.top, width: b.width, height: b.height,
        rotation: 360, duration: 0.85, ease: 'power3.inOut',
        onComplete: () => { gsap.set(to, { opacity: 1 }); ghost.remove(); },
      });
    };

    /* THE OPENING TITLES —
       giant counter crash-rolls · brand chars slam in with 3D flips while
       campaign frames strobe through them · the pink pulse line draws ·
       serpent mark lands, blinks its glow · everything shears out and the
       screen exits as five staggered slats (the site's tear language). */
    const flashes = gsap.utils.toArray(root.current.querySelectorAll('.pl-flash'));
    const slats = gsap.utils.toArray(root.current.querySelectorAll('.pl-slat'));

    const tl = gsap.timeline({
      onComplete: () => {
        document.body.style.overflow = '';
        sessionStorage.setItem('dd_loaded', '1');
        setShow(false);
      },
    });

    tl
      // beat 1 — the counter is the star: giant, crash-rolling
      .to(count, {
        v: 100, duration: 1.5, ease: 'power3.inOut',
        onUpdate: () => { numEl.textContent = String(Math.round(count.v)).padStart(3, '0'); },
      }, 0)
      .fromTo(numEl, { scale: 1.6, opacity: 0.25, skewX: 8 }, { scale: 1, opacity: 1, skewX: 0, duration: 1.5, ease: 'power3.out' }, 0)
      // campaign frames strobe behind (60ms hits, hand-timed)
      .fromTo(flashes[0], { opacity: 0 }, { opacity: 0.5, duration: 0.06, yoyo: true, repeat: 1 }, 0.42)
      .fromTo(flashes[1], { opacity: 0 }, { opacity: 0.5, duration: 0.06, yoyo: true, repeat: 1 }, 0.78)
      .fromTo(flashes[2], { opacity: 0 }, { opacity: 0.5, duration: 0.06, yoyo: true, repeat: 1 }, 1.13)
      // beat 2 — chars 3D-slam in, randomized, while the counter shrinks to a corner stamp
      .fromTo(chars,
        { yPercent: 135, rotationX: -90, opacity: 0 },
        { yPercent: 0, rotationX: 0, opacity: 1, duration: 0.85, stagger: { each: 0.04, from: 'random' }, ease: 'back.out(1.6)' }, 0.55)
      .to(numEl, { scale: 0.32, x: () => window.innerWidth * 0.4, y: () => window.innerHeight * 0.38, opacity: 0.5, duration: 0.6, ease: 'power3.inOut' }, 1.55)
      .fromTo('.pl-script', { opacity: 0, y: 14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' }, 1.1)
      // beat 3 — pulse line draws, mark drops in and flares
      .fromTo('.pl-line', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, 1.25)
      .fromTo('.pl-mark', { opacity: 0, scale: 2.2, rotation: 20, filter: 'blur(8px)' },
        { opacity: 1, scale: 1, rotation: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power4.out' }, 1.45)
      .to('.pl-mark', { filter: 'drop-shadow(0 0 22px rgba(239,182,196,0.9))', duration: 0.18, yoyo: true, repeat: 1 }, 2.1)
      // beat 4 — the exit: text shears away, mark flies to the header, slats tear the screen open
      .to(chars, { yPercent: -135, rotationX: 90, duration: 0.45, stagger: { each: 0.02, from: 'end' }, ease: 'power3.in' }, 2.45)
      .to('.pl-script, .pl-line, .pl-count', { opacity: 0, duration: 0.25 }, 2.45)
      .call(handoff, [], 2.62)
      .to(slats, { yPercent: -103, duration: 0.6, stagger: 0.055, ease: 'power4.inOut' }, 2.72)
      .set(root.current, { backgroundColor: 'transparent' }, 2.72);
  }, { scope: root, dependencies: [show, paused] });

  if (!show) return null;
  return (
    <div className="preloader" ref={root} aria-hidden="true">
      {/* campaign frames that strobe during the count */}
      <div className="pl-flash" style={{ backgroundImage: 'url(/media/editorial/pendant-graded-2.webp)' }} />
      <div className="pl-flash" style={{ backgroundImage: 'url(/media/editorial/ig-hatstore.webp)' }} />
      <div className="pl-flash" style={{ backgroundImage: 'url(/media/editorial/broadcast-poster.jpg)' }} />
      {/* the exit slats — same tear language as the hero */}
      <div className="pl-slats">
        {[0, 1, 2, 3, 4].map((i) => <span className="pl-slat" key={i} />)}
      </div>
      <div className="pl-inner">
        <span className="logo-mark lg pl-mark" aria-hidden="true" />
        <div className="pl-script">Illuminate the darkness within</div>
        <div className="pl-word">
          {'DARK DIVINE'.split('').map((c, i) => (
            <span className="pl-mask" key={i}><span className="pl-char">{c === ' ' ? ' ' : c}</span></span>
          ))}
        </div>
        <div className="pl-line" />
        <div className="pl-count">000</div>
      </div>
    </div>
  );
}

export function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    document.documentElement.classList.add('has-cursor');
    const dotX = gsap.quickTo(dot.current, 'x', { duration: 0.08, ease: 'power2.out' });
    const dotY = gsap.quickTo(dot.current, 'y', { duration: 0.08, ease: 'power2.out' });
    const ringX = gsap.quickTo(ring.current, 'x', { duration: 0.38, ease: 'power3.out' });
    const ringY = gsap.quickTo(ring.current, 'y', { duration: 0.38, ease: 'power3.out' });

    const move = (e) => { dotX(e.clientX); dotY(e.clientY); ringX(e.clientX); ringY(e.clientY); };
    const LABELS = { drag: 'DRAG', view: 'VIEW', open: 'MENU', shop: 'SHOP' };
    const over = (e) => {
      const hot = e.target.closest('a, button, [role="button"], input, select, textarea, summary');
      ring.current.classList.toggle('hot', Boolean(hot));
      // labeled zones: the ring grows and speaks (DRAG / VIEW / …)
      const zone = e.target.closest('[data-cursor]');
      const label = zone ? LABELS[zone.dataset.cursor] || '' : '';
      const span = ring.current.querySelector('.cursor-text');
      if (span && span.textContent !== label) span.textContent = label;
      ring.current.classList.toggle('labeled', Boolean(label));
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseover', over, { passive: true });
    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
    };
  }, []);

  return (
    <>
      <div className="cursor-dot" ref={dot} aria-hidden="true" />
      <div className="cursor-ring" ref={ring} aria-hidden="true"><span className="cursor-text" /></div>
    </>
  );
}
