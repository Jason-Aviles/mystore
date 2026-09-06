import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Flip, wiggle, emberBurst, reducedMotion } from '../lib/motion';
import { useStore } from '../context/StoreContext';
import { lowStock, variantQty, soldOut } from '../lib/catalog';
import { returnsClaim, shipsClaim, guaranteePoints, buyReassurance } from '../lib/trust';
import VariantPicker, { useSelection, selectionState } from '../components/VariantPicker';
import SizeGuideModal from '../components/SizeGuide';
import ProductCard from '../components/ProductCard';
import ProductStory from '../components/ProductStory';
import ScrollSerpent from '../components/ScrollSerpent';
import { Lock, Truck, Swap, Shield, Crown, VenomDrop } from '../components/Icons';
import { ProductReviews, Stars } from '../components/Reviews';
import { SHOPIFY_RATING_COUNTS, productAvg, REVIEW_PROVENANCE } from '../lib/reviews';
import { saveEmailSignup } from '../lib/marketing';
import { metaTrack } from '../lib/meta';
import { fetchDemand, MIN_SHOW } from '../lib/demand';
import { shipWindowText, productionStartText, closesText, opensText, campaignLive, depositTerms, saveOrderRef } from '../lib/preorder';
import { supabase, hasSupabase } from '../lib/supabase';

export default function Product() {
  const { handle } = useParams();
  const nav = useNavigate();
  const { byHandle, products, loading, money, addToCart, setCartOpen, showToast, markViewed, recent, wishlist, toggleWish, CONFIG, campaign, isPreorder } = useStore();
  const p = byHandle(handle);

  const [imgIdx, setImgIdx] = useState(0);
  const [imgOverride, setImgOverride] = useState(null);
  const [sel1, setSel1] = useState(null);
  const [sel2, setSel2] = useState(null);
  const [sticky, setSticky] = useState(false);
  const [sizeGuide, setSizeGuide] = useState(false);
  const [bisEmail, setBisEmail] = useState('');
  const [demand, setDemand] = useState(null);
  useEffect(() => { let ok = true; fetchDemand(handle).then((d) => ok && setDemand(d)); return () => { ok = false; }; }, [handle]);
  const [bisDone, setBisDone] = useState(false);
  const [buying, setBuying] = useState(false);
  const mainRef = useRef(null);
  const firstImg = useRef(true);
  const pickerRef = useRef(null);
  const atcRef = useRef(null);
  const stickyRef = useRef(null);

  /* thumbnail → main: a clone of the thumb Flip-morphs into the main frame */
  function morphTo(thumbImg, apply) {
    const main = mainRef.current;
    if (!thumbImg || !main || reducedMotion()) { apply(); return; }
    const frame = main.parentElement; // .main
    const ghost = thumbImg.cloneNode();
    Object.assign(ghost.style, { position: 'fixed', margin: 0, zIndex: 60, objectFit: 'cover', pointerEvents: 'none' });
    const r = thumbImg.getBoundingClientRect();
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.appendChild(ghost);
    gsap.to(main, { opacity: 0.25, duration: 0.3 });
    Flip.fit(ghost, frame, {
      duration: 0.55, ease: 'power3.inOut', absolute: true,
      onComplete: () => { apply(); gsap.set(main, { opacity: 1 }); ghost.remove(); firstImg.current = true; },
    });
  }

  const mainImgSrc = imgOverride || p?.images[imgIdx];

  /* crossfade + settle when the gallery image swaps */
  useGSAP(() => {
    if (!mainRef.current) return;
    if (firstImg.current) { firstImg.current = false; return; } // entrance handled by usePageMotion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(mainRef.current,
      { opacity: 0.25, scale: 1.05 },
      { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out', overwrite: 'auto', clearProps: 'all' });
  }, { dependencies: [mainImgSrc] });

  /* JSON-LD product schema → star ratings + price shown in Google results */
  useEffect(() => {
    if (!p) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    const count = SHOPIFY_RATING_COUNTS[p.handle] || 0;
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      description: p.sub,
      image: p.images.map((src) => new URL(src, window.location.origin).href),
      brand: { '@type': 'Brand', name: 'Dark Divine' },
      offers: {
        '@type': 'Offer',
        price: p.price.toFixed(2),
        priceCurrency: 'USD',
        // availability mirrors REAL state — Google must never be told a
        // sold-out run is in stock, or a preorder ships immediately
        availability: soldOut(p) ? 'https://schema.org/OutOfStock'
          : (p.campaignId ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock'),
        url: window.location.href,
      },
      ...(count > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: productAvg(p.handle),
          reviewCount: count,
        },
      }),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [p?.handle]);

  useEffect(() => {
    if (p) {
      markViewed(p.handle);
      document.title = `${p.title} — DARK DIVINE`;
      metaTrack('ViewContent', { content_ids: [p.handle], content_name: p.title, value: p.price, currency: 'USD' });
    }
    setImgIdx(0); setImgOverride(null); setSel1(null); setSel2(null); setBisDone(false);
    firstImg.current = true; // route-change entrance owns the first frame
  }, [p?.handle]);

  useEffect(() => {
    const onScroll = () => setSticky(window.scrollY > 520);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* sticky ATC bar springs in/out instead of the CSS class snap */
  useGSAP(() => {
    if (!stickyRef.current) return;
    if (reducedMotion()) return; // CSS .show class handles it
    gsap.set(stickyRef.current, { transition: 'none' });
    gsap.to(stickyRef.current, {
      yPercent: sticky ? 0 : 112,
      duration: sticky ? 0.65 : 0.4,
      ease: sticky ? 'back.out(1.4)' : 'power3.in',
      overwrite: true,
    });
  }, { dependencies: [sticky] });

  /* loupe: hover zoom that follows the cursor around the main image */
  useGSAP(() => {
    const img = mainRef.current;
    if (!img) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion()) return;
    const frame = img.parentElement;
    const setOrigin = gsap.quickSetter(img, 'transformOrigin');
    const onEnter = () => gsap.to(img, { scale: 1.35, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    const onLeave = () => gsap.to(img, { scale: 1, duration: 0.45, ease: 'power2.inOut', overwrite: 'auto', clearProps: 'scale,transformOrigin' });
    const onMove = (e) => {
      const r = frame.getBoundingClientRect();
      setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
    };
    frame.addEventListener('mouseenter', onEnter);
    frame.addEventListener('mouseleave', onLeave);
    frame.addEventListener('mousemove', onMove);
    return () => {
      frame.removeEventListener('mouseenter', onEnter);
      frame.removeEventListener('mouseleave', onLeave);
      frame.removeEventListener('mousemove', onMove);
    };
  }, { dependencies: [p?.handle] });

  if (loading) return <div className="wrap section"><p style={{ color: 'var(--silver)' }}>Loading…</p></div>;
  if (!p) return (
    <div className="wrap section" style={{ textAlign: 'center' }}>
      <h1 className="display">Not Found</h1>
      <p style={{ color: 'var(--silver)', margin: '14px 0 24px' }}>That piece doesn't exist — or it sold through and was retired.</p>
      <Link className="btn" to="/shop">Shop the catalog</Link>
    </div>
  );

  const selection = useSelection(p, sel1, sel2);
  const low = lowStock(p, CONFIG.lowStockThreshold);
  const off = p.compare && p.compare > p.price ? Math.round((1 - p.price / p.compare) * 100) : 0;
  const gone = soldOut(p); // every variant at zero — the run is over
  const soldOutSingle = gone || (sel1 && !p.options2 && variantQty(p, sel1, '') === 0);
  const mainImg = mainImgSrc;

  function pickColor(o) {
    setSel1(o);
    if (p.colorImages?.[o]) setImgOverride(p.colorImages[o]);
  }

  function requireSel() {
    if (!selection) {
      // tell the truth about WHY: an unpicked size and a sold-out size are
      // different problems with different next steps
      const state = selectionState(p, sel1, sel2);
      showToast(state === 'soldout'
        ? 'That size is sold out — join the notify list below'
        : p.options2 ? 'Pick both sizes first' : 'Pick your size first');
      wiggle(pickerRef.current); // physical "no" — shake the picker
      return false;
    }
    return true;
  }

  /* button label rolls to "ADDED ✓" then back */
  function addedRoll() {
    const btn = atcRef.current;
    if (!btn || reducedMotion()) return;
    const labels = btn.querySelectorAll('.atc-label');
    if (labels.length < 2) return;
    gsap.timeline()
      .to(labels[0], { yPercent: -110, duration: 0.35, ease: 'power3.in' }, 0)
      .fromTo(labels[1], { yPercent: 110 }, { yPercent: 0, duration: 0.4, ease: 'back.out(2)' }, 0.28)
      .to(labels[1], { yPercent: 110, duration: 0.3, ease: 'power3.in' }, 1.5)
      .to(labels[0], { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 1.72);
  }
  /* the product photo arcs into the cart icon, then the drawer opens */
  function flyToCart(onDone) {
    const img = mainRef.current;
    const target = document.querySelector('.head-actions [aria-label="Open cart"]');
    if (!img || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return; }
    const a = img.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const ghost = img.cloneNode();
    Object.assign(ghost.style, {
      position: 'fixed', left: `${a.left}px`, top: `${a.top}px`,
      width: `${a.width}px`, height: `${a.height}px`, objectFit: 'cover',
      zIndex: 1000, pointerEvents: 'none', borderRadius: '4px',
    });
    document.body.appendChild(ghost);
    // the photo sheds embers along its arc to the cart
    let lastSpark = 0;
    const spark = () => {
      const r = ghost.getBoundingClientRect();
      const nest = document.createElement('span');
      Object.assign(nest.style, { position: 'fixed', left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, zIndex: 999, pointerEvents: 'none' });
      document.body.appendChild(nest);
      emberBurst(nest, { count: 3 });
      setTimeout(() => nest.remove(), 1800);
    };
    gsap.timeline({ onComplete: () => { ghost.remove(); onDone(); } })
      .to(ghost, {
        left: b.left + b.width / 2 - 14, top: b.top + b.height / 2 - 17,
        width: 28, height: 34, opacity: 0.85, rotation: 8,
        duration: 0.7, ease: 'power3.inOut',
        onUpdate() {
          const t = this.progress();
          if (t - lastSpark > 0.26) { lastSpark = t; spark(); }
        },
      })
      .to(ghost, { opacity: 0, scale: 0.4, duration: 0.18, ease: 'power2.in' }, '-=0.12');
  }

  function add() {
    if (!requireSel()) return;
    const res = addToCart(p.handle, selection[0], selection[1]);
    if (!res.ok) {
      // the cart already holds every remaining unit — an honest cap, not an error
      showToast(res.reason === 'maxed'
        ? `That's all ${res.available} in your cart already`
        : 'That size just sold out');
      return;
    }
    showToast(res.capped ? 'Added — that was the last one' : 'Added to cart');
    addedRoll();
    flyToCart(() => setCartOpen(true));
  }
  async function buyNow() {
    if (!requireSel()) return;
    const res = addToCart(p.handle, selection[0], selection[1]);
    if (!res.ok && res.reason === 'soldout') { showToast('That size just sold out'); return; }
    // EXPRESS: skip the cart + email screen and go straight to Stripe's
    // secure checkout, where Apple Pay / Google Pay / Link / card all appear.
    // One tap from here to a wallet purchase. Any hiccup falls back to /cart
    // so the shopper is never stuck (nothing is charged until Stripe confirms).
    if (!hasSupabase) { nav('/cart'); return; }
    setBuying(true);
    metaTrack('InitiateCheckout', { content_ids: [p.handle], value: p.price, currency: 'USD', num_items: 1 });
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          email: '', origin: window.location.origin, country: 'US',
          items: [{ handle: p.handle, option1: selection[0], option2: selection[1] || null, qty: 1 }],
        },
      });
      if (!error && data?.url) {
        if (data.order_id && data.access_token) saveOrderRef(data.order_id, data.access_token);
        window.location.href = data.url;
        return;
      }
    } catch { /* fall through to the full cart */ }
    setBuying(false);
    nav('/cart'); // graceful fallback — full cart flow with wallets on the pay step
  }
  async function bisSubmit(e) {
    e.preventDefault();
    // consent:false — they asked for ONE restock notice, not a marketing list
    await saveEmailSignup({ email: bisEmail, source: 'back_in_stock', consent: false, meta: { product: p.handle, size: sel1 } });
    setBisDone(true);
  }

  const wished = wishlist.includes(p.handle);
  const related = products.filter((x) => x.handle !== p.handle)
    .sort((a, b) => (b.collection === p.collection) - (a.collection === p.collection)).slice(0, 4);
  const recentItems = recent
    .filter((h) => h !== p.handle && !related.some((r) => r.handle === h))
    .map((h) => byHandle(h)).filter(Boolean).slice(0, 4);

  return (
    <>
      <ScrollSerpent variant="quiet" />
      <div className="wrap crumbs">
        <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / <span style={{ color: 'var(--bone)' }}>{p.title}</span>
      </div>
      <div className="wrap pdp">
        <div className="gallery">
          <div className="main" data-fx="heatVision"><img src={mainImg} alt={p.title} ref={mainRef} /></div>
          <div className="thumbs">
            {p.images.map((src, i) => (
              <button key={src} className={!imgOverride && i === imgIdx ? 'sel' : ''}
                onClick={(e) => morphTo(e.currentTarget.querySelector('img'), () => { setImgIdx(i); setImgOverride(null); })}
                aria-label={`Image ${i + 1}`}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
        <div className="buy">
          <span className="eyebrow">{p.tag && p.tag.toLowerCase() !== p.collection.toLowerCase() ? `${p.collection} — ${p.tag}` : p.collection}</span>
          <h1>{p.title}</h1>
          <div className="sub">{p.sub}</div>
          {SHOPIFY_RATING_COUNTS[p.handle] > 0 && (
            <a href="#reviews" className="rating-link">
              <Stars n={Math.round(productAvg(p.handle))} /> {productAvg(p.handle)} · {SHOPIFY_RATING_COUNTS[p.handle]} verified reviews
            </a>
          )}
          {SHOPIFY_RATING_COUNTS[p.handle] > 0 && <p className="product-review-source">{REVIEW_PROVENANCE}</p>}
          <div className="price">
            {money(p.price)}
            {off > 0 && <><s>{money(p.compare)}</s><span className="off">Save {off}%</span></>}
          </div>
          {(() => {
            const t = depositTerms(p, campaign);
            if (!t) return null;
            return (
              <div className="deposit-note">
                Preorder deposit <b>{money(t.deposit)}</b> today · <b>{money(t.balance)}</b> balance invoiced before shipping ({money(t.full)} total)
              </div>
            );
          })()}
          {CONFIG.payLaterNote && !depositTerms(p, campaign) && (
            <div className="pay4-note">or 4 interest-free payments of {money(p.price / 4)} with Klarna at checkout</div>
          )}
          {p.includes && off > 0 && (
            <div className="anchor-note">Pieces sold separately: {money(p.compare)} — the bundle saves you {money(p.compare - p.price)}</div>
          )}
          {(() => {
            const pre = isPreorder(p);
            if (pre && !gone) {
              // preorder truth beats stock language — this item is NOT on a
              // shelf, it is made after the preorder closes
              return (
                <div className="stock-note preorder" role="status">
                  Preorder — this item is made after the preorder closes.
                  {shipWindowText(campaign) ? ` Estimated shipping: ${shipWindowText(campaign)}.` : ''}
                </div>
              );
            }
            return gone
              ? <div className="stock-note" role="status">Sold out — this run is gone and won't be reprinted</div>
              : low
                ? <div className="stock-note low" role="status">Only {low} left in this run — no restock</div>
                : <div className="stock-note" role="status">In stock — one run only</div>;
          })()}
          {demand && (demand.orders24h >= MIN_SHOW || demand.orders7d >= MIN_SHOW || demand.restockRequests >= MIN_SHOW || (demand.topSize && demand.orders7d >= 5)) && (
            <div className="demand-strip" aria-label="Real demand on this piece">
              {demand.orders24h >= MIN_SHOW && <span>{demand.orders24h} orders in the last 24 hours</span>}
              {demand.orders24h < MIN_SHOW && demand.orders7d >= MIN_SHOW && <span>{demand.orders7d} orders this week</span>}
              {demand.topSize && demand.orders7d >= 5 && <span>Most selected size this week: {demand.topSize}</span>}
              {demand.restockRequests >= MIN_SHOW && <span>{demand.restockRequests} waiting on a restock</span>}
            </div>
          )}
          <div className="reserve-note">Your size is not reserved until checkout.</div>

          <div className="desc">{p.desc.map((d) => <p key={d.slice(0, 24)} data-lines>{d}</p>)}</div>

          {isPreorder(p) && (
            <div className="includes preorder-panel" data-fx="shedSkin">
              <div className="lbl">Private preorder — {campaign.name}</div>
              <ul>
                {campaign.opens_at && <li>Preorder {campaignLive(campaign) ? 'opened' : 'opens'} {opensText(campaign)}{campaign.closes_at ? ` · closes ${closesText(campaign)}` : ''}</li>}
                {!campaign.opens_at && campaign.closes_at && <li>Preorder closes {closesText(campaign)}</li>}
                {campaign.estimated_production_start && <li>Production begins ~{productionStartText(campaign)}</li>}
                {shipWindowText(campaign) && <li>Estimated shipping: {shipWindowText(campaign)}</li>}
                {p.perCustomerLimit != null && <li>Limit {p.perCustomerLimit} per customer</li>}
                {(() => {
                  const t = depositTerms(p, campaign);
                  if (!t) return null;
                  return (
                    <li>
                      <b style={{ color: 'var(--bone)' }}>Deposit today: {money(t.deposit)} per unit.</b>{' '}
                      Remaining balance of {money(t.balance)} per unit is invoiced by email before your order ships —
                      you approve that charge, nothing is billed automatically.
                    </li>
                  );
                })()}
                <li>Your order may contain both preorder and ready-to-ship items; preorder items may ship separately</li>
                <li>You'll receive production updates by email at every stage</li>
                <li>Cancel any time before shipping for a full refund — email {CONFIG.supportEmail}</li>
              </ul>
              {campaign.terms && <p className="preorder-terms">{campaign.terms}</p>}
            </div>
          )}

          {p.includes && (
            <div className="includes" data-fx="shedSkin">
              <div className="lbl">This bundle includes</div>
              <ul className="venom-list">{p.includes.map((i) => <li key={i.slice(0, 24)}><VenomDrop aria-hidden="true" />{i}</li>)}</ul>
            </div>
          )}

          <div ref={pickerRef}>
            <VariantPicker p={p} sel1={sel1} sel2={sel2}
              onSel1={p.colorImages ? pickColor : setSel1} onSel2={setSel2}
              onSizeGuide={() => setSizeGuide(true)} />
          </div>

          {gone ? (
            <div className="buy-actions">
              <button className="btn btn-block" disabled aria-disabled="true">Sold Out</button>
            </div>
          ) : (
            <div className="buy-actions">
              <button className="btn btn-block atc-btn" onClick={add} ref={atcRef}>
                <span className="atc-label">{isPreorder(p) ? 'Preorder' : 'Add to Cart'} — {money(p.deposit != null && isPreorder(p) ? p.deposit : p.price)}{p.deposit != null && isPreorder(p) ? ' deposit' : ''}</span>
                <span className="atc-label added" aria-hidden="true">Added ✓</span>
              </button>
              <button className="btn btn-red btn-block" onClick={buyNow} disabled={buying}>
                {buying ? 'Opening secure checkout…' : 'Buy It Now — Apple Pay / Google Pay'}
              </button>
              <button className="btn btn-ghost btn-block btn-sm"
                onClick={() => { toggleWish(p.handle); }}>
                {wished ? '♥ Saved' : '♡ Save for Later'}
              </button>
            </div>
          )}
          {!gone && (
            <p className="buy-reassure">
              {buyReassurance(CONFIG)}. Not sure on size?{' '}
              <button type="button" className="link-btn" onClick={() => setSizeGuide(true)}>Check the size guide</button> — easy {CONFIG.returnsDays}-day returns if it’s not right.
            </p>
          )}

          {(() => {
            if (!['jersey', 'pants'].includes(p.category)) return null;
            const partnerCat = p.category === 'jersey' ? 'pants' : 'jersey';
            const partner = products.find((x) => x.collection === p.collection && x.category === partnerCat);
            const bundle = products.find((x) => x.collection === p.collection && x.category === 'bundle');
            if (!partner || !bundle) return null;
            const separate = p.price + partner.price;
            const saves = separate - bundle.price;
            if (saves <= 0) return null; // never claim savings that aren't real
            return (
              <Link className="set-cta" to={`/product/${bundle.handle}`}>
                <img src={bundle.images[0]} alt="" />
                <span>
                  <b>Complete the set</b>
                  <em>{p.title.replace(p.collection, '').trim()} + {partner.category} together: {money(bundle.price)} — separately {money(separate)}. You keep {money(saves)}.</em>
                </span>
                <i>→</i>
              </Link>
            );
          })()}
          <div className="trust-banner">
            <div><Lock /> Guest checkout — no account</div>
            <Link to="/shipping"><Truck /> {shipsClaim(CONFIG)}</Link>
            <Link to="/refunds"><Swap /> {returnsClaim(CONFIG)}</Link>
          </div>

          <div className="confidence" aria-label="Buy with confidence">
            <div className="conf-head"><Crown aria-hidden="true" /> Buy with confidence</div>
            <ul>
              {guaranteePoints(CONFIG).map((g) => {
                const Icon = { lock: Lock, swap: Swap, truck: Truck, shield: Shield }[g.icon] || Shield;
                return (
                  <li key={g.title}>
                    <Icon aria-hidden="true" />
                    <span><b>{g.title}</b>{g.text}</span>
                  </li>
                );
              })}
            </ul>
            <p className="conf-foot">
              Questions before you buy? Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> — a real person replies {CONFIG.supportResponse}.
            </p>
          </div>

          <div className="accord">
            <details open>
              <summary>Fit &amp; Sizing</summary>
              <div className="a">
                {p.fit}<br /><br />
                <b style={{ color: 'var(--bone-dim)' }}>{p.model}</b><br /><br />
                <button type="button" className="link-btn" onClick={() => setSizeGuide(true)}
                  style={{ color: 'var(--bone)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Open the size guide</button>
              </div>
            </details>
            <details>
              <summary>Materials &amp; Care</summary>
              <div className="a">{p.materials}<br /><br />{p.care}</div>
            </details>
            <details>
              <summary>Shipping &amp; Returns</summary>
              <div className="a">
                Ships from the US within {CONFIG.processingDays} business days — free US standard shipping over ${CONFIG.freeShipThreshold}.
                Standard delivery runs 3–7 business days after dispatch. {CONFIG.returnsDays}-day returns on unworn items with tags.{' '}
                <Link to="/shipping" style={{ color: 'var(--bone)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Shipping</Link> ·{' '}
                <Link to="/refunds" style={{ color: 'var(--bone)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Returns</Link>
              </div>
            </details>
          </div>

          {soldOutSingle && (
            <div className="includes" style={{ marginTop: 18 }}>
              <div className="lbl">{gone ? 'Sold out — get notified if units free up' : `Sold out in ${sel1} — get notified`}</div>
              {bisDone ? (
                <p style={{ fontSize: 13, color: 'var(--bone)' }}>You're on the list — if a unit frees up, you hear first.</p>
              ) : (
                <form className="signup-form" onSubmit={bisSubmit}>
                  <input type="email" required placeholder="Email address" aria-label="Email for restock alert" autoComplete="email"
                    value={bisEmail} onChange={(e) => setBisEmail(e.target.value)} />
                  <button className="btn btn-sm" type="submit">Notify me</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {p.images.length >= 3 && (
        <ProductStory product={p} soldOut={gone} priceLabel={money(p.price)} onAdd={add} />
      )}

      <ProductReviews p={p} />

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="strip-head"><h2 className="display">Complete the Fit</h2></div>
          <div className="grid g4">{related.map((x) => <ProductCard key={x.handle} p={x} />)}</div>
        </div>
      </section>

      {recentItems.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="strip-head"><h2 className="display" style={{ fontSize: 'clamp(18px,2.4vw,28px)' }}>Recently Viewed</h2></div>
            <div className="grid g4">{recentItems.map((x) => <ProductCard key={x.handle} p={x} />)}</div>
          </div>
        </section>
      )}

      <div className={`sticky-atc ${sticky ? 'show' : ''}`} ref={stickyRef}>
        <div>
          <div className="t">{p.title}</div>
          <div className="p">{money(p.price)}{selection ? ` · ${selection.filter(Boolean).join(' / ')}` : ''}</div>
        </div>
        {gone
          ? <button className="btn" disabled aria-disabled="true">Sold Out</button>
          : <button className="btn" onClick={add}>Add to Cart</button>}
      </div>

      <SizeGuideModal p={p} open={sizeGuide} onClose={() => setSizeGuide(false)} supportEmail={CONFIG.supportEmail}
        onPickSize={(s) => {
          // snap the suggestion back to the product's real size option value +
          // pre-select it on whichever option axis holds sizes (not colors)
          const match = (arr) => (arr || []).find((v) => String(v).trim().toUpperCase().replace('XXL', '2XL') === String(s).toUpperCase());
          const inO1 = match(p.options1);
          if (inO1) { setSel1(inO1); return; }
          const inO2 = match(p.options2);
          if (inO2) setSel2(inO2);
        }} />
    </>
  );
}
