/* Honest size recommender.
   Maps a shopper's height + weight to a SUGGESTED size — clearly framed as
   a recommendation, never a guarantee. Uses standard unisex streetwear bands,
   nudged for very tall builds (length), and snaps to the sizes the product
   actually offers. The house rule (size up when between / for oversized) is
   surfaced with every result so nobody is misled into a too-small fit. */

const ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL'];

/* weight (lb) → base size index — the primary driver for a relaxed fit */
function weightIndex(lb) {
  if (lb < 120) return 0; // XS
  if (lb < 145) return 1; // S
  if (lb < 175) return 2; // M
  if (lb < 205) return 3; // L
  if (lb < 235) return 4; // XL
  return 5;               // 2XL
}

/** The sizes THIS product sells, in order — else null (use full range). */
export function productSizes(p) {
  if (!p) return null;
  const names = p.optionNames || [];
  const idx = names.findIndex((n) => /size/i.test(String(n)));
  let vals = idx === 1 ? p.options2 : idx === 0 ? p.options1 : null;
  if (!vals) {
    // single-option products often just list sizes as option1
    const o1 = p.options1 || [];
    if (o1.some((v) => /^(xs|s|m|l|xl|2xl|xxl|3xl)$/i.test(String(v).trim()))) vals = o1;
  }
  if (!vals || !vals.length) return null;
  return vals.map((v) => String(v).trim().toUpperCase());
}

const normalize = (s) => String(s).trim().toUpperCase().replace('XXL', '2XL');

/** Snap a target size to the nearest size the product actually offers. */
function snap(target, sizes) {
  if (!sizes || !sizes.length) return target;
  const norm = sizes.map(normalize);
  if (norm.includes(target)) return sizes[norm.indexOf(target)];
  const ti = ORDER.indexOf(target);
  // nearest by index distance
  let best = 0, bestDist = Infinity;
  norm.forEach((s, i) => {
    const d = Math.abs(ORDER.indexOf(s) - ti);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return sizes[best];
}

/**
 * @param {number} heightIn  height in inches
 * @param {number} weightLb  weight in pounds
 * @param {object} opts       { p } — the product (for its real size set + fit)
 * @returns {{ size, tall, notes: string[] } | { error }}
 */
export function recommendSize(heightIn, weightLb, opts = {}) {
  const h = Number(heightIn), w = Number(weightLb);
  if (!h || !w || h < 48 || h > 84 || w < 70 || w > 400) {
    return { error: 'Enter a realistic height and weight and we’ll suggest a size.' };
  }
  let idx = weightIndex(w);
  // Tall builds need length. Only size UP when the weight is light for the
  // height (weight under-represents them) — a full bump on an already-heavier
  // build over-sizes. For heavier tall builds we keep the weight-based size
  // and just note they can size up if they want extra length.
  const tall = h >= 75;
  let bumped = false;
  if (tall && idx <= 2) { idx = Math.min(idx + 1, ORDER.length - 1); bumped = true; }

  const target = ORDER[idx];
  const sizes = productSizes(opts.p);
  const size = snap(target, sizes);

  const notes = [];
  if (bumped) notes.push('You’re on the taller side, so we sized up for length.');
  else if (tall) notes.push('You’re tall — size up if you want extra length in the body.');
  const fit = String(opts.p?.fit || '');
  if (/size up/i.test(fit)) notes.push('This piece is cut to size up for an oversized look — go one up if you want it draped.');
  else if (/size down/i.test(fit)) notes.push('This piece runs relaxed — size down for a trimmer fit.');
  else notes.push('Between sizes, or want it oversized? Size up.');

  return { size, tall, notes };
}
