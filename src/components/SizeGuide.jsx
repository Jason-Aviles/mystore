import { useEffect, useRef, useState } from 'react';
import { recommendSize } from '../lib/sizeRecommender';

/* Size-guide data — ONE source shared by the /size-guide page and the
   in-page modal, so the two can never drift apart. Measurements are the
   store's real flat-lay numbers (inches), converted to cm on demand. */

export const TOPS = [['XS', 19, 26, 17], ['S', 20.5, 27, 18], ['M', 22, 28, 19], ['L', 23.5, 29, 20], ['XL', 25, 30, 21], ['2XL', 26.5, 31, 22]];
export const TOPS_COLS = ['Size', 'Chest', 'Length', 'Shoulder'];
export const BOTTOMS = [['XS', '26–28', 30, 7], ['S', '28–30', 31, 7.5], ['M', '30–32', 32, 8], ['L', '32–34', 33, 8.5], ['XL', '34–36', 34, 9], ['2XL', '36–38', 34, 9.5]];
export const BOTTOMS_COLS = ['Size', 'Waist', 'Inseam', 'Leg opening'];

/* which chart(s) fit a product — bundles include a top and a bottom */
export function chartsFor(p) {
  if (!p) return ['tops', 'bottoms'];
  if (p.category === 'bundle') return ['tops', 'bottoms'];
  if (p.category === 'pants' || /pant/i.test(p.title)) return ['bottoms'];
  return ['tops'];
}

const toCm = (v) => {
  if (typeof v === 'number') return Math.round(v * 2.54 * 2) / 2;
  // range strings like "26–28"
  return String(v).replace(/\d+(\.\d+)?/g, (n) => Math.round(Number(n) * 2.54));
};
const cell = (v, i, unit) => (i === 0 || unit === 'in' ? v : toCm(v));

export function SizeTable({ kind, unit = 'in' }) {
  const rows = kind === 'bottoms' ? BOTTOMS : TOPS;
  const cols = kind === 'bottoms' ? BOTTOMS_COLS : TOPS_COLS;
  return (
    <table className="sg-table">
      <thead><tr>{cols.map((c) => <th key={c}>{c}{c !== 'Size' ? ` (${unit})` : ''}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>{r.map((c, i) => <td key={i}>{cell(c, i, unit)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/* Height + weight → a SUGGESTED size. Honest: it's a recommendation, shown
   with the fit note and the full chart right below to confirm. Optional
   onPick lets the product page pre-select the suggested size. */
export function SizeRecommender({ p, onPick }) {
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [lb, setLb] = useState('');
  const [result, setResult] = useState(null);

  function suggest(e) {
    e.preventDefault();
    const heightIn = (Number(ft) || 0) * 12 + (Number(inch) || 0);
    const r = recommendSize(heightIn, lb, { p });
    setResult(r);
    if (!r.error && window.fbq) window.fbq('trackCustom', 'SizeRecommended', { content_ids: p ? [p.handle] : undefined, size: r.size });
  }

  return (
    <div className="sg-rec">
      <div className="sg-rec-head">Find your size</div>
      <form onSubmit={suggest} className="sg-rec-form">
        <label>Height
          <span className="sg-ht">
            <input type="number" inputMode="numeric" min="4" max="7" placeholder="ft" aria-label="Height feet"
              value={ft} onChange={(e) => setFt(e.target.value)} />
            <input type="number" inputMode="numeric" min="0" max="11" placeholder="in" aria-label="Height inches"
              value={inch} onChange={(e) => setInch(e.target.value)} />
          </span>
        </label>
        <label>Weight
          <input type="number" inputMode="numeric" min="70" max="400" placeholder="lb" aria-label="Weight in pounds"
            value={lb} onChange={(e) => setLb(e.target.value)} />
        </label>
        <button className="btn btn-sm" type="submit">Suggest my size</button>
      </form>
      {result && (result.error
        ? <p className="sg-rec-err">{result.error}</p>
        : (
          <div className="sg-rec-out" role="status">
            <p>We suggest <b>{result.size}</b>.</p>
            {result.notes.map((n) => <p key={n} className="sg-rec-note">{n}</p>)}
            <p className="sg-rec-note">This is a starting point — check the chart below to confirm. Not sure? Easy returns have you covered.</p>
            {onPick && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onPick(result.size)}>Use {result.size}</button>}
          </div>
        ))}
    </div>
  );
}

export function UnitToggle({ unit, onChange }) {
  return (
    <div className="sg-units" role="group" aria-label="Measurement units">
      {['in', 'cm'].map((u) => (
        <button key={u} type="button" className={unit === u ? 'sel' : ''}
          aria-pressed={unit === u} onClick={() => onChange(u)}>{u === 'in' ? 'Inches' : 'CM'}</button>
      ))}
    </div>
  );
}

/* In-page size guide — opens over the product page (no navigation away
   from the buy decision). Focus-trapped, Esc closes, unit toggle. */
export default function SizeGuideModal({ p, open, onClose, supportEmail, onPickSize }) {
  const [unit, setUnit] = useState('in');
  const root = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (window.fbq) window.fbq('trackCustom', 'SizeGuideOpened', { content_ids: p ? [p.handle] : undefined });
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('dd:lockScroll'));
    const el = root.current;
    el?.querySelector('.sg-close')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll('button, a'));
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.dispatchEvent(new Event('dd:unlockScroll'));
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, p]);

  if (!open) return null;
  const charts = chartsFor(p);

  return (
    <div className="sg-modal" ref={root} role="dialog" aria-modal="true" aria-label={`Size guide${p ? ` — ${p.title}` : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sg-panel">
        <button className="sg-close" aria-label="Close size guide" onClick={onClose}>&times;</button>
        <span className="eyebrow">Fit Reference</span>
        <h3 className="display">{p ? p.title : 'Size Guide'}</h3>
        {p?.fit && <p className="sg-fit">{p.fit}</p>}
        {p?.model && <p className="sg-model">{p.model}</p>}
        <SizeRecommender p={p} onPick={onPickSize ? (s) => { onPickSize(s); onClose(); } : null} />
        <UnitToggle unit={unit} onChange={setUnit} />
        {charts.map((kind) => (
          <div key={kind}>
            {charts.length > 1 && <h4 className="sg-h4">{kind === 'tops' ? 'Jersey (tops)' : 'Pants (bottoms)'}</h4>}
            <SizeTable kind={kind} unit={unit} />
          </div>
        ))}
        <p className="sg-note">Garment laid flat. Between sizes? Size up for the intended relaxed fit.</p>
        {supportEmail && (
          <p className="sg-note">Still unsure? Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your height and weight — we'll tell you exactly what to order.</p>
        )}
      </div>
    </div>
  );
}
