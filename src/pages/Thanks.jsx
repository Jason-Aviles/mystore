import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { ReviewForm } from '../components/Reviews';
import { emberBurst } from '../lib/motion';
import { metaTrack } from '../lib/meta';
import { readOrderRef } from '../lib/preorder';
import Reveal from '../components/Reveal';

/* Stripe success_url lands here. Clears the cart and asks for a review
   while the excitement is highest — that's how the wall of reviews grows. */
export default function Thanks() {
  const [params] = useSearchParams();
  const { cart, byHandle, removeLine, products, loading, CONFIG, campaign, isPreorder } = useStore();

  // Returning from Stripe is a FRESH page load — the catalog is still
  // fetching at mount. Capture the purchase only once products exist,
  // otherwise the Purchase pixel fires empty and the review picker
  // can't name what they bought.
  const [purchased, setPurchased] = useState([]);
  const captured = useRef(false);
  const headRef = useRef(null);
  useEffect(() => {
    if (loading || captured.current) return;
    captured.current = true;
    const lines = cart.map((l) => ({ ...l, p: byHandle(l.handle) })).filter((l) => l.p);
    setPurchased(lines.map((l) => l.p));
    // real order value: price × quantity per line
    const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    metaTrack('Purchase', { value: total || undefined, currency: 'USD', content_ids: lines.map((l) => l.handle) });
    cart.forEach((l) => removeLine(l.key));
  }, [loading]);

  /* embers erupt once from the confirmation — the initiation moment */
  useEffect(() => {
    const t = setTimeout(() => emberBurst(headRef.current, { count: 26 }), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="section wrap" style={{ maxWidth: 760 }}>
      <Reveal style={{ position: 'relative' }}>
        <span ref={headRef} style={{ position: 'absolute', left: 60, top: 6 }} aria-hidden="true" />
        <span className="eyebrow">Order Confirmed</span>
        <h1 data-fx="wordGravity" data-fx2="hatch" style={{ fontSize: 'clamp(28px,5vw,46px)', margin: '14px 0 4px' }}>You Were There<br />For The Run</h1>
        {purchased.some((x) => isPreorder(x)) ? (
          <p style={{ color: 'var(--silver)', margin: '16px 0 8px', maxWidth: '52ch' }}>
            Payment received. Your order includes preorder items — they're made after the preorder closes
            {campaign?.estimated_shipping_start && campaign?.estimated_shipping_end
              ? `, with estimated shipping ${new Date(campaign.estimated_shipping_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(campaign.estimated_shipping_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : ''}.
            You'll get production updates by email at every stage, preorder items may ship separately from
            ready-to-ship items, and you can cancel before shipping for a full refund.
          </p>
        ) : (
          <p style={{ color: 'var(--silver)', margin: '16px 0 8px', maxWidth: '52ch' }}>
            Payment received. Your confirmation email is on the way, and tracking follows the moment it ships —
            we pack within {CONFIG.processingDays} business days. Once this run sells through, what you're holding doesn't exist again.
          </p>
        )}
        {params.get('order') && (
          <p style={{ fontSize: 12, color: 'var(--silver)', letterSpacing: '0.1em' }} data-scramble>
            ORDER REF: {String(params.get('order')).slice(0, 8).toUpperCase()}
          </p>
        )}
        {(() => {
          // this browser placed the order — its private status link is local
          const ref = readOrderRef();
          if (!ref?.orderId || ref.orderId !== params.get('order')) return null;
          return (
            <p style={{ marginTop: 10 }}>
              <Link className="btn btn-ghost btn-sm" to={`/order-status?o=${ref.orderId}&t=${ref.token}`}>
                Track this order — live status page
              </Link>
            </p>
          );
        })()}
      </Reveal>

      <Reveal className="includes" style={{ marginTop: 34 }}>
        <div className="lbl">While it's fresh — rate the cop</div>
        <p style={{ fontSize: 13, color: 'var(--bone-dim)', margin: '4px 0 16px' }}>
          Reviews with your order email get the Verified badge. Takes 30 seconds, means everything to a small brand.
        </p>
        <ReviewForm products={purchased.length ? purchased : products} compact />
      </Reveal>

      <Reveal style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost" to="/shop">Keep shopping</Link>
        <a className="btn btn-ghost" href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">
          Tag {CONFIG.instagramHandle} — lookbook features get first pick of the next run
        </a>
      </Reveal>
    </section>
  );
}
