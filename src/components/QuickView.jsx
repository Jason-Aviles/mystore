import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { wiggle, reducedMotion } from '../lib/motion';
import VariantPicker, { useSelection, selectionState } from './VariantPicker';
import { SHOPIFY_RATING_COUNTS, productAvg } from '../lib/reviews';
import { Stars } from './Reviews';

/* ============================================================
   Quick view — shop without leaving the grid. The panel blooms
   open from center, image unmasks, buy column cascades. Real
   variant + cart logic; Esc closes; focus trapped.
   ============================================================ */

export default function QuickView() {
  const { quickView, setQuickView, byHandle, money, addToCart, setCartOpen, showToast } = useStore();
  const p = quickView ? byHandle(quickView) : null;
  const [sel1, setSel1] = useState(null);
  const [sel2, setSel2] = useState(null);
  const root = useRef(null);
  const pickerRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => { setSel1(null); setSel2(null); }, [quickView]);

  /* focus trap + esc + scroll lock */
  useEffect(() => {
    if (!p) return;
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('dd:lockScroll'));
    const el = root.current;
    el?.querySelector('.qv-panel')?.focus?.();
    const onKey = (e) => {
      if (e.key === 'Escape') setQuickView(null);
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll('button, a, input'));
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.dispatchEvent(new Event('dd:unlockScroll')); window.removeEventListener('keydown', onKey); };
  }, [p, setQuickView]);

  /* bloom open */
  useGSAP(() => {
    if (!p || !root.current || reducedMotion()) return;
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' })
      .fromTo('.qv-panel', { scale: 0.92, y: 30 }, { scale: 1, y: 0, duration: 0.55, ease: 'back.out(1.3)' }, 0.05)
      .fromTo('.qv-media img', { clipPath: 'inset(0 0 100% 0)', scale: 1.2 },
        { clipPath: 'inset(0 0 0% 0)', scale: 1, duration: 0.7, ease: 'power4.inOut' }, 0.15)
      .fromTo('.qv-info > *', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.055 }, 0.35);
  }, { scope: root, dependencies: [quickView] });

  if (!p) return null;
  const selection = useSelection(p, sel1, sel2);

  function add() {
    if (!selection) {
      const state = selectionState(p, sel1, sel2);
      showToast(state === 'soldout'
        ? 'That size is sold out — the product page has a notify list'
        : p.options2 ? 'Pick both sizes first' : 'Pick your size first');
      wiggle(pickerRef.current);
      return;
    }
    const res = addToCart(p.handle, selection[0], selection[1]);
    if (!res.ok) {
      showToast(res.reason === 'maxed' ? `That's all ${res.available} in your cart already` : 'That size just sold out');
      return;
    }
    showToast(res.capped ? 'Added — that was the last one' : 'Added to cart');
    setQuickView(null);
    setCartOpen(true);
  }

  function fullPage() {
    setQuickView(null);
    nav(`/product/${p.handle}`);
  }

  return (
    <div className="quickview" ref={root} role="dialog" aria-modal="true" aria-label={`Quick view — ${p.title}`}
      onClick={(e) => { if (e.target === root.current) setQuickView(null); }}>
      <div className="qv-panel" tabIndex={-1}>
        <div className="qv-media"><img src={p.images[0]} alt={p.title} /></div>
        <div className="qv-info">
          <span className="eyebrow">{p.collection}</span>
          <h3 className="display">{p.title}</h3>
          {SHOPIFY_RATING_COUNTS[p.handle] > 0 && (
            <span className="qv-rating"><Stars n={Math.round(productAvg(p.handle))} /> {productAvg(p.handle)} · {SHOPIFY_RATING_COUNTS[p.handle]} reviews</span>
          )}
          <div className="price">
            {money(p.price)}
            {p.compare > p.price && <s>{money(p.compare)}</s>}
          </div>
          <div ref={pickerRef}>
            <VariantPicker p={p} sel1={sel1} sel2={sel2} onSel1={setSel1} onSel2={setSel2} />
          </div>
          <button className="btn btn-block" onClick={add}>Add to Cart — {money(p.price)}</button>
          <button className="btn btn-ghost btn-block btn-sm" onClick={fullPage}>View the full piece</button>
        </div>
        <button className="qv-x" aria-label="Close quick view" onClick={() => setQuickView(null)}>&times;</button>
      </div>
    </div>
  );
}
