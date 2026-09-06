import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { Lock, Serpent } from '../components/Icons';
import { saveEmailSignup } from '../lib/marketing';
import { hasSupabase, supabase } from '../lib/supabase';
import { Flip, rollNumber, reducedMotion } from '../lib/motion';
import { variantQty } from '../lib/catalog';
import { payMethodList, returnsClaim, shipsClaim, freeShipActive, guaranteePoints, chargeReassurance } from '../lib/trust';
import { saveOrderRef, shipWindowText, depositTerms, lineDueNow, lineBalanceLater } from '../lib/preorder';
import PayPalButtons from '../components/PayPalButtons';
import { metaTrack } from '../lib/meta';
import reviewSeed from '../data/imported-reviews.json';

/* best real review for anything currently in the cart — shown at the
   moment of decision, verbatim from the Judge.me export */
function cartReview(lines) {
  const handles = new Set(lines.map((l) => l.handle));
  return reviewSeed
    .filter((r) => handles.has(r.product_handle) && r.stars === 5 && r.body.length > 40 && r.body.length < 160)
    .sort((a, b) => b.body.length - a.body.length)[0] || null;
}

/* Full cart page + checkout hand-off.
   The create-checkout Edge Function owns the pending order AND the prices —
   the browser only sends handles + sizes + quantities, the server answers
   with real prices, real stock, and one Stripe Checkout session (card,
   Apple Pay, Link, Cash App, Klarna — whatever the dashboard enables).
   If stock changed while the cart sat, the server names the exact lines
   and this page offers a one-click fix. The cart is never cleared by an
   error — only by a completed purchase. */
export default function CartPage() {
  const { cart, byHandle, money, setQty, removeLine, cartTotal, CONFIG, reloadProducts, showToast, campaign, isPreorder } = useStore();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false); // marketing consent — never pre-checked
  const [country, setCountry] = useState('US'); // published rates exist for US + Canada only
  const [step, setStep] = useState('cart'); // cart | pay
  const [orderId, setOrderId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [shortLines, setShortLines] = useState(null); // server-reported stock problems
  const [showLinks, setShowLinks] = useState(false);

  const lines = cart.map((l) => ({ ...l, p: byHandle(l.handle) })).filter((l) => l.p);
  // deposit-aware totals: what Stripe actually charges now vs. the balance
  // invoiced later. When any line is a deposit preorder, "due today" differs
  // from the order value — the cart must show the number that gets charged.
  const depositLines = lines.filter((l) => depositTerms(l.p, campaign));
  const dueToday = lines.reduce((s, l) => s + lineDueNow(l.p, l.qty, campaign), 0);
  const balanceLater = lines.reduce((s, l) => s + lineBalanceLater(l.p, l.qty, campaign), 0);
  const listRef = useRef(null);
  const totalRef = useRef(null);
  const flipRef = useRef(null);

  /* capture row positions before a removal so survivors glide up */
  function withFlip(mutate) {
    if (!reducedMotion() && listRef.current) {
      flipRef.current = Flip.getState(listRef.current.querySelectorAll('.cart-item'));
    }
    mutate();
  }
  useGSAP(() => {
    if (!flipRef.current || !listRef.current) return;
    Flip.from(flipRef.current, {
      targets: listRef.current.querySelectorAll('.cart-item'),
      duration: 0.5, ease: 'power3.inOut', absolute: true,
    });
    flipRef.current = null;
  }, { scope: listRef, dependencies: [cart.length] });

  /* the subtotal rolls instead of snapping */
  useEffect(() => {
    if (totalRef.current) rollNumber(totalRef.current, cartTotal, { format: (v) => money(v) });
  }, [cartTotal, money]);

  /* pay button sheen sweeps by itself every few seconds */
  useGSAP(() => {
    const sheen = document.querySelector('.pay-sheen');
    if (!sheen || reducedMotion()) return;
    gsap.fromTo(sheen, { xPercent: -180 }, { xPercent: 320, duration: 1.1, ease: 'power2.inOut', repeat: -1, repeatDelay: 6 });
  }, { dependencies: [step] });

  /* live client-side stock check — catches problems before the server does */
  const localShort = lines
    .map((l) => ({ ...l, available: variantQty(l.p, l.o1, l.o2 || '') }))
    .filter((l) => l.available < l.qty);

  /* one click resolves every unavailable line: clamp to what exists, drop what doesn't */
  function fixCart(problems) {
    problems.forEach((s) => {
      const key = s.key || [s.handle, s.option1 || s.o1, s.option2 || s.o2 || ''].join('|');
      if ((s.available ?? 0) <= 0) removeLine(key);
      else setQty(key, s.available);
    });
    setShortLines(null);
    setPayErr('');
    showToast('Cart updated to real availability');
  }

  /* Step 1 — capture email (+ explicit, unchecked marketing opt-in), move on. */
  async function beginCheckout(e) {
    e.preventDefault();
    setBusy(true);
    metaTrack('InitiateCheckout', { value: cartTotal, currency: 'USD', num_items: lines.reduce((n, l) => n + l.qty, 0) });
    await saveEmailSignup({ email, source: 'checkout', consent: optIn, meta: { cart_total: cartTotal } });
    setBusy(false);
    setStep('pay');
  }

  /* Step 2a — Stripe Checkout: the Edge Function verifies stock + prices,
     records the pending order, and returns one session for the whole cart. */
  async function payWithStripe() {
    setBusy(true);
    setPayErr('');
    setShortLines(null);
    if (!hasSupabase) {
      setBusy(false);
      setShowLinks(true);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          order_id: orderId,
          email: email.toLowerCase(),
          origin: window.location.origin,
          country,
          items: lines.map((l) => ({ handle: l.handle, option1: l.o1, option2: l.o2 || null, qty: l.qty })),
        },
      });
      if (!error && data?.url) {
        if (data.order_id) setOrderId(data.order_id);
        // remember this browser's own order + status token so the Thanks
        // page can link straight to the token-protected status page
        if (data.order_id && data.access_token) saveOrderRef(data.order_id, data.access_token);
        window.location.href = data.url;
        return;
      }
      // structured stock answer: the server names exactly what's short
      const ctx = error?.context;
      let body = data;
      if (!body && ctx?.json) { try { body = await ctx.json(); } catch { /* not json */ } }
      if (body?.error === 'stock' && Array.isArray(body.lines)) {
        await reloadProducts(); // pull fresh inventory so the page tells the same story
        setShortLines(body.lines);
        if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'stock' });
      } else if (body?.error === 'preorder_closed') {
        setPayErr(`The ${body.campaign || 'preorder'} window has closed — preorder items can no longer be purchased. Nothing was charged and your cart is saved; remove the preorder items to check out the rest.`);
        if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'preorder_closed' });
      } else if (body?.error === 'limit') {
        setPayErr(`${body.title} is limited to ${body.limit} per customer${body.already ? ` and this email has already ordered ${body.already}` : ''}. Lower the quantity and try again — nothing was charged.`);
        if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'limit' });
      } else if (body?.error === 'preorder_full') {
        setPayErr(`The ${body.campaign || 'preorder'} has reached its production cap${body.available ? ` — only ${body.available} unit(s) remain` : ''}. Nothing was charged and your cart is saved.`);
        if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'preorder_full' });
      } else {
        setPayErr('Checkout didn’t open — nothing was charged and your cart is saved. Try again, or use a direct payment link below.');
        setShowLinks(true); // real per-product Stripe links as the escape hatch
        if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'function' });
      }
    } catch {
      setPayErr('Connection hiccup — nothing was charged and your cart is saved. Check your internet and try again.');
      if (window.fbq) window.fbq('trackCustom', 'CheckoutError', { kind: 'network' });
    }
    setBusy(false);
  }

  /* Step 2b — PayPal capture finished client-side: record it and thank them. */
  async function paypalPaid({ ref }) {
    if (hasSupabase && orderId) {
      // best-effort: anon can't update orders — reconcile in admin if this no-ops
      await supabase.from('orders').update({ status: 'paid', stripe_ref: `paypal:${ref}` }).eq('id', orderId).then(() => {}, () => {});
    }
    nav(`/thanks?order=${orderId || ''}`);
  }

  if (lines.length === 0 && step === 'cart') {
    return (
      <section className="section wrap" style={{ textAlign: 'center', minHeight: '50vh' }}>
        <Serpent className="empty-serpent" aria-hidden="true" />
        <h1 className="display" style={{ fontSize: 'clamp(26px,4vw,40px)' }}>Your Cart</h1>
        <p style={{ color: 'var(--silver)', margin: '16px 0 26px' }}>Nothing in here yet.</p>
        <Link className="btn" to="/shop">Shop the drop</Link>
      </section>
    );
  }

  const methods = payMethodList(CONFIG);
  const wallets = ['Apple Pay', 'Link', 'Cash App'].filter((w) => methods.includes(w));
  const problems = shortLines
    ? shortLines.map((s) => ({ ...s, key: [s.handle, s.option1 || '', s.option2 || ''].join('|') }))
    : localShort;

  return (
    <section className="section wrap" style={{ paddingTop: 40 }}>
      <div className="section-head"><span className="eyebrow">Checkout</span><h2>Your Cart</h2></div>
      {problems.length > 0 && (
        <div className="stock-fix" role="alert">
          <b>Availability changed while you were shopping:</b>
          <ul>
            {problems.map((s) => (
              <li key={s.key}>
                {(s.title || byHandle(s.handle)?.title || s.handle)} — {[s.option1 || s.o1, s.option2 || s.o2].filter(Boolean).join(' / ')}:{' '}
                {(s.available ?? 0) <= 0 ? 'sold out' : `only ${s.available} left (you have ${s.requested ?? s.qty})`}
              </li>
            ))}
          </ul>
          <button className="btn btn-sm" type="button" onClick={() => fixCart(problems)}>Update my cart</button>
        </div>
      )}
      <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div ref={listRef}>
          {lines.map((l) => (
            <div className="cart-item" key={l.key}>
              <Link to={`/product/${l.p.handle}`}><img src={l.p.images[0]} alt="" /></Link>
              <div>
                <div className="t">{l.p.title}</div>
                <div className="v">{l.p.optionNames[0]}: {l.o1}{l.o2 ? ` · ${l.p.optionNames[1]}: ${l.o2}` : ''}</div>
                {isPreorder(l.p) && (
                  <div className="v preorder-note">
                    Preorder — made after the preorder closes.{shipWindowText(campaign) ? ` Est. ship ${shipWindowText(campaign)}.` : ''}
                  </div>
                )}
                {(() => { const q = variantQty(l.p, l.o1, l.o2 || ''); return q > 0 && q <= 3
                  ? <div className="v" style={{ color: 'var(--red)' }}>Only {q} left in this size — not reserved until checkout</div> : null; })()}
                <div className="qty">
                  <button onClick={() => withFlip(() => setQty(l.key, l.qty - 1))} aria-label="Decrease quantity">−</button>
                  <span aria-live="polite">{l.qty}</span>
                  <button onClick={() => {
                    const res = setQty(l.key, l.qty + 1);
                    if (res && !res.ok) showToast(res.available === 0 ? 'That size just sold out' : `Only ${res.available} exist — all in your cart`);
                  }} aria-label="Increase quantity">+</button>
                </div>
                <button className="rm" data-fx="rattle" onClick={() => withFlip(() => removeLine(l.key))}>Remove</button>
              </div>
              <div className="p">{money(l.p.price * l.qty)}</div>
            </div>
          ))}
        </div>
        <div className="includes" data-sticky-pin style={{ position: 'sticky', top: 80 }}>
          <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 8 }}>
            <span>{depositLines.length ? 'Order value' : 'Subtotal'}</span><span ref={totalRef}>{money(cartTotal)}</span>
          </div>
          {depositLines.length > 0 && (
            <div className="deposit-breakdown" role="note">
              <div className="db-row db-now"><span>Deposit due today</span><b>{money(dueToday)}</b></div>
              <div className="db-row"><span>Balance before shipping</span><b>{money(balanceLater)}</b></div>
              <p>You’re charged the <b>{money(dueToday)}</b> deposit now (plus shipping). The remaining <b>{money(balanceLater)}</b> is invoiced by email before your order ships — you approve that charge; nothing is billed automatically.</p>
            </div>
          )}
          {freeShipActive(CONFIG) && (
            <div className="ship-progress" style={{ margin: '2px 0 10px' }}>
              <div className="bar"><div className="fill" style={{ width: `${Math.min(100, (cartTotal / CONFIG.freeShipThreshold) * 100)}%` }} /></div>
              <p style={{ fontSize: 12, color: cartTotal >= CONFIG.freeShipThreshold ? 'var(--green)' : 'var(--silver)', margin: '6px 0 0' }}>
                {cartTotal >= CONFIG.freeShipThreshold
                  ? 'Free tracked US shipping unlocked.'
                  : `You are $${(CONFIG.freeShipThreshold - cartTotal).toFixed(2)} away from free tracked shipping.`}
              </p>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--silver)', marginBottom: 16 }}>
            Pieces are not reserved until checkout. Shipping and taxes calculated at payment. Promo codes are entered on the payment screen.
          </p>
          {(() => {
            const pre = lines.filter((l) => isPreorder(l.p));
            if (!pre.length) return null;
            const mixed = pre.length < lines.length;
            return (
              <div className="preorder-cart-note" role="note">
                <b>Preorder items in this cart.</b>{' '}
                They’re made after the preorder closes{campaign?.closes_at ? ` (${new Date(campaign.closes_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})` : ''}
                {shipWindowText(campaign) ? ` — estimated shipping ${shipWindowText(campaign)}` : ''}.
                {mixed && ' Your order contains both preorder and ready-to-ship items; preorder items may ship separately.'}
                {' '}You’ll receive production updates by email, and you can cancel for a full refund any time before shipping.
              </div>
            );
          })()}
          {step === 'cart' ? (
            <form onSubmit={beginCheckout} style={{ display: 'grid', gap: 10 }}>
              <p className="guest-note">Guest checkout — email only, no account, under a minute.</p>
              <input type="email" required placeholder="Email for order updates" aria-label="Email for order updates" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="consent-row" style={{ margin: 0 }}>
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                <span>Also send me drop alerts and restock notices (optional — unsubscribe anytime)</span>
              </label>
              <div className="ship-to" role="group" aria-label="Shipping destination">
                <span className="lbl">Ships to</span>
                {[['US', 'United States'], ['CA', 'Canada']].map(([code, name]) => (
                  <button key={code} type="button" className={country === code ? 'sel' : ''}
                    aria-pressed={country === code} onClick={() => setCountry(code)}>{name}</button>
                ))}
              </div>
              {country === 'CA' && <p className="form-note" style={{ textAlign: 'left' }}>Canada Tracked — $14.95 · 7–14 business days. Duties, if any, are collected by your carrier.</p>}
              <button className="btn btn-block" type="submit" disabled={busy} style={{ position: 'relative', overflow: 'hidden' }}>
                {busy ? 'One moment…' : 'Continue to Payment'}
                <span className="pay-sheen" aria-hidden="true" />
              </button>
              <p className="form-note" style={{ textAlign: 'center' }}>{chargeReassurance()}</p>
              <div className="pay-icons pay-icons-sm" aria-label="Accepted payments">
                {methods.map((x) => <span key={x} className="pay">{x.toUpperCase()}</span>)}
              </div>
              <p className="form-note" style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
                <Lock style={{ width: 13, height: 13, color: 'var(--green)' }} /> Stripe secure checkout — card details never touch our servers
              </p>
              <p className="checkout-legal">
                By continuing, you agree to our <Link to="/terms">Terms</Link> and acknowledge our <Link to="/privacy">Privacy Policy</Link>.
              </p>
              <ul className="cart-confidence" aria-label="Buy with confidence">
                {guaranteePoints(CONFIG).map((g) => <li key={g.title}><b>{g.title}.</b> {g.text}</li>)}
              </ul>
              {(() => {
                const r = cartReview(lines);
                return r && (
                  <blockquote className="cart-review">
                    <span className="stars">★★★★★</span>
                    <p>“{r.body}”</p>
                    <cite>— {r.name}, verified buyer of the {byHandle(r.product_handle)?.title}</cite>
                  </blockquote>
                );
              })()}
            </form>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn btn-block" onClick={payWithStripe} disabled={busy || problems.length > 0}>
                {busy ? 'Opening secure checkout…' : `Card${wallets.length ? ' · ' + wallets.join(' · ') : ''}`}
              </button>
              <p className="form-note" style={{ textAlign: 'center' }}>{chargeReassurance()}</p>
              {problems.length > 0 && <p className="form-note">Fix the availability note above first — checkout re-checks real stock.</p>}
              <PayPalButtons
                amount={cartTotal}
                description={lines.map((l) => `${l.qty}x ${l.p.title}`).join(', ')}
                onPaid={paypalPaid}
              />
              {payErr && <p role="alert" style={{ color: '#e8a0a3', fontSize: 12 }}>{payErr}</p>}
              {showLinks && (
                <>
                  <div className="pay-divider">direct payment links</div>
                  {lines.map((l) => (
                    <a key={l.key} className={`btn ${l.p.stripeLink ? '' : 'btn-ghost'} btn-block`}
                      href={l.p.stripeLink || `mailto:${CONFIG.supportEmail}?subject=Order: ${l.p.title}`}
                      target="_blank" rel="noopener noreferrer">
                      Pay — {l.p.title} ({money(l.p.price * l.qty)})
                    </a>
                  ))}
                </>
              )}
              <p className="form-note" style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
                <Lock style={{ width: 13, height: 13, color: 'var(--green)' }} />
                Encrypted checkout · every method from the list above appears on the payment screen
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
