import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { variantQty } from '../lib/catalog';
import { returnsClaim, freeShipActive } from '../lib/trust';
import { shipWindowText, depositTerms, lineDueNow, lineBalanceLater } from '../lib/preorder';
import { Flip, reducedMotion } from '../lib/motion';
import { Lock } from './Icons';

export default function CartDrawer() {
  const {
    cart, byHandle, money, setQty, removeLine, cartTotal, cartOpen, setCartOpen, CONFIG, products, showToast,
    campaign, isPreorder,
  } = useStore();
  const nav = useNavigate();
  const drawerRef = useRef(null);
  const flipRef = useRef(null);

  // deposit-aware totals: when any line is a deposit preorder, "due today"
  // (the deposit) is what checkout charges — the drawer must not show the
  // full price as the subtotal, or it contradicts what Stripe collects
  const cartLines = cart.map((l) => ({ ...l, p: byHandle(l.handle) })).filter((l) => l.p);
  const hasDeposit = cartLines.some((l) => depositTerms(l.p, campaign));
  const dueToday = cartLines.reduce((s, l) => s + lineDueNow(l.p, l.qty, campaign), 0);
  const balanceLater = cartLines.reduce((s, l) => s + lineBalanceLater(l.p, l.qty, campaign), 0);

  /* rows glide up when a line leaves the cart */
  function withFlip(mutate) {
    if (!reducedMotion() && drawerRef.current) {
      flipRef.current = Flip.getState(drawerRef.current.querySelectorAll('.cart-item'));
    }
    mutate();
  }
  useGSAP(() => {
    if (!flipRef.current || !drawerRef.current) return;
    Flip.from(flipRef.current, {
      targets: drawerRef.current.querySelectorAll('.cart-item'),
      duration: 0.45, ease: 'power3.inOut', absolute: true,
    });
    flipRef.current = null;
  }, { scope: drawerRef, dependencies: [cart.length] });

  /* contents cascade in each time the drawer opens (fade-only under reduced motion) */
  useGSAP(() => {
    if (!cartOpen) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rows = drawerRef.current.querySelectorAll('.ship-progress, .cart-item, .cart-empty, .cart-upsell, .foot');
    gsap.fromTo(rows,
      { opacity: 0, x: reduced ? 0 : 32 },
      { opacity: 1, x: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out', delay: 0.12, clearProps: 'all' });
    if (reduced) return;
    const fill = drawerRef.current.querySelector('.ship-progress .fill');
    if (fill) gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, transformOrigin: 'left center', duration: 0.9, ease: 'power3.inOut', delay: 0.25, clearProps: 'transform' });
  }, { scope: drawerRef, dependencies: [cartOpen] });

  /* Esc closes; focus moves into the drawer while it's open */
  useEffect(() => {
    if (!cartOpen) return;
    drawerRef.current?.querySelector('[aria-label="Close cart"]')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setCartOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cartOpen, setCartOpen]);

  const shipOn = freeShipActive(CONFIG); // hide the whole meter when no real threshold exists
  const left = CONFIG.freeShipThreshold - cartTotal;
  const pct = shipOn ? Math.min(100, (cartTotal / CONFIG.freeShipThreshold) * 100) : 0;

  /* "Complete the fit" = the REAL matching piece: a jersey in the cart
     suggests its same-collection pants (and vice versa) before falling
     back to a bestseller — related by collection, not by price. */
  const inCart = new Set(cart.map((l) => l.handle));
  const partnerCat = { jersey: 'pants', pants: 'jersey' };
  let upsell = null;
  for (const l of cart) {
    const p = byHandle(l.handle);
    const want = p && partnerCat[p.category];
    if (!want) continue;
    upsell = products.find((x) => !inCart.has(x.handle) && x.collection === p.collection && x.category === want);
    if (upsell) break;
  }
  if (!upsell) {
    upsell = products.filter((p) => !inCart.has(p.handle) && p.bestseller)
      .sort((a, b) => b.price - a.price)[0] || null;
  }

  function bumpQty(l, delta) {
    const res = setQty(l.key, l.qty + delta);
    if (delta > 0 && res && !res.ok) {
      showToast(res.available === 0 ? 'That size just sold out' : `Only ${res.available} exist — all in your cart`);
    }
  }

  function checkout() {
    setCartOpen(false);
    nav('/cart');
  }

  return (
    <>
      <div className={`overlay ${cartOpen ? 'show' : ''}`} onClick={() => setCartOpen(false)} />
      <aside className={`drawer ${cartOpen ? 'open' : ''}`} aria-label="Cart" aria-hidden={!cartOpen} ref={drawerRef}>
        <div className="head">
          <h3 className="display">Your Cart</h3>
          <button className="icon-btn" aria-label="Close cart" style={{ fontSize: 22 }} onClick={() => setCartOpen(false)}>&times;</button>
        </div>
        {shipOn && (
          <div className={`ship-progress ${left <= 0 ? 'free' : ''}`}>
            {left > 0 ? <>Add <b>{money(left)}</b> more for free US shipping</> : <>You unlocked <b>free US shipping</b></>}
            <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        <div className="items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <p>Your cart is empty.</p><br />
              <Link className="btn btn-ghost btn-sm" to="/shop" onClick={() => setCartOpen(false)}>Shop the drop</Link>
            </div>
          ) : cart.map((l) => {
            const p = byHandle(l.handle);
            if (!p) return null;
            const q = variantQty(p, l.o1, l.o2 || '');
            return (
              <div className="cart-item" key={l.key}>
                <Link to={`/product/${p.handle}`} onClick={() => setCartOpen(false)}><img src={p.images[0]} alt="" /></Link>
                <div>
                  <div className="t">{p.title}</div>
                  <div className="v">{p.optionNames[0]}: {l.o1}{l.o2 ? ` · ${p.optionNames[1]}: ${l.o2}` : ''}</div>
                  {isPreorder(p) && (
                    <div className="v preorder-note">Preorder — made after the preorder closes{shipWindowText(campaign) ? ` · est. ship ${shipWindowText(campaign)}` : ''}</div>
                  )}
                  {q === 0
                    ? <div className="v line-warn" role="status">This size just sold out — remove it to check out</div>
                    : q <= 3
                      ? <div className="v line-warn" role="status">Only {q} left in this size — not reserved until checkout</div>
                      : null}
                  <div className="qty">
                    <button onClick={() => withFlip(() => bumpQty(l, -1))} aria-label="Decrease quantity">−</button>
                    <span aria-live="polite">{l.qty}</span>
                    <button onClick={() => bumpQty(l, 1)} aria-label="Increase quantity">+</button>
                  </div>
                  <button className="rm" onClick={() => withFlip(() => removeLine(l.key))}>Remove</button>
                </div>
                <div className="p">{money(p.price * l.qty)}</div>
              </div>
            );
          })}
        </div>
        {cart.length > 0 && (
          <>
            {upsell && (
              <div className="cart-upsell">
                <div className="lbl">Complete the fit</div>
                <div className="upsell-item">
                  <img src={upsell.images[0]} alt="" />
                  <div><div className="t">{upsell.title}</div><div className="p">{money(upsell.price)}</div></div>
                  <Link className="btn btn-ghost btn-sm" to={`/product/${upsell.handle}`} onClick={() => setCartOpen(false)}>View</Link>
                </div>
              </div>
            )}
            <div className="foot">
              {hasDeposit ? (
                <div className="deposit-breakdown" style={{ margin: '0 0 10px' }}>
                  <div className="db-row"><span>Order value</span><b>{money(cartTotal)}</b></div>
                  <div className="db-row db-now"><span>Deposit due today</span><b>{money(dueToday)}</b></div>
                  <div className="db-row"><span>Balance before shipping</span><b>{money(balanceLater)}</b></div>
                  <p>The {money(balanceLater)} balance is invoiced by email before shipping — you approve that charge, nothing is billed automatically.</p>
                </div>
              ) : (
                <div className="total-row"><span>Subtotal</span><span>{money(cartTotal)}</span></div>
              )}
              <div className="note"><Lock /> Secure checkout · {returnsClaim(CONFIG)} · Shipping calculated at checkout</div>
              <button className="btn btn-block" onClick={checkout}>Checkout Securely</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
