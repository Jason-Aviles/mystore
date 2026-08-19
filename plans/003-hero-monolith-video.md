# Plan 003: Rebuild hero Scene B as the "Monolith" — 3D floating video slab that flies into full-bleed

> **Executor instructions**: Follow step by step; verify each step. On any
> STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: No git repo. Compare every "Current state"
> excerpt against the live file before starting; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the pinned hero timeline — the most choreographed code in the repo)
- **Depends on**: none (independent of 001/002)
- **Category**: direction + bug (owner reports the video "not in place" during scroll)
- **Planned at**: no git repo — 2026-07-10

## Why this matters

The owner reports the Scene B film sits mispositioned while scrolling through
the pinned hero, and wants the moment to feel 3D-cinematic rather than a flat
video that merely scales. This plan replaces the flat treatment with a
"monolith": after the slat tear, the film is a floating, perspective-tilted
slab hovering in the void with a floor reflection — and as scrolling
continues it rotates flat and flies forward to swallow the viewport,
becoming the full-bleed hero. One move fixes the positioning bug (the
mis-scaling tween is deleted) and delivers the 3D signature.

## Current state

- `src/pages/Home.jsx` (~lines 44–91) — hero markup: `.hero-cine2` contains
  `.hs-a` (broadcast + VHS chrome), `.hs-slats` (5 spans), `.hs-burn`, and
  Scene B:
  ```jsx
  <div className="hs-b hero">
    <div className="hero-media">
      <video src="/content/hero-film.mp4" poster="/content/hero-film-poster.jpg"
        autoPlay muted loop playsInline preload="auto" ... />
    </div>
    <div className="wrap hero-inner"> ... copy, CTAs ... </div>
  </div>
  ```
- `src/hooks/usePageMotion.js` — the tear timeline (inside the
  `if (heroTitle)` block; search `THE TEAR`). Relevant lines:
  ```js
  .fromTo(slats, { yPercent: 103 }, { yPercent: 0, ... }, 0.24)
  ...
  .set('.hs-a', { autoAlpha: 0 }, 0.42)
  .set('.hs-b', { autoAlpha: 1 }, 0.42)
  .to(slats, { yPercent: -103, ... }, 0.44)
  .fromTo('.hs-b .hero-media img, .hs-b .hero-media video', { scale: 1.32 }, { scale: 1, ease: 'none', duration: 0.62 }, 0.28)
  ```
  **That last `scale: 1.32→1` tween on the raw video is the positioning bug**:
  it runs from t=0.28 (before Scene B is even visible at 0.42) and fights
  `object-position`, so mid-scroll the frame drifts. It must be REPLACED by
  the monolith choreography, not kept alongside it.
- `src/styles/global.css` — `.hs-b { z-index: 2; opacity: 0; visibility:
  hidden; ... }` (search `.hs-b {`); `.hs-b .hero-media img, .hs-b
  .hero-media video { object-fit: cover; object-position: center 28%;
  filter: saturate(0.85); }`. Reduced-motion block hides `.hs-a/.hs-slats/
  .hs-burn` and makes `.hs-b` static — DO NOT break that block.
- Conventions: pinned scrub timelines use `ease: 'none'` per tween; entrance
  eases use the `dd` CustomEase default; all hero motion lives in the
  motionOK tier of `usePageMotion.js`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build | `npx vite build` | exit 0 |
| DOM gate | headless Chrome dump-dom on `http://localhost:4180/` grep `hs-monolith` | ≥1 match (preview server on 4180; if down: `npx vite preview --port 4180 &`) |

## Scope

**In scope**: `src/pages/Home.jsx` (Scene B markup only),
`src/hooks/usePageMotion.js` (tear timeline segment only),
`src/styles/global.css` (append monolith styles; edit `.hs-b` display rules),
`plans/README.md`.

**Out of scope**: `.hs-a` broadcast scene, VHS chrome, DARK/DIVINE kinetic
type, slat/burn mechanics (they stay); `hero-film.mp4` re-encoding; the
reduced-motion fallback semantics (poster-only must keep working); Scene B's
copy/CTA content.

## Git workflow

No git repo — edit in place.

## Steps

### Step 1: Restructure Scene B markup in `Home.jsx`

Wrap the media in a perspective stage; copy stays a sibling so it can rise
independently:

```jsx
<div className="hs-b hero">
  <div className="hs-stage" aria-hidden="true">
    <div className="hs-monolith">
      <video ...same attributes... />
      <span className="hs-mono-glow" />
    </div>
    <span className="hs-floor" />
  </div>
  <div className="wrap hero-inner"> ...unchanged... </div>
</div>
```

**Verify**: `npx vite build` exit 0.

### Step 2: Monolith CSS (append to `global.css`)

- `.hs-stage`: absolute inset 0, `perspective: 1100px`, overflow hidden,
  z-index −1 relative to `.hero-inner`.
- `.hs-monolith`: centered plane, width `min(72vw, 1100px)`, aspect 16/9,
  `transform-style: preserve-3d`, border 1px `var(--line-strong)`,
  overflow hidden; video fills it (`object-fit: cover`, keep the existing
  saturate(0.85) grade).
- `.hs-mono-glow`: absolute inset −40px, pink radial glow
  (rgba(239,182,196,0.14)), blur 30px, behind the plane.
- `.hs-floor`: reflection — a mirrored gradient strip under the plane
  (pseudo-real: `background: linear-gradient(180deg, rgba(242,241,238,0.06),
  transparent)`, height 22vh, transform `scaleY(-1)`, masked fade). No
  `-webkit-box-reflect` (Firefox).
- Reduced-motion block: add `.hs-stage { position: relative; perspective:
  none; }` and `.hs-monolith { width: 100%; }` so the poster still shows
  full-width statically.

**Verify**: build exit 0.

### Step 3: Replace the buggy tween with monolith choreography in `usePageMotion.js`

Delete the `scale: 1.32→1` video tween cited in Current state. In its place,
extend the same pinned timeline (all `ease: 'none'`, scrubbed):

```js
// Scene B: the monolith — floats in tilted, then flies forward to swallow the frame
.fromTo('.hs-monolith',
  { rotationX: 16, rotationY: -9, scale: 0.52, y: '12vh', autoAlpha: 0 },
  { rotationX: 10, rotationY: -5, scale: 0.62, y: '6vh', autoAlpha: 1, duration: 0.1 }, 0.42)
.to('.hs-monolith', { rotationX: 6, rotationY: -2, scale: 0.78, y: '2vh', duration: 0.12 }, 0.52)
.to('.hs-monolith', { rotationX: 0, rotationY: 0, scale: 1, y: 0, width: '100vw', height: '100vh', duration: 0.16 }, 0.64)
.to('.hs-floor, .hs-mono-glow', { autoAlpha: 0, duration: 0.06 }, 0.66)
```

Notes for correctness:
- Animating width/height on the monolith is acceptable here (single element,
  pinned scene, no layout siblings) — but prefer `scale` to full-cover if
  simpler: compute cover scale as
  `Math.max(innerWidth / monoWidth, innerHeight / monoHeight)` at refresh
  and tween scale to that value with `invalidateOnRefresh: true` on the
  ScrollTrigger. Either approach passes; pick ONE.
- Keep the existing copy tweens (`[data-hero-script]` etc. at 0.6–0.88)
  exactly as they are — they should now rise over the full-bleed monolith.
- The `.hs-b` `autoAlpha` set at 0.42 stays (the stage lives inside it).

**Verify**: build exit 0; then serve and dump-dom → `hs-monolith` present;
manually scroll `localhost:5173` — the film should enter as a floating
tilted slab ~when the slats clear, straighten, and grow to fill the screen
with zero horizontal drift at any scroll position (the reported bug).

## Test plan

Manual: full-tier scroll through the hero five times at different speeds —
no frame drift, no flash of unstyle at the 0.42 handoff, copy legible over
the full-bleed end state. Reduced-motion emulation (DevTools → Rendering):
Scene B renders static poster full-width, no monolith transforms. Mobile
390px: pin still releases cleanly; monolith width falls back to ~92vw
(add a `@media (max-width: 700px)` width override).

## Done criteria

- [ ] `npx vite build` exit 0
- [ ] Old `scale: 1.32` video tween no longer exists
      (`grep -n "1.32" src/hooks/usePageMotion.js` → no hero match)
- [ ] `hs-monolith`, `hs-floor`, `hs-mono-glow` present in served DOM
- [ ] Reduced-motion: `.hs-b` static poster unaffected
- [ ] No out-of-scope edits; README row updated

## STOP conditions

- The tear timeline in `usePageMotion.js` doesn't match the excerpt.
- Fixing cover-scale requires touching the slat/burn tweens' timings —
  report; their beat positions (0.24–0.44) are locked choreography.
- The pin's `end: '+=230%'` proves too short for the added beats — report
  with a recommended new value rather than silently changing scene pacing.

## Maintenance notes

- If the hero film is ever swapped (admin/future), the monolith is
  aspect-16/9-locked — new sources should match or the CSS aspect updated.
- Reviewer: check the 0.42→0.66 window on a 4K screen (cover-scale math) and
  that ScrollTrigger `invalidateOnRefresh` recomputes on resize.
