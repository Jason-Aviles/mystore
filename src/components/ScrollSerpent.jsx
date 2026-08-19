import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { useGSAP } from '@gsap/react';
import { reducedMotion, emberBurst } from '../lib/motion'; // registers DrawSVG

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

/* ============================================================
   THE SCROLL SERPENT — the brand's snake slithers down the page.
   Beaded spine draws behind a red-glow head riding the curve
   (DrawSVG + MotionPath on one scrub). Alive, not mechanical:
   the tongue flicks at random, the eye tracks the cursor, and
   fast scrolling makes the head shiver. Desktop only, behind
   content, never intercepts a click.
   variant="quiet" (Shop/PDP): half amplitude, dimmer.
   ============================================================ */

export default function ScrollSerpent({ variant = 'full' }) {
  const svgRef = useRef(null);

  useGSAP(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (reducedMotion() || !window.matchMedia('(min-width: 900px) and (hover: hover)').matches) return;
    const quiet = variant === 'quiet';
    const path = svg.querySelector('.ss-path');
    const glow = svg.querySelector('.ss-glow');
    const hi = svg.querySelector('.ss-hi');
    const scales = svg.querySelector('.ss-scales');
    const head = svg.querySelector('.ss-head');
    const tongue = svg.querySelector('.ss-tongue');
    const eyes = svg.querySelectorAll('.ss-eye');
    if (quiet) svg.style.opacity = 0.55;

    /* the creature, not a doodle — skull rides at 2.5× (2× when quiet) */
    const headScale = quiet ? 2 : 2.5;
    gsap.set(head, { scale: headScale, transformOrigin: 'center' });

    /* the skin crawls WITH the scroll — a free-running dashoffset tween
       would repaint the full-page SVG every frame and stall navigation,
       so the crawl is scrubbed: it only paints while you're moving */
    gsap.to(scales, {
      strokeDashoffset: -600, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'max', scrub: 0.5 },
    });

    /* body generated to fit the real page: one S-bend per ~900px */
    const build = () => {
      const W = document.documentElement.clientWidth;
      const H = document.documentElement.scrollHeight;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.style.width = `${W}px`;
      svg.style.height = `${H}px`;
      const top = window.innerHeight * 1.15;
      const bottom = H - 760;
      const span = Math.max(bottom - top, 1200);
      const waves = Math.max(4, Math.round(span / 900));
      const amp = W * (quiet ? 0.2 : 0.4);
      const cx = W / 2;
      let d = `M ${cx} ${top}`;
      for (let i = 0; i < waves; i += 1) {
        const y0 = top + (span / waves) * i;
        const y1 = top + (span / waves) * (i + 1);
        const bend = cx + (i % 2 ? -amp : amp);
        d += ` Q ${bend} ${(y0 + y1) / 2} ${cx} ${y1}`;
      }
      path.setAttribute('d', d);
      glow.setAttribute('d', d);
      hi.setAttribute('d', d);
      scales.setAttribute('d', d);
    };
    build();

    const st = { trigger: document.body, start: 'top top', end: 'max', scrub: 0.7, invalidateOnRefresh: true };
    gsap.fromTo([path, glow, hi, scales], { drawSVG: '0% 0%' }, {
      drawSVG: '0% 100%', ease: 'none',
      scrollTrigger: { ...st, onRefresh: build },
    });
    gsap.to(head, {
      ease: 'none',
      motionPath: { path, align: path, alignOrigin: [0.5, 0.5], autoRotate: 90 },
      scrollTrigger: st,
    });
    // idle life: the whole skull breathes; eyes blink every 8–14s
    gsap.to(head.querySelector('.ss-skull'), { scale: 1.1, transformOrigin: 'center', duration: 1.3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const blink = () => {
      gsap.to(eyes, { scaleY: 0.1, transformOrigin: 'center', duration: 0.07, yoyo: true, repeat: 1 });
      gsap.delayedCall(gsap.utils.random(8, 14), blink);
    };
    gsap.delayedCall(6, blink);

    /* THE STRIKE: click near the head and it lunges at your cursor */
    const onStrike = (e) => {
      const hr = head.getBoundingClientRect();
      const hx = hr.left + hr.width / 2; const hy = hr.top + hr.height / 2;
      const dx = e.clientX - hx; const dy = e.clientY - hy;
      if (Math.hypot(dx, dy) > 150) return;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      gsap.timeline()
        .to(head, { x: dx * 0.55, y: dy * 0.55, rotation: `+=${gsap.utils.clamp(-20, 20, ang / 8)}`, scale: headScale * 1.4, duration: 0.13, ease: 'power3.in' })
        .to(head, { x: 0, y: 0, scale: headScale, rotation: '-=0', duration: 0.6, ease: 'back.out(2.4)' });
      // triple tongue flick + embers at the bite point
      gsap.timeline()
        .fromTo(tongue, { drawSVG: '0% 0%', opacity: 1 }, { drawSVG: '0% 100%', duration: 0.09, repeat: 5, yoyo: true, ease: 'power2.out' })
        .set(tongue, { opacity: 0 });
      const nest = document.createElement('span');
      Object.assign(nest.style, { position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`, zIndex: 999, pointerEvents: 'none' });
      document.body.appendChild(nest);
      emberBurst(nest, { count: 10 });
      setTimeout(() => nest.remove(), 1800);
    };
    document.addEventListener('click', onStrike);

    /* velocity shiver: fast scroll rattles the head sideways */
    const shiver = gsap.quickTo(head, 'x', { duration: 0.4, ease: 'power2.out' });
    const clampV = gsap.utils.clamp(-6, 6);
    ScrollTrigger.create({
      onUpdate: (self) => {
        shiver(clampV(self.getVelocity() / 500));
        gsap.delayedCall(0.25, () => shiver(0));
      },
    });

    /* tongue: random flicks — draw out, snap back */
    let tongueCall;
    const flick = () => {
      gsap.timeline()
        .fromTo(tongue, { drawSVG: '0% 0%', opacity: 1 }, { drawSVG: '0% 100%', duration: 0.14, ease: 'power2.out' })
        .to(tongue, { drawSVG: '100% 100%', duration: 0.12, ease: 'power2.in' })
        .set(tongue, { opacity: 0 });
      tongueCall = gsap.delayedCall(gsap.utils.random(3.5, 7), flick);
    };
    tongueCall = gsap.delayedCall(2.5, flick);

    /* eyes: both pupils track the cursor */
    const movers = Array.from(eyes).map((eye) => ({
      x: gsap.quickTo(eye, 'x', { duration: 0.5, ease: 'power2.out' }),
      y: gsap.quickTo(eye, 'y', { duration: 0.5, ease: 'power2.out' }),
    }));
    const onMove = (e) => {
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      movers.forEach((m) => { m.x(px * 3.2); m.y(py * 3.2); });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onStrike);
      tongueCall?.kill();
    };
  }, { scope: svgRef, dependencies: [variant] });

  return (
    <svg className="scroll-serpent" ref={svgRef} aria-hidden="true" preserveAspectRatio="none">
      <path className="ss-glow" fill="none" />
      <path className="ss-path" fill="none" />
      <path className="ss-hi" fill="none" />
      <path className="ss-scales" fill="none" />
      <g className="ss-head">
        <path className="ss-tongue" d="M 0 -9 L 0 -17 M 0 -17 L -2.6 -21 M 0 -17 L 2.6 -21" fill="none" />
        {/* viper skull: pointed snout, flared jaw, brow ridges */}
        <path className="ss-skull" d="M 0 -10 C 3.4 -8.5 5.6 -5 5.8 -1.2 C 6 2 4.6 5.6 2.6 7.6 C 1.4 8.8 -1.4 8.8 -2.6 7.6 C -4.6 5.6 -6 2 -5.8 -1.2 C -5.6 -5 -3.4 -8.5 0 -10 Z" />
        <path className="ss-brow" d="M -4.6 -3.4 L -1.6 -4.4 M 4.6 -3.4 L 1.6 -4.4" fill="none" />
        <circle className="ss-eye" r="1.25" cx="-2.7" cy="-2" />
        <circle className="ss-eye" r="1.25" cx="2.7" cy="-2" />
        <circle className="ss-nostril" r="0.55" cx="-1.1" cy="-7" />
        <circle className="ss-nostril" r="0.55" cx="1.1" cy="-7" />
      </g>
    </svg>
  );
}
