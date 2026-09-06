import { useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { scramble } from '../lib/motion'; // side effect: registers Flip/Scramble/DrawSVG/Physics2D/Wiggle
import { runFx } from '../lib/effects';
import { metaPageView } from '../lib/meta';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, useGSAP);

/* last click point seeds the ink-bleed route transition */
const inkSeed = { x: null, y: null };
if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => { inkSeed.x = e.clientX; inkSeed.y = e.clientY; }, { capture: true });
}

/* ============================================================
   usePageMotion — re-runs on every route change (storefront only).
   Everything lives inside gsap.matchMedia so reduced-motion users
   get a static page, and useGSAP reverts it all between routes.

   GSAP owns ALL entrance motion. CSS transitions on transform/
   opacity are disabled on animated elements while GSAP drives
   them (they fight tweens and smear the motion), then restored
   with clearProps so hover styles keep working.
   ============================================================ */
/* tab heartbeat: leave the tab and the title calls you back (once wired) */
let tabFxArmed = false;
function armTabFx() {
  if (tabFxArmed) return;
  tabFxArmed = true;
  const base = document.title;
  let timer;
  document.addEventListener('visibilitychange', () => {
    clearInterval(timer);
    if (document.hidden) {
      const msg = 'YOU LEFT THE DARKNESS… ⛧ DARK DIVINE ⛧ ';
      let i = 0;
      timer = setInterval(() => {
        document.title = msg.slice(i) + msg.slice(0, i);
        i = (i + 1) % msg.length;
      }, 350);
    } else {
      document.title = base;
    }
  });
}

export default function usePageMotion(ready, motionPaused = false) {
  const { pathname } = useLocation();

  useGSAP(() => {
    if (!ready) return;
    armTabFx();
    metaPageView();
    if (motionPaused) {
      gsap.set('main, main *', { clearProps: 'transform,opacity,visibility,clipPath,filter' });
      document.querySelectorAll('.reveal').forEach((element) => element.classList.add('in'));
      return;
    }
    const mm = gsap.matchMedia();

    mm.add({
      motionOK: '(prefers-reduced-motion: no-preference)',
      reduced: '(prefers-reduced-motion: reduce)',
      phone: '(max-width: 899px)',
    }, (ctx) => {
      /* ---- GENTLE TIER (prefers-reduced-motion) ----
         Not a dead page: soft opacity fades only — no pins, no parallax,
         no scale/rotation — so reduced-motion users (incl. Windows with
         "Animation effects" off) still see a living site. */
      if (!ctx.conditions.motionOK) {
        gsap.fromTo('main', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' });
        gsap.fromTo('[data-hero-script], [data-hero-title], [data-hero-sub], [data-hero-ctas], [data-hero-meta]',
          { opacity: 0 }, { opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power1.out', delay: 0.15 });
        gsap.utils.toArray('.reveal').forEach((el) => el.classList.add('in'));
        const fadeSel = '.grid > *, .q-cell, .proof-cell, .review, .look, .foot-grid > div, .hpanel';
        gsap.set(fadeSel, { opacity: 0 });
        ScrollTrigger.batch(fadeSel, {
          start: 'top 95%', once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, duration: 0.7, stagger: 0.07, ease: 'none', overwrite: true }),
        });
        return;
      }

      const cleanups = [];

      /* ---- SCROLLSMOOTHER: full-site inertia (desktop pointer only) ----
         Touch keeps native momentum; overlays pause the smoother via the
         dd:lockScroll events dispatched by drawers/menus. */
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && document.querySelector('#smooth-wrapper')) {
        const smoother = ScrollSmoother.create({
          wrapper: '#smooth-wrapper',
          content: '#smooth-content',
          smooth: 1.1,
          effects: true,
          normalizeScroll: false, // keep native wheel in overlays scrollable outside the wrapper
        });
        const lock = () => smoother.paused(true);
        const unlock = () => smoother.paused(false);
        window.addEventListener('dd:lockScroll', lock);
        window.addEventListener('dd:unlockScroll', unlock);
        cleanups.push(() => {
          window.removeEventListener('dd:lockScroll', lock);
          window.removeEventListener('dd:unlockScroll', unlock);
          smoother.kill();
        });
      }

      /* ---- take ownership of .reveal from the CSS/IO fallback ---- */
      const reveals = gsap.utils.toArray('.reveal');
      reveals.forEach((el) => el.classList.add('in'));
      gsap.set(reveals, { transition: 'none', opacity: 1, y: 0 });
      // generic reveals = ones not given a bespoke animation below
      // skip reveals that get a bespoke animation below (lookbook wipes, story media clip, cell grids)
      /* grid children are excluded — they have their own "vault in" below,
         and a second overwrite-tween here froze cards mid-pose over the
         shop toolbar (the buried-search-bar bug) */
      const generic = reveals.filter((el) => !el.matches('.look, .story .media, .grid > *') && !el.querySelector('.q-cell, .proof-cell'));
      if (generic.length) {
        gsap.set(generic, { opacity: 0, y: 56 });
        ScrollTrigger.batch(generic, {
          start: 'top 92%', once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', overwrite: true }),
        });
      }

      /* ---- ROUTE VEIL v3 — each destination gets its own signature ----
         →product: INK BLEED retracting into the exact point you clicked
         →shop:    SHARD STORM — screen breaks into 12 flipping panels
         →cart:    FILM BURN — white flash + grain + RGB split
         →drop:    vault line · default: vertical lift. */
      const veil = document.querySelector('.page-veil');
      if (veil) {
        /* leftovers from a PREVIOUS transition killed mid-flight (rapid
           navigation reverts the context before onComplete fires) would
           otherwise sit over the page forever */
        document.querySelectorAll('.veil-shard, .veil-rgb').forEach((n) => n.remove());
        cleanups.push(() => document.querySelectorAll('.veil-shard, .veil-rgb').forEach((n) => n.remove()));
        const mark = veil.querySelector('.logo-mark');
        gsap.set(veil, { clearProps: 'clipPath,transform', yPercent: 0, autoAlpha: 1 });
        const park = () => gsap.set(veil, { yPercent: 103, clipPath: 'none', autoAlpha: 1 });
        const tl = gsap.timeline({ onComplete: park });
        tl.fromTo(mark, { scale: 0.55, opacity: 0, rotation: -12 },
          { scale: 1, opacity: 1, rotation: 0, duration: 0.3, ease: 'back.out(2)' }, 0);

        if (pathname.startsWith('/product')) {
          const x = inkSeed.x ?? window.innerWidth / 2;
          const y = inkSeed.y ?? window.innerHeight / 2;
          tl.fromTo(veil, { clipPath: `circle(160% at ${x}px ${y}px)` },
            { clipPath: `circle(0% at ${x}px ${y}px)`, duration: 0.95, ease: 'power4.inOut' }, 0.18);
        } else if (pathname.startsWith('/shop') || pathname.startsWith('/collection')) {
          // shard storm: 12 panels flip out in 3D
          const shards = [];
          for (let i = 0; i < 12; i += 1) {
            const s = document.createElement('div');
            s.className = 'veil-shard';
            s.style.left = `${(i % 4) * 25}%`;
            s.style.top = `${Math.floor(i / 4) * 33.4}%`;
            veil.appendChild(s);
            shards.push(s);
          }
          gsap.set(veil, { background: 'transparent', perspective: 900 });
          tl.to(shards, {
            rotationX: () => gsap.utils.random(-100, 100),
            rotationY: () => gsap.utils.random(-100, 100),
            z: 320, opacity: 0,
            duration: 0.8, stagger: { each: 0.045, from: 'random' }, ease: 'power3.in',
          }, 0.2).call(() => {
            shards.forEach((s) => s.remove());
            gsap.set(veil, { clearProps: 'background,perspective' });
          });
        } else if (pathname.startsWith('/cart')) {
          // film burn: flash to white, grain spike, RGB-split copies part ways
          const r = veil.cloneNode(false); const b = veil.cloneNode(false);
          r.className = 'page-veil veil-rgb veil-r'; b.className = 'page-veil veil-rgb veil-b';
          veil.parentElement.appendChild(r); veil.parentElement.appendChild(b);
          tl.to(veil, { backgroundColor: '#fffdf6', duration: 0.14, ease: 'power2.in' }, 0.1)
            .to([r, b], { autoAlpha: 0.5, duration: 0.05 }, 0.22)
            .to(r, { xPercent: 2.2, duration: 0.12, ease: 'power2.out' }, 0.24)
            .to(b, { xPercent: -2.2, duration: 0.12, ease: 'power2.out' }, 0.24)
            .to([veil, r, b], { autoAlpha: 0, duration: 0.3, ease: 'power2.out' }, 0.38)
            .call(() => { r.remove(); b.remove(); gsap.set(veil, { clearProps: 'backgroundColor' }); });
        } else if (pathname.startsWith('/drop')) {
          tl.fromTo(veil, { clipPath: 'inset(0 0 0 0)' },
            { clipPath: 'inset(50% 0 50% 0)', duration: 0.8, ease: 'power4.inOut' }, 0.18)
            .to(veil, { autoAlpha: 0, duration: 0.15, ease: 'none' }, 0.92);
        } else {
          tl.fromTo(veil, { yPercent: 0 }, { yPercent: -103, duration: 0.85, ease: 'power4.inOut' }, 0.18);
        }
      }

      /* ---- THE EFFECTS ENGINE: dispatch every data-fx on this page ---- */
      runFx().forEach((fn) => cleanups.push(fn));
      gsap.fromTo('main', { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', clearProps: 'opacity,transform', delay: 0.1 });

      /* ---- THE MONOCHROME WORLD RULE ----
         The page arrives fully black & white and EARNS its color:
         G1 route bloom, G2 media colorizes as you reach it,
         G3 hover ignites any single image early. The serpent stays
         red — the only permanent color on the page. */
      gsap.fromTo('main', { filter: 'grayscale(1) contrast(1.08)' },
        { filter: 'grayscale(0) contrast(1)', duration: 1.5, ease: 'power2.inOut', clearProps: 'filter', delay: 0.35 });

      const gradeMedia = gsap.utils.toArray('main img, main video').filter((m) => !m.closest('.pcard .media')); // cards keep their flip/hover filters
      gsap.set(gradeMedia, { filter: 'grayscale(1) brightness(0.88)' });
      const ignite = (m) => {
        if (m.dataset.lit) return;
        m.dataset.lit = '1';
        gsap.timeline()
          .to(m, { filter: 'grayscale(0) brightness(1) saturate(1.18)', duration: 0.9, ease: 'power2.inOut' })
          .to(m, { filter: 'grayscale(0) brightness(1) saturate(1)', duration: 0.6, ease: 'power1.out', clearProps: 'filter' });
      };
      ScrollTrigger.batch(gradeMedia, {
        start: 'top 62%', once: true,
        onEnter: (els) => els.forEach(ignite),
      });
      const hoverIgnite = (e) => {
        const m = e.target.closest('img, video');
        if (m && !m.dataset.lit && !m.closest('.pcard .media')) ignite(m);
      };
      document.addEventListener('mouseover', hoverIgnite);
      cleanups.push(() => document.removeEventListener('mouseover', hoverIgnite));

      /* ---- ambient scene tint: the page itself changes temperature ---- */
      const tint = (bg) => gsap.to('body', { backgroundColor: bg, duration: 1.4, ease: 'power2.inOut', overwrite: 'auto' });
      const zones = [
        ['.story', '#120d10'],      // the brand story burns warm
        ['.filmstrip', '#0b100e'],  // the reel goes cold blue-black
        ['.signup-box', '#110d10'], // the private list turns violet-dark
      ];
      zones.forEach(([sel, bg]) => {
        const el = document.querySelector(sel);
        if (!el) return;
        ScrollTrigger.create({
          trigger: el, start: 'top 55%', end: 'bottom 45%',
          onEnter: () => tint(bg),
          onEnterBack: () => tint(bg),
          onLeave: () => tint('#0a0a0b'),
          onLeaveBack: () => tint('#0a0a0b'),
        });
      });

      /* ---- scroll progress hairline ---- */
      const prog = document.querySelector('.scroll-progress');
      if (prog) {
        gsap.fromTo(prog, { scaleX: 0 }, {
          scaleX: 1, ease: 'none', transformOrigin: 'left center',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
        });
      }

      /* ---- HERO: two-scene cinematic opener ----
         Scene A (the void): 3D logo film resolves from blur, kinetic type
         rises with 3D flips, then the whole type group tilts in 3D space
         following the cursor. Scrolling pins the frame: the lines shear
         apart and a luminous diagonal splice exposes the full-bleed second
         film without shrinking either scene; the copy then rises over it. */
      const hero2 = document.querySelector('.hero-cine2');
      if (hero2) {
        const phone = ctx.conditions.phone;
        gsap.set('.hs-kinetic', { transformPerspective: 800 });
        gsap.set('.hs-title .line', { perspective: 700 });

        gsap.timeline({ defaults: { ease: 'power4.out' } })
          .fromTo('.hs-video',
            { opacity: 0, scale: 1.4, filter: 'blur(16px)' },
            { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 2.1, ease: 'power3.out' }, 0)
          .fromTo('.hs-title .w',
            { yPercent: 122, rotationX: -72 },
            { yPercent: 0, rotationX: 0, duration: 1.35, stagger: 0.14 }, 0.35)
          .fromTo('.hs-script',
            { opacity: 0, y: 20, filter: 'blur(9px)' },
            { opacity: 0.85, y: 0, filter: 'blur(0px)', duration: 0.9 }, 1.15)
          .fromTo('.hs-cue', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.5);

        // DARK's letters flee the cursor — get close and the word breaks
        const darkWord = hero2.querySelector('.hs-title .line:first-child .w');
        if (darkWord && window.matchMedia('(hover: hover)').matches) {
          const darkSplit = new SplitText(darkWord, { type: 'chars' });
          const movers = darkSplit.chars.map((c) => ({
            el: c,
            x: gsap.quickTo(c, 'x', { duration: 0.5, ease: 'power3.out' }),
            y: gsap.quickTo(c, 'y', { duration: 0.5, ease: 'power3.out' }),
          }));
          const onRepel = (e) => {
            movers.forEach((m) => {
              const r = m.el.getBoundingClientRect();
              const dx = e.clientX - (r.left + r.width / 2);
              const dy = e.clientY - (r.top + r.height / 2);
              const dist = Math.hypot(dx, dy);
              const range = 180;
              if (dist < range) {
                const force = (1 - dist / range) * 46;
                m.x((-dx / dist) * force);
                m.y((-dy / dist) * force);
              } else { m.x(0); m.y(0); }
            });
          };
          hero2.addEventListener('mousemove', onRepel);
          cleanups.push(() => hero2.removeEventListener('mousemove', onRepel));
        }

        // cursor-driven 3D: type group and film sit at different depths
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          const krx = gsap.quickTo('.hs-kinetic', 'rotationX', { duration: 0.65, ease: 'power2.out' });
          const kry = gsap.quickTo('.hs-kinetic', 'rotationY', { duration: 0.65, ease: 'power2.out' });
          const vx = gsap.quickTo('.hs-video', 'xPercent', { duration: 1, ease: 'power2.out' });
          const vy = gsap.quickTo('.hs-video', 'yPercent', { duration: 1, ease: 'power2.out' });
          const onMove = (e) => {
            const px = e.clientX / window.innerWidth - 0.5;
            const py = e.clientY / window.innerHeight - 0.5;
            krx(py * -9); kry(px * 11);
            vx(px * -7); vy(py * -5);
          };
          hero2.addEventListener('mousemove', onMove);
          cleanups.push(() => hero2.removeEventListener('mousemove', onMove));
        }

        /* VHS chrome: live timecode + REC pulse while Scene A plays */
        const tc = hero2.querySelector('.vhs-tc');
        if (tc) {
          const t0 = performance.now();
          const tick = () => {
            const el = (performance.now() - t0) / 1000;
            const f = Math.floor((el % 1) * 24);
            const s = Math.floor(el) % 60; const m2 = Math.floor(el / 60) % 60;
            tc.textContent = `TCR 00:${String(m2).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
          };
          gsap.ticker.add(tick);
          cleanups.push(() => gsap.ticker.remove(tick));
        }

        /* THE SPLICE: Scene B is already full-screen beneath the broadcast.
           The luminous cut reveals it without ever exposing an empty stage. */
        const spliceLines = gsap.utils.toArray('.hs-splice-echo, .hs-splice-blade');
        gsap.timeline({
          scrollTrigger: { trigger: '.hero-cine2', start: 'top top', end: phone ? '+=165%' : '+=220%', pin: true, scrub: phone ? 0.4 : 0.75, invalidateOnRefresh: true },
        })
          .to('.hs-title .line:first-child .w', { xPercent: -24, rotationZ: -1.2, ease: 'none', duration: 0.42 }, 0)
          .to('.hs-title .line:last-child .w', { xPercent: 24, rotationZ: 1.2, ease: 'none', duration: 0.42 }, 0)
          .to('.hs-video', { scale: phone ? 1.045 : 1.065, transformOrigin: '50% 18%', ease: 'none', duration: 0.68 }, 0)
          .to('.hs-b', { autoAlpha: 1, ease: 'none', duration: 0.01 }, 0.19)
          .fromTo('.hs-film-b',
            { clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' },
            { clipPath: 'polygon(0 0, 112% 0, 100% 100%, 0 100%)', ease: 'none', duration: 0.49 }, 0.2)
          .fromTo('.hs-film-b video', { scale: 1.02 }, { scale: phone ? 1.045 : 1.075, ease: 'none', duration: 0.94 }, 0.2)
          .fromTo(spliceLines,
            { x: '0vw', autoAlpha: 0 },
            { x: '124vw', autoAlpha: 1, ease: 'none', duration: 0.49, stagger: 0.012 }, 0.2)
          .to(spliceLines, { autoAlpha: 0, ease: 'none', duration: 0.07 }, 0.63)
          .fromTo('.hs-splice-bloom', { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.1 }, 0.33)
          .to('.hs-splice-bloom', { opacity: 0, ease: 'none', duration: 0.18 }, 0.43)
          .to('.hs-a', { autoAlpha: 0, ease: 'none', duration: 0.13 }, 0.56)
          .fromTo('[data-hero-script]', { opacity: 0, y: 34 }, { opacity: 0.9, y: 0, ease: 'none', duration: 0.15 }, 0.55)
          .fromTo('[data-hero-title]', { opacity: 0, y: 56 }, { opacity: 1, y: 0, ease: 'none', duration: 0.18 }, 0.62)
          .fromTo('[data-hero-sub]', { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: 'none', duration: 0.14 }, 0.76)
          .fromTo('[data-hero-ctas]', { opacity: 0, y: 28 }, { opacity: 1, y: 0, ease: 'none', duration: 0.14 }, 0.86)
          .fromTo('[data-hero-meta]', { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.12 }, 0.96)
          .to('.hs-cue', { opacity: 0, ease: 'none', duration: 0.08 }, 0.28);
      }

      /* ---- MANIFESTO MICROSCOPE: enters at 2.6× on the first words,
         scroll zooms the camera out while words ignite ---- */
      const mani = document.querySelector('.mani-line');
      if (mani) {
        const words = new SplitText(mani, { type: 'words' }).words;
        gsap.fromTo(mani, { scale: 2.6, xPercent: 18, yPercent: 12, transformOrigin: 'left top' }, {
          scale: 1, xPercent: 0, yPercent: 0, ease: 'none',
          scrollTrigger: { trigger: '.manifesto', start: 'top 85%', end: 'center 40%', scrub: 0.4 },
        });
        gsap.fromTo(words, { opacity: 0.08, filter: 'blur(2px)' }, {
          opacity: 1, filter: 'blur(0px)', stagger: 0.6, ease: 'none',
          scrollTrigger: { trigger: '.manifesto', start: 'top 78%', end: 'bottom 45%', scrub: true },
        });
      }

      /* ---- ACT I: pinned horizontal drop showcase (desktop) ----
         Vertical scroll drives the track sideways; numerals drift faster
         than panels (depth), product media parallax-slides within frames. */
      const track = document.querySelector('.hdrop-track');
      if (track && window.matchMedia('(min-width: 900px)').matches) {
        const move = () => -(track.scrollWidth - window.innerWidth);
        const scrollTween = gsap.to(track, {
          x: move, ease: 'none',
          scrollTrigger: {
            trigger: '.hdrop', pin: true, scrub: 0.7,
            start: 'top top', end: () => `+=${-move()}`,
            invalidateOnRefresh: true,
          },
        });
        gsap.utils.toArray('[data-hp-num]').forEach((num) => {
          gsap.fromTo(num, { xPercent: 60 }, {
            xPercent: -40, ease: 'none',
            scrollTrigger: { containerAnimation: scrollTween, trigger: num.parentElement, start: 'left right', end: 'right left', scrub: true },
          });
        });
        gsap.utils.toArray('[data-hp-media] img').forEach((img) => {
          gsap.fromTo(img, { xPercent: -12, scale: 1.15 }, {
            xPercent: 12, scale: 1.15, ease: 'none',
            scrollTrigger: { containerAnimation: scrollTween, trigger: img.closest('.hpanel'), start: 'left right', end: 'right left', scrub: true },
          });
        });
        gsap.utils.toArray('[data-hp-info]').forEach((info) => {
          gsap.fromTo(info.children, { opacity: 0, y: 30 }, {
            opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out',
            scrollTrigger: { containerAnimation: scrollTween, trigger: info.closest('.hpanel'), start: 'left 70%', toggleActions: 'play none none reset' },
          });
        });
      }

      /* ---- ticker: GSAP-owned loop that shears AND accelerates with scroll ---- */
      const tickerEl = document.querySelector('.ticker');
      const tickerTrack = document.querySelector('.ticker-track');
      if (tickerEl && tickerTrack) {
        gsap.set(tickerTrack, { animation: 'none' }); // take over from the CSS keyframes
        const loop = gsap.to(tickerTrack, { xPercent: -50, ease: 'none', duration: 30, repeat: -1 });
        // perf: the tape only runs while on screen
        ScrollTrigger.create({
          trigger: tickerEl, start: 'top bottom', end: 'bottom top',
          onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
        });
        // hover: the tape slows to a crawl so it can be read
        const slow = () => gsap.to(loop, { timeScale: 0.12, duration: 0.5 });
        const resume = () => gsap.to(loop, { timeScale: 1, duration: 0.7 });
        tickerEl.addEventListener('mouseenter', slow);
        tickerEl.addEventListener('mouseleave', resume);
        cleanups.push(() => { tickerEl.removeEventListener('mouseenter', slow); tickerEl.removeEventListener('mouseleave', resume); });
        const skewSet = gsap.quickSetter(tickerEl, 'skewX', 'deg');
        const clampV = gsap.utils.clamp(-9, 9);
        const proxy = { s: 0 };
        ScrollTrigger.create({
          onUpdate: (self) => {
            const v = self.getVelocity();
            const s = clampV(v / -350);
            if (Math.abs(s) > Math.abs(proxy.s)) {
              proxy.s = s;
              loop.timeScale(gsap.utils.clamp(1, 4, 1 + Math.abs(v) / 900));
              gsap.to(proxy, {
                s: 0, duration: 0.9, ease: 'power3.out', overwrite: true,
                onUpdate: () => skewSet(proxy.s),
                onComplete: () => gsap.to(loop, { timeScale: 1, duration: 0.6 }),
              });
            }
          },
        });
      }

      /* ---- page titles: any h1 opts in with data-split-title ---- */
      gsap.utils.toArray('[data-split-title]').forEach((h) => {
        const split = new SplitText(h, { type: 'chars,lines', linesClass: 'split-line' });
        gsap.set(h, { perspective: 500 });
        gsap.fromTo(split.chars,
          { yPercent: 120, rotationX: -50, opacity: 0 },
          { yPercent: 0, rotationX: 0, opacity: 1, duration: 0.9, stagger: 0.024, ease: 'power4.out', delay: 0.15 });
      });

      /* ---- prose reveals: any block opts in with data-lines ----
         Lines rise out of masks one by one as they enter view. */
      gsap.utils.toArray('[data-lines]').forEach((block) => {
        const split = new SplitText(block, { type: 'lines', linesClass: 'split-line' });
        const inner = new SplitText(block, { type: 'lines' }); // nested: mask + mover
        gsap.fromTo(inner.lines, { yPercent: 115 }, {
          yPercent: 0, duration: 0.85, stagger: 0.09, ease: 'power4.out',
          scrollTrigger: { trigger: block, start: 'top 88%', once: true },
        });
        void split;
      });

      /* ---- grid velocity skew: cards shear with scroll momentum ---- */
      const skewTargets = gsap.utils.toArray('.grid > *');
      if (skewTargets.length) {
        const skewSetters = skewTargets.map((el) => gsap.quickTo(el, 'skewY', { duration: 0.45, ease: 'power2.out' }));
        const clampSkew = gsap.utils.clamp(-1.5, 1.5);
        ScrollTrigger.create({
          onUpdate: (self) => {
            const s = clampSkew(self.getVelocity() / 1400);
            skewSetters.forEach((set) => set(s));
            gsap.delayedCall(0.15, () => skewSetters.forEach((set) => set(0)));
          },
        });
      }

      /* ---- inline decodes: any element opts in with data-scramble ---- */
      gsap.utils.toArray('[data-scramble]').forEach((el) => {
        ScrollTrigger.create({
          trigger: el, start: 'top 95%', once: true,
          onEnter: () => scramble(el, undefined, { duration: 0.8 }),
        });
      });

      /* ---- section headings: chars flip up out of a mask ---- */
      gsap.utils.toArray('.section-head h2').forEach((h) => {
        const split = new SplitText(h, { type: 'chars,lines', linesClass: 'split-line' });
        gsap.set(h, { perspective: 500 });
        gsap.fromTo(split.chars,
          { yPercent: 125, rotationX: -45, opacity: 0 },
          {
            yPercent: 0, rotationX: 0, opacity: 1, duration: 0.85, stagger: 0.022, ease: 'power4.out',
            scrollTrigger: { trigger: h, start: 'top 88%', once: true },
          });
      });
      /* eyebrows: tracking snaps in from wide + terminal decode on plain-text ones */
      gsap.utils.toArray('.section-head .eyebrow, .page-head .eyebrow').forEach((e) => {
        gsap.fromTo(e, { opacity: 0, letterSpacing: '0.6em' }, {
          opacity: 1, letterSpacing: '0.28em', duration: 0.9, ease: 'power3.out', clearProps: 'letterSpacing',
          scrollTrigger: { trigger: e, start: 'top 92%', once: true },
        });
        if (e.childElementCount === 0) { // ScrambleText would destroy child markup
          ScrollTrigger.create({
            trigger: e, start: 'top 92%', once: true,
            onEnter: () => scramble(e, undefined, { duration: 0.7 }),
          });
        }
      });

      /* ---- product grids: cards vault in (CSS hover transition paused during tween) ---- */
      gsap.utils.toArray('.grid').forEach((grid) => {
        const cards = gsap.utils.toArray(grid.children);
        if (!cards.length) return;
        gsap.set(grid, { perspective: 900 });
        gsap.set(cards, { transition: 'none' });
        gsap.fromTo(cards,
          { opacity: 0, y: 80, rotationX: -12, scale: 0.94, transformOrigin: 'center bottom' },
          {
            opacity: 1, y: 0, rotationX: 0, scale: 1, duration: 0.95, stagger: 0.09, ease: 'power3.out', clearProps: 'all',
            scrollTrigger: { trigger: grid, start: 'top 86%', once: true },
          });
      });

      /* ---- shop: alternating column drift (desktop) ---- */
      if ((pathname === '/shop' || pathname.startsWith('/collection')) && window.matchMedia('(min-width: 900px)').matches) {
        gsap.utils.toArray('.grid.g4 > *').forEach((card, i) => {
          gsap.fromTo(card, { yPercent: i % 2 ? 4 : 0 }, {
            yPercent: i % 2 ? -4 : 0, ease: 'none',
            scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
          });
        });
      }

      /* ---- ghost 00: deep scrubbed drift ---- */
      gsap.utils.toArray('.ghost-00').forEach((el) => {
        gsap.fromTo(el, { xPercent: 22, rotate: 7, opacity: 0 }, {
          xPercent: -12, rotate: -5, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
      });

      /* ---- story media: SHATTER entrance (via effects engine) + parallax ---- */
      gsap.utils.toArray('.story .media img').forEach((img) => {
        gsap.fromTo(img, { yPercent: -6, scale: 1.14 }, {
          yPercent: 6, scale: 1.14, ease: 'none',
          scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
      const story = document.querySelector('.story');
      if (story) {
        gsap.fromTo('.story .script-line',
          { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
          {
            clipPath: 'inset(0 0% 0 0)', duration: 1.5, ease: 'power2.inOut',
            scrollTrigger: { trigger: '.story .script-line', start: 'top 85%', once: true },
          });
        const storyLines = new SplitText(story.querySelectorAll('p'), { type: 'lines' });
        gsap.fromTo(storyLines.lines, { opacity: 0.1 }, {
          opacity: 1, stagger: 0.4, ease: 'none',
          scrollTrigger: { trigger: story, start: 'top 70%', end: 'center 42%', scrub: true },
        });
      }

      /* ---- quality cells + contact info cards: 3D flip up in sequence ---- */
      gsap.utils.toArray('.quality-grid, .info-cards').forEach((grid) => {
        const cells = gsap.utils.toArray(grid.children);
        if (!cells.length) return;
        gsap.set(grid, { perspective: 800 });
        gsap.fromTo(cells,
          { rotationX: -75, opacity: 0, y: 44, transformOrigin: 'center top' },
          {
            rotationX: 0, opacity: 1, y: 0, duration: 0.95, stagger: 0.13, ease: 'power3.out',
            scrollTrigger: { trigger: grid, start: 'top 84%', once: true },
          });
      });

      /* ---- rating average counts up ---- */
      const big = document.querySelector('.rating-summary .big');
      if (big) {
        const val = parseFloat(big.textContent);
        if (!Number.isNaN(val)) {
          const o = { v: 0 };
          gsap.to(o, {
            v: val, duration: 1.5, ease: 'power2.out',
            scrollTrigger: { trigger: big, start: 'top 90%', once: true },
            onUpdate: () => { big.textContent = `${o.v.toFixed(1)}★`; },
          });
        }
      }

      /* ---- proof cells + reviews: batched rise ---- */
      ScrollTrigger.batch('.proof-cell, .review', {
        start: 'top 92%', once: true,
        onEnter: (els) => {
          gsap.set(els, { transition: 'none' });
          gsap.fromTo(els, { opacity: 0, y: 46, scale: 0.94 },
            { opacity: 1, y: 0, scale: 1, duration: 0.75, stagger: 0.07, ease: 'power3.out', overwrite: true, clearProps: 'all' });
        },
      });

      /* ---- countdown cells: pop in ---- */
      const cells = gsap.utils.toArray('.count-cell');
      if (cells.length) {
        gsap.fromTo(cells, { opacity: 0, scale: 0.7, y: 22 }, {
          opacity: 1, scale: 1, y: 0, duration: 0.6, stagger: 0.09, ease: 'back.out(2.2)',
          scrollTrigger: { trigger: cells[0], start: 'top 90%', once: true },
        });
      }

      /* ---- lookbook: alternating directional wipes + settle zoom ---- */
      gsap.utils.toArray('.look').forEach((look, i) => {
        gsap.fromTo(look,
          { clipPath: i % 2 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' },
          {
            clipPath: 'inset(0 0% 0 0%)', duration: 1.1, ease: 'power4.inOut',
            scrollTrigger: { trigger: look, start: 'top 90%', once: true },
          });
        const img = look.querySelector('img');
        if (img) {
          gsap.set(img, { transition: 'none' });
          gsap.fromTo(img, { scale: 1.35 }, {
            scale: 1, duration: 1.5, ease: 'power3.out', clearProps: 'all',
            scrollTrigger: { trigger: look, start: 'top 90%', once: true },
          });
        }
      });

      /* ---- 3D tilt + glare on product cards ---- */
      gsap.utils.toArray('.pcard .media').forEach((media) => {
        const glare = document.createElement('div');
        glare.className = 'tilt-glare';
        media.appendChild(glare);
        const rx = gsap.quickTo(media, 'rotationX', { duration: 0.4, ease: 'power2.out' });
        const ry = gsap.quickTo(media, 'rotationY', { duration: 0.4, ease: 'power2.out' });
        const gx = gsap.quickTo(glare, 'xPercent', { duration: 0.4, ease: 'power2.out' });
        const gy = gsap.quickTo(glare, 'yPercent', { duration: 0.4, ease: 'power2.out' });
        gsap.set(media, { transformPerspective: 700 });

        const onMove = (e) => {
          const r = media.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          rx(-py * 12); ry(px * 14);
          gx(px * 120); gy(py * 120);
          glare.style.opacity = 1;
        };
        const onLeave = () => { rx(0); ry(0); glare.style.opacity = 0; };
        media.addEventListener('mousemove', onMove);
        media.addEventListener('mouseleave', onLeave);
        cleanups.push(() => { media.removeEventListener('mousemove', onMove); media.removeEventListener('mouseleave', onLeave); glare.remove(); });
      });

      /* ---- sticky panels: CSS position:sticky is dead inside
         ScrollSmoother's transform, so [data-sticky-pin] elements are
         pinned with ScrollTrigger for the same follow-along behavior
         (cart summary, policy TOC). Under reduced motion the smoother
         is off and their CSS sticky works natively. ---- */
      gsap.utils.toArray('[data-sticky-pin]').forEach((el) => {
        if (!el.offsetParent) return; // hidden at this breakpoint
        const col = el.parentElement;
        const room = () => Math.max(0, col.offsetHeight - el.offsetHeight);
        if (room() < 40) return; // column barely taller — nothing to follow
        ScrollTrigger.create({
          trigger: el, start: 'top 92', end: () => `+=${room()}`,
          pin: true, pinSpacing: false, invalidateOnRefresh: true,
        });
      });

      /* ---- magnetic pull on EVERY button (stronger on hero CTAs) ---- */
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        new Set([...gsap.utils.toArray('[data-magnetic]'), ...gsap.utils.toArray('main .btn, .site-footer .btn')]).forEach((btn) => {
          const pull = btn.hasAttribute('data-magnetic') ? 0.24 : 0.14;
          /* capped so wide buttons can't slide onto their neighbors */
          const cap = gsap.utils.clamp(-9, 9);
          const bx = gsap.quickTo(btn, 'x', { duration: 0.35, ease: 'power3.out' });
          const by = gsap.quickTo(btn, 'y', { duration: 0.35, ease: 'power3.out' });
          const onMove = (e) => {
            const r = btn.getBoundingClientRect();
            bx(cap((e.clientX - r.left - r.width / 2) * pull));
            by(cap((e.clientY - r.top - r.height / 2) * pull));
          };
          const onLeave = () => { bx(0); by(0); };
          btn.addEventListener('mousemove', onMove);
          btn.addEventListener('mouseleave', onLeave);
          cleanups.push(() => { btn.removeEventListener('mousemove', onMove); btn.removeEventListener('mouseleave', onLeave); });
        });
      }

      /* ---- signup box: red spotlight tracks the cursor ---- */
      const box = document.querySelector('.signup-box');
      if (box) {
        const sx = gsap.quickSetter(box, '--mx', 'px');
        const sy = gsap.quickSetter(box, '--my', 'px');
        const onMove = (e) => {
          const r = box.getBoundingClientRect();
          sx(e.clientX - r.left); sy(e.clientY - r.top);
        };
        box.addEventListener('mousemove', onMove);
        cleanups.push(() => box.removeEventListener('mousemove', onMove));
      }

      /* ---- serpent mark: iris reveal + glow bloom (About page-head) ---- */
      gsap.utils.toArray('[data-serpent]').forEach((mark) => {
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .fromTo(mark,
            { clipPath: 'circle(0% at 50% 50%)', scale: 0.7, rotation: -20 },
            { clipPath: 'circle(75% at 50% 50%)', scale: 1, rotation: 0, duration: 1.2 }, 0.2)
          .fromTo(mark, { filter: 'drop-shadow(0 0 0 rgba(232,226,212,0))' },
            { filter: 'drop-shadow(0 0 26px rgba(232,226,212,0.45))', duration: 0.7, yoyo: true, repeat: 1, ease: 'power2.inOut' }, 0.9);
      });

      /* ---- 404 glitch: the numeral re-scrambles forever ---- */
      const glitch = document.querySelector('[data-glitch]');
      if (glitch) {
        const original = glitch.textContent;
        const cycle = () => scramble(glitch, original, {
          duration: 0.6,
          onComplete: () => { gsap.delayedCall(2.6, cycle); },
        });
        gsap.delayedCall(1.2, cycle);
      }

      /* ---- accordions (FAQ + PDP): answers unfold instead of snapping ---- */
      gsap.utils.toArray('details').forEach((det) => {
        const body = det.querySelector('.a');
        if (!body) return;
        const onToggle = () => {
          if (det.open) {
            gsap.fromTo(body, { height: 0, opacity: 0, y: -8, overflow: 'hidden' },
              { height: 'auto', opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' });
          }
        };
        det.addEventListener('toggle', onToggle);
        cleanups.push(() => det.removeEventListener('toggle', onToggle));
      });

      /* ---- HOVER PLAYGROUND: delegated custom hover animations ----
         One listener runs the whole site: heading chars ripple in a wave,
         card titles decode, opted-in CTAs scramble, prices pulse. */
      const hoverFx = (e) => {
        // section headings: character wave (uses the spans SplitText left behind)
        const h = e.target.closest('.section-head h2');
        if (h && !h.dataset.waving) {
          const chars = h.querySelectorAll('.split-line > div');
          if (chars.length) {
            h.dataset.waving = '1';
            // a serpentine ripple travels through the word — a wave, not a bob:
            // each char lifts, dips, and tilts as the crest passes over it
            gsap.to(chars, {
              keyframes: [
                { y: -7, rotationZ: -3, duration: 0.34, ease: 'sine.out' },
                { y: 3, rotationZ: 2, duration: 0.3, ease: 'sine.inOut' },
                { y: 0, rotationZ: 0, duration: 0.3, ease: 'sine.in' },
              ],
              stagger: { each: 0.035, from: 'start' },
              onComplete: () => { delete h.dataset.waving; },
            });
          }
        }
        // product cards: the title decodes itself
        const card = e.target.closest('.pcard');
        if (card && !card.dataset.decoding) {
          const link = card.querySelector('h3 a');
          if (link) {
            card.dataset.decoding = '1';
            // slower, smoother decode — reads as a name resolving, not a glitch
            const t = scramble(link, undefined, { duration: 0.7, onComplete: () => { delete card.dataset.decoding; } });
            if (!t) delete card.dataset.decoding;
          }
        }
        // opted-in CTAs: label scrambles to itself
        const cta = e.target.closest('[data-scramble-hover]');
        if (cta && !cta.dataset.s) {
          cta.dataset.s = '1';
          const t = scramble(cta, undefined, { duration: 0.5, onComplete: () => { delete cta.dataset.s; } });
          if (!t) delete cta.dataset.s;
        }
        // display titles: a single soft chromatic AURA blooms off the word and
        // dissolves — an echo of light, not a stamped copy (was corny before)
        const multi = e.target.closest('.page-head h1, .hp-title, .mani-line');
        if (multi && !multi.dataset.multi) {
          multi.dataset.multi = '1';
          const g = multi.cloneNode(true);
          g.setAttribute('aria-hidden', 'true');
          g.querySelectorAll('[data-fx]').forEach((x) => x.removeAttribute('data-fx'));
          Object.assign(g.style, {
            position: 'absolute', inset: 0, pointerEvents: 'none', margin: 0,
            color: 'var(--red)', mixBlendMode: 'screen',
          });
          multi.style.position = 'relative';
          multi.appendChild(g);
          gsap.fromTo(g,
            { opacity: 0.28, scale: 1, filter: 'blur(0px)', transformOrigin: 'center' },
            { opacity: 0, scale: 1.05, filter: 'blur(5px)', duration: 1.1, ease: 'power2.out', onComplete: () => g.remove() });
          setTimeout(() => { delete multi.dataset.multi; }, 1200);
        }
        // buttons: VENOM FILL — mint liquid floods from the side you entered
        const vbtn = e.target.closest('.btn');
        if (vbtn && !vbtn.querySelector('.venom-fill')) {
          const fill = document.createElement('span');
          fill.className = 'venom-fill';
          vbtn.appendChild(fill);
        }
        if (vbtn) {
          const fill = vbtn.querySelector('.venom-fill');
          const r = vbtn.getBoundingClientRect();
          const fromLeft = (e.clientX - r.left) < r.width / 2;
          gsap.fromTo(fill,
            { xPercent: fromLeft ? -103 : 103, skewX: fromLeft ? -10 : 10 },
            { xPercent: 0, skewX: 0, duration: 0.75, ease: 'power4.out', overwrite: true });
          const onLeave = () => {
            gsap.to(fill, { xPercent: fromLeft ? 103 : -103, skewX: fromLeft ? 10 : -10, duration: 0.6, ease: 'power2.inOut', overwrite: true });
            vbtn.removeEventListener('mouseleave', onLeave);
          };
          vbtn.addEventListener('mouseleave', onLeave);
        }
        // photos: a slow specular light glides diagonally across the image and
        // the colour blooms — editorial light passing over it, not a camera pop
        const shot = e.target.closest('.look, .fs-card');
        if (shot && !shot.dataset.sheen) {
          shot.dataset.sheen = '1';
          const media = shot.querySelector('img, video');
          const sweep = document.createElement('span');
          sweep.className = 'hover-sheen';
          shot.appendChild(sweep);
          const tl = gsap.timeline({ onComplete: () => sweep.remove() });
          tl.fromTo(sweep, { xPercent: -150, opacity: 0 },
            { xPercent: 150, opacity: 1, duration: 0.95, ease: 'power2.inOut' })
            .to(sweep, { opacity: 0, duration: 0.28 }, '-=0.28');
          if (media) {
            tl.fromTo(media, { filter: 'saturate(1) brightness(1)' },
              { filter: 'saturate(1.16) brightness(1.05)', duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut', clearProps: 'filter' }, 0.1);
          }
          setTimeout(() => { delete shot.dataset.sheen; }, 1200);
        }
      };
      document.addEventListener('mouseover', hoverFx);
      cleanups.push(() => document.removeEventListener('mouseover', hoverFx));

      /* ---- lookbook: the photo leans away from the cursor inside its frame ---- */
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        gsap.utils.toArray('.look').forEach((look) => {
          const img = look.querySelector('img');
          if (!img) return;
          gsap.set(img, { scale: 1.12 }); // headroom so the lean never shows edges
          const lx = gsap.quickTo(img, 'x', { duration: 0.6, ease: 'power2.out' });
          const ly = gsap.quickTo(img, 'y', { duration: 0.6, ease: 'power2.out' });
          const onMove = (ev) => {
            const r = look.getBoundingClientRect();
            lx(((ev.clientX - r.left) / r.width - 0.5) * -18);
            ly(((ev.clientY - r.top) / r.height - 0.5) * -14);
          };
          const onLeave = () => { lx(0); ly(0); };
          look.addEventListener('mousemove', onMove);
          look.addEventListener('mouseleave', onLeave);
          cleanups.push(() => { look.removeEventListener('mousemove', onMove); look.removeEventListener('mouseleave', onLeave); });
        });
      }

      /* ---- hero title: idle breath after the intro settles ---- */
      gsap.utils.toArray('.hs-title .w').forEach((w, i) => {
        gsap.to(w, { y: i % 2 ? 5 : -5, duration: 3.2 + i, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 2.2 });
      });

      /* ---- fixed chrome: announcement + header leave and return together ---- */
      const siteTop = document.querySelector('.site-top');
      if (siteTop) {
        const disableChrome = () => {
          siteTop.inert = true;
          siteTop.style.pointerEvents = 'none';
        };
        const enableChrome = () => {
          siteTop.inert = false;
          siteTop.style.removeProperty('pointer-events');
        };
        const hide = gsap.to(siteTop, {
          yPercent: -102,
          duration: 0.55,
          ease: 'power2.inOut',
          paused: true,
          onStart: disableChrome,
          onReverseComplete: enableChrome,
        });
        ScrollTrigger.create({
          start: 'top top', end: 'max',
          onUpdate: (self) => {
            /* only a deliberate downward scroll tucks it away — slow
               drifting reads shouldn't lose the nav */
            if (self.direction === 1 && self.scroll() > 480 && self.getVelocity() > 140) hide.play();
            else if (self.direction === -1 || self.scroll() <= 480) hide.reverse();
          },
        });
        cleanups.push(enableChrome);
      }

      /* ---- CAMERA LANGUAGE: every section dollies in through its window ---- */
      gsap.utils.toArray('main .section').forEach((sec) => {
        gsap.fromTo(sec, { scale: 0.972, transformOrigin: 'center center' }, {
          scale: 1, ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top 95%', end: 'top 35%', scrub: 0.8 },
        });
      });
      /* letterbox bars breathe in during the pinned scenes */
      const lbox = gsap.utils.toArray('.lbox-bar');
      if (lbox.length) {
        ['.hero-cine2', '.hdrop'].forEach((sel) => {
          const el = document.querySelector(sel);
          if (!el) return;
          ScrollTrigger.create({
            trigger: el, start: 'top 8%', end: 'bottom 60%',
            onToggle: (self) => gsap.to(lbox, {
              yPercent: self.isActive ? 0 : (i) => (i === 0 ? -101 : 101),
              duration: 0.6, ease: 'power3.inOut', overwrite: 'auto',
            }),
          });
        });
      }

      /* ---- FOOTER TUNNEL + CREDITS ROLL ----
         The wordmark gains depth layers that spread apart as you arrive;
         the first arrival each session rolls the links like end credits. */
      const fm = document.querySelector('.fm-track');
      if (fm) {
        if (!fm.dataset.tunnel) {
          fm.dataset.tunnel = '1';
          [0.5, 0.25].forEach((o, i) => {
            const layer = fm.cloneNode(true);
            layer.classList.add('fm-layer');
            layer.style.opacity = o;
            layer.setAttribute('aria-hidden', 'true');
            fm.parentElement.appendChild(layer);
            gsap.fromTo(layer, { scale: 1, yPercent: 0 }, {
              scale: 1 + (i + 1) * 0.35, yPercent: (i + 1) * -16, opacity: 0.06, ease: 'none',
              scrollTrigger: { trigger: '.foot-marquee', start: 'top bottom', end: 'bottom top', scrub: 1 },
            });
          });
        }
        gsap.fromTo(fm, { xPercent: 2 }, {
          xPercent: -28, ease: 'none',
          scrollTrigger: { trigger: '.foot-marquee', start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
        if (!sessionStorage.getItem('dd_credits')) {
          ScrollTrigger.create({
            trigger: '.site-footer', start: 'top 85%', once: true,
            onEnter: () => {
              sessionStorage.setItem('dd_credits', '1');
              gsap.fromTo('.foot-grid a, .foot-grid h4',
                { opacity: 0, y: 34 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.045, ease: 'power2.out', clearProps: 'all' });
            },
          });
        }
      }
      const foot = document.querySelector('.site-footer');
      if (foot) {
        gsap.fromTo('.foot-grid > div', { opacity: 0, y: 34 }, {
          opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', clearProps: 'all',
          scrollTrigger: { trigger: '.foot-grid', start: 'top 94%', once: true },
        });
        /* footer chips only — the cart/checkout badge rows must be visible
           immediately, not held hostage by the footer's scroll trigger */
        gsap.fromTo('.site-footer .pay-icons .pay', { opacity: 0, y: 10 }, {
          opacity: 1, y: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out', clearProps: 'all',
          scrollTrigger: { trigger: '.trust-row', start: 'top 96%', once: true },
        });
      }

      /* ---- PDP: gallery unveils, buy column cascades ---- */
      const pdp = document.querySelector('.pdp');
      if (pdp) {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.fromTo('.pdp .gallery .main',
          { clipPath: 'inset(0 0 100% 0)' },
          { clipPath: 'inset(0% 0 0% 0)', duration: 1, ease: 'power4.inOut' }, 0)
          .fromTo('.pdp .gallery .main img', { scale: 1.2 }, { scale: 1, duration: 1.7, ease: 'power2.out' }, 0)
          .fromTo('.pdp .thumbs button', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06 }, 0.4)
          .fromTo('.pdp .buy > *', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, clearProps: 'all' }, 0.25);
      }

      // late layout shifts (images/fonts) move trigger positions
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('load', refresh);
      const t = setTimeout(refresh, 800);
      return () => {
        window.removeEventListener('load', refresh);
        clearTimeout(t);
        cleanups.forEach((fn) => fn());
      };
    });

    return () => mm.revert();
  }, { dependencies: [pathname, ready, motionPaused] });
}
