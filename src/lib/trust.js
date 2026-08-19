/* Trust-content helpers — the ONE place display claims are derived.
   Rule: every customer-facing claim must trace to CONFIG (admin-editable,
   verified by the owner) or to environment facts (PayPal key present).
   Components never hardcode "30-day returns" / payment logos again. */

/** Payment methods to show. Base list is admin-verified against the Stripe
    dashboard; PayPal appends itself ONLY when the PayPal button can render. */
export function payMethodList(CONFIG) {
  const base = String(CONFIG.payMethods || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (import.meta.env.VITE_PAYPAL_CLIENT_ID && !base.includes('PayPal')) base.push('PayPal');
  return base;
}

/** "30-day returns" — window always follows the published policy number. */
export function returnsClaim(CONFIG) {
  return `${CONFIG.returnsDays ?? 30}-day returns`;
}

/** "Ships in 2 business days" — matches the shipping policy's processing time. */
export function shipsClaim(CONFIG) {
  const d = CONFIG.processingDays ?? 2;
  return `Ships in ${d} business day${d === 1 ? '' : 's'}`;
}

/** Longer form used near add-to-cart and in the cart summary. */
export function shippingSummary(CONFIG) {
  const d = CONFIG.processingDays ?? 2;
  return `Ships from the US within ${d} business day${d === 1 ? '' : 's'} — free over $${CONFIG.freeShipThreshold}`;
}

export function returnsSummary(CONFIG) {
  return `${CONFIG.returnsDays ?? 30}-day returns on unworn items with tags`;
}

/** Who pays return shipping — the honest truth, admin-controlled.
    Defects/wrong items are ALWAYS on us; this covers normal returns. */
export function returnShippingText(CONFIG) {
  return CONFIG.freeReturns
    ? 'Return shipping is on us.'
    : 'You cover return shipping on a change-of-mind return; anything defective or wrong is on us.';
}

/** Free-shipping progress only exists when a real threshold is configured. */
export function freeShipActive(CONFIG) {
  return Number(CONFIG.freeShipThreshold) > 0;
}

/** Buyer-confidence points shown at the decision moment (PDP + cart).
    EVERY line is a real promise from the published policies — no invented
    guarantee, no fake count. Keyed by icon name the component maps to an SVG. */
export function guaranteePoints(CONFIG) {
  const d = CONFIG.processingDays ?? 2;
  const rd = CONFIG.returnsDays ?? 30;
  const returnsText = CONFIG.freeReturns
    ? `Return unworn items within ${rd} days for a full refund with free return shipping. No restocking fee, no store credit games.`
    : `Return unworn items within ${rd} days for a full refund. No restocking fee, no store credit games.`;
  return [
    { icon: 'lock', title: 'Secure checkout', text: 'Payments run through Stripe — we never see or store your card number.' },
    { icon: 'swap', title: `${rd}-day returns`, text: returnsText },
    { icon: 'truck', title: 'Ships from the US', text: `Packed by hand and shipped within ${d} business day${d === 1 ? '' : 's'}, with tracking emailed the moment it leaves.` },
    { icon: 'shield', title: 'Covered if it goes wrong', text: 'Defective or wrong item? We cover the return label and ship the fix first. Lost in transit? We file the carrier claim.' },
  ];
}

/** One-line reassurance for directly under the Add-to-Cart button. */
export function buyReassurance(CONFIG) {
  return `Secure Stripe checkout · ${CONFIG.returnsDays ?? 30}-day returns, full refund · ships from the US with tracking`;
}

/** Reassurance for the payment step — nobody is charged until they confirm. */
export function chargeReassurance() {
  return 'You are not charged until you confirm on Stripe’s secure page — your card details never touch our servers.';
}
