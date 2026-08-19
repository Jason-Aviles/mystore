import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { useStore } from '../context/StoreContext';
import { supabase, hasSupabase } from '../lib/supabase';
import seed from '../data/imported-reviews.json';

/* Social-proof toast — two REAL data sources, nothing invented:
   1. Reviews from the Judge.me export (verified order emails behind each).
   2. Live mode: actual paid orders from Supabase → "picked up the X · 2h ago".
   Shows a handful per session, never on the cart/checkout flow. */

/* THE WHOLE ARCHIVE: every 4★+ review works as a purchase notification —
   a verified review means that person really bought the piece, so
   "{name} bought the {product}" is a fact. Text stays verbatim;
   we never invent a "just now" timestamp for an old purchase. */
const POOL = seed.filter((r) =>
  r.stars >= 4
  && ((r.title && r.title.length > 3) || (r.body && r.body.length > 20)));

/* privacy: show "Brandon M." instead of the customer's full name */
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'Verified Customer';
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

function timeAgo(iso) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Real paid orders from the last 7 days.
    LIVE — the `recent_sales` view: product + timestamp only, no customer
           data, safe under a public read policy (see schema.sql).
    DEMO — your own test orders from this browser (dd_demo_orders), so the
           owner can preview the "just sold" look before going live. */
async function fetchRecentOrders() {
  if (!hasSupabase) {
    try {
      const demo = JSON.parse(localStorage.getItem('dd_demo_orders')) || [];
      return demo
        .filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status))
        .slice(0, 12)
        .flatMap((o) => (o.order_items || o.items || []).slice(0, 1).map((it) => ({
          type: 'order', product_handle: it.product_handle || it.handle, created_at: o.created_at,
        })));
    } catch { return []; }
  }
  const { data } = await supabase.from('recent_sales').select('*').limit(12);
  return (data || []).map((r) => ({
    type: 'order', product_handle: r.product_handle, created_at: r.created_at,
  }));
}
const MAX_PER_SESSION = 9;
const FIRST_DELAY = 12000;   // let the visitor breathe first
const GAP_MIN = 26000;       // ms between cards
const GAP_JITTER = 18000;
const VISIBLE_FOR = 7000;

export default function SocialProof() {
  const { byHandle, loading, CONFIG } = useStore();
  const { pathname } = useLocation();
  const [item, setItem] = useState(null);
  const cardRef = useRef(null);
  const shown = useRef(0);
  const deck = useRef(null);

  const quiet = pathname.startsWith('/cart') || pathname.startsWith('/admin') || pathname.startsWith('/thanks');

  const wantReviews = CONFIG.reviewPopups !== false;
  const wantOrders = CONFIG.justSoldPopups !== false;

  useEffect(() => {
    if (loading || quiet || (!wantReviews && !wantOrders)) return;

    let timer;
    let alive = true;
    // real recent orders (if any) get woven between review cards
    const ordersPromise = wantOrders ? fetchRecentOrders().catch(() => []) : Promise.resolve([]);

    const schedule = (delay) => {
      timer = setTimeout(async () => {
        if (!alive || shown.current >= MAX_PER_SESSION) return;
        if (!deck.current || !deck.current.length) {
          const orders = await ordersPromise;
          const reviews = wantReviews ? POOL : [];
          const cards = [...reviews, ...orders, ...orders]; // orders surface ~2x
          if (!cards.length) return;
          deck.current = gsap.utils.shuffle(cards);
        }
        const next = deck.current.pop();
        if (alive && next && byHandle(next.product_handle)) {
          shown.current += 1;
          setItem(next);
          setTimeout(() => setItem(null), VISIBLE_FOR);
        }
        schedule(GAP_MIN + Math.random() * GAP_JITTER);
      }, delay);
    };
    schedule(FIRST_DELAY);
    return () => { alive = false; clearTimeout(timer); };
  }, [loading, quiet, byHandle, wantReviews, wantOrders]);

  useEffect(() => {
    if (!item || !cardRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(cardRef.current,
      { x: -30, opacity: 0, scale: 0.95 },
      { x: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.6)' });
  }, [item]);

  if (!item || quiet) return null;
  const p = byHandle(item.product_handle);
  if (!p) return null;

  return (
    <div className="sp-toast" ref={cardRef} role="status">
      <Link to={`/product/${p.handle}${item.type === 'order' ? '' : '#reviews'}`} onClick={() => setItem(null)}>
        <img src={p.images[0]} alt="" />
        {item.type === 'order' ? (
          <div className="sp-body">
            <span className="sp-stars sp-live">● JUST SOLD</span>
            <b>{p.title}</b>
            <span className="sp-meta">ordered {timeAgo(item.created_at)} · one run only</span>
          </div>
        ) : (
          <div className="sp-body">
            <span className="sp-stars">{'★'.repeat(item.stars)} <i className="sp-vb">VERIFIED PURCHASE</i></span>
            <b>{shortName(item.name)} bought the {p.title}</b>
            <span className="sp-meta">
              “{(item.title && item.title.length > 3 ? item.title : item.body).slice(0, 64).trim()}
              {(item.title && item.title.length > 3 ? item.title : item.body).length > 64 ? '…' : ''}”
            </span>
          </div>
        )}
      </Link>
      <button className="sp-x" aria-label="Dismiss" onClick={() => setItem(null)}>&times;</button>
    </div>
  );
}
