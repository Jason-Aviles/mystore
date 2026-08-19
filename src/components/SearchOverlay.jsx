import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { reducedMotion } from '../lib/motion';
import { metaTrack } from '../lib/meta';

/* ============================================================
   Full-screen search — the input line draws itself, results
   cascade in per keystroke, arrows + Enter navigate, Esc closes.
   ============================================================ */

const SUGGESTIONS = ['jersey', 'hoodie', 'bundle', 'pants', 'tee', '00'];

export default function SearchOverlay({ open, onClose }) {
  const { products, money } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const root = useRef(null);
  const inputRef = useRef(null);
  const nav = useNavigate();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products
      .filter((p) => `${p.title} ${p.collection} ${p.category} ${p.tag || ''}`.toLowerCase().includes(s))
      .slice(0, 6);
  }, [q, products]);

  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  /* keys + focus trap + scroll lock */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('dd:lockScroll'));
    inputRef.current?.focus();
    const el = root.current;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setSel((s) => (s + 1) % results.length); }
      if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setSel((s) => (s - 1 + results.length) % results.length); }
      if (e.key === 'Enter' && results[sel]) { go(results[sel].handle); }
      if (e.key === 'Tab') {
        const f = Array.from(el.querySelectorAll('input, button, a'));
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.dispatchEvent(new Event('dd:unlockScroll')); window.removeEventListener('keydown', onKey); };
  }, [open, onClose, results, sel, nav]);

  /* entrance: panel wipes down, input line draws, suggestions rise */
  useGSAP(() => {
    if (!open || !root.current) return;
    if (reducedMotion()) return;
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .fromTo(root.current, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.55, ease: 'power4.inOut' })
      .fromTo('.so-input-line', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut', transformOrigin: 'left center' }, 0.3)
      .fromTo('.so-sugg > *', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05 }, 0.45);
  }, { scope: root, dependencies: [open] });

  /* results cascade on every result-set change */
  useGSAP(() => {
    if (!open || !root.current || reducedMotion()) return;
    const rows = root.current.querySelectorAll('.so-row');
    if (rows.length) {
      gsap.fromTo(rows, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power3.out', overwrite: true });
    }
  }, { scope: root, dependencies: [results.map((r) => r.handle).join()] });

  function go(handle) { metaTrack('Search', { search_string: q }); onClose(); nav(`/product/${handle}`); }

  if (!open) return null;
  return (
    <div className="search-overlay" ref={root} role="dialog" aria-modal="true" aria-label="Search">
      <div className="wrap so-inner">
        <div className="so-field">
          <input ref={inputRef} type="search" name="search" placeholder="Search the catalog…" aria-label="Search products"
            value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck="false" />
          <span className="so-input-line" aria-hidden="true" />
        </div>

        {!q && (
          <div className="so-sugg" aria-label="Suggestions">
            <span className="lbl">Try</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setQ(s)}>{s}</button>
            ))}
          </div>
        )}

        {q && (
          <div className="so-results" role="listbox" aria-label="Results">
            {results.map((p, i) => (
              <button key={p.handle} role="option" aria-selected={i === sel}
                className={`so-row ${i === sel ? 'now' : ''}`}
                onMouseEnter={() => setSel(i)} onClick={() => go(p.handle)}>
                <img src={p.images[0]} alt="" />
                <span className="t">{p.title}</span>
                <span className="c">{p.collection}</span>
                <span className="p">{money(p.price)}</span>
              </button>
            ))}
            {!results.length && (
              <p className="so-none">Nothing matches “{q}” — it may have sold through. <button className="link-btn" onClick={() => setQ('')}>Clear</button></p>
            )}
          </div>
        )}
      </div>
      <button className="mm-close" aria-label="Close search" onClick={onClose}>&times;</button>
    </div>
  );
}
