/* Logo placement — which mark shows where, and how big.
   One rule from the design review: ONE mark per spot, never the emblem
   and the wordmark side by side. Admin → Site Settings → Logos edits
   CONFIG.brand; anything missing falls back to these defaults, and every
   size is clamped so a typo can't break a phone layout. */

export const BRAND_PLACEMENTS = [
  // key, label, default, size unit, min, max, help
  ['header', 'Header', { show: true, mark: 'emblem', size: 34 }, 'px tall', 22, 60, 'The mark in the top bar on every page.'],
  ['hero', 'Homepage hero', { show: true, mark: 'wordmark', size: 94 }, '% of screen width', 40, 100, 'The giant brand moment over the opening film.'],
  ['preloader', 'Intro screen', { show: true, mark: 'wordmark', size: 640 }, 'px wide', 200, 900, 'Shown once per visit while the site loads.'],
  ['gate', 'Access gate', { show: true, mark: 'wordmark', size: 460 }, 'px wide', 160, 640, 'Top of the password / preorder gate.'],
  ['dropPage', 'Drop page header', { show: false, mark: 'emblem', size: 140 }, 'px wide', 80, 420, 'Over the Drop page hero picture.'],
  ['footer', 'Footer', { show: true, mark: 'wordmark', size: 300 }, 'px wide', 120, 480, 'Above the footer newsletter.'],
];

export const BRAND_DEFAULTS = Object.fromEntries(BRAND_PLACEMENTS.map(([k, , d]) => [k, d]));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Merged + clamped settings for one placement. */
export function brandFor(brand, key) {
  const spec = BRAND_PLACEMENTS.find(([k]) => k === key);
  if (!spec) return { show: false };
  const [, , def, , min, max] = spec;
  const cur = { ...def, ...((brand || {})[key] || {}) };
  return {
    show: cur.show !== false,
    mark: cur.mark === 'emblem' ? 'emblem' : 'wordmark',
    size: clamp(Number(cur.size) || def.size, min, max),
  };
}
