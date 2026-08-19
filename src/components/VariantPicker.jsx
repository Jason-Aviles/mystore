import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { variantQty } from '../lib/catalog';
import { reducedMotion } from '../lib/motion';
import { useStore } from '../context/StoreContext';

/* selected chip pops with a spring */
function pop(e) {
  if (reducedMotion()) return;
  gsap.fromTo(e.currentTarget, { scale: 0.85 }, { scale: 1, duration: 0.5, ease: 'back.out(3.5)', overwrite: 'auto', clearProps: 'scale' });
}

/** Size/color variant picker. Controlled: parent owns sel1/sel2.
    Sold-out options stay selectable ON PURPOSE — picking one is how a
    customer reaches the restock-notify flow — but they are announced as
    unavailable and can never reach the cart (useSelection returns null). */
export default function VariantPicker({ p, sel1, sel2, onSel1, onSel2, onSizeGuide }) {
  const { CONFIG } = useStore();
  const qtyFor = (o1, o2) => variantQty(p, o1, o2);
  const opt1SoldOut = (o) => (p.options2 ? p.options2.every((o2) => qtyFor(o, o2) === 0) : qtyFor(o, '') === 0);

  let note = null;
  if (sel1 && (!p.options2 || sel2)) {
    const q = qtyFor(sel1, sel2 || '');
    note = q === 0
      ? <div className="stock-note" role="status">Sold out in this combo — join the notify list below</div>
      : q <= 3
        ? <div className="stock-note low" role="status">Only {q} left in this size</div>
        : <div className="stock-note" role="status">In stock — ships within {CONFIG.processingDays} business days</div>;
  }

  return (
    <>
      <div className="opt-group">
        <div className="lbl">
          <span>{p.optionNames[0]}</span>
          {onSizeGuide
            ? <button type="button" className="link-btn" onClick={onSizeGuide}>Size guide</button>
            : <Link to="/size-guide">Size guide</Link>}
        </div>
        <div className="opts">
          {p.options1.map((o) => {
            const gone = opt1SoldOut(o);
            return (
              <button key={o}
                className={`opt ${sel1 === o ? 'sel' : ''} ${gone ? 'soldout' : ''}`}
                aria-pressed={sel1 === o}
                aria-label={`${p.optionNames[0]} ${o}${gone ? ' — sold out' : ''}`}
                onClick={(e) => { pop(e); onSel1(o); }}>{o}</button>
            );
          })}
        </div>
      </div>
      {p.options2 && (
        <div className="opt-group">
          <div className="lbl"><span>{p.optionNames[1]}</span></div>
          <div className="opts">
            {p.options2.map((o) => {
              const gone = sel1 && qtyFor(sel1, o) === 0;
              return (
                <button key={o}
                  className={`opt ${sel2 === o ? 'sel' : ''} ${gone ? 'soldout' : ''}`}
                  aria-pressed={sel2 === o}
                  aria-label={`${p.optionNames[1]} ${o}${gone ? ' — sold out' : ''}`}
                  onClick={(e) => { pop(e); onSel2(o); }}>{o}</button>
              );
            })}
          </div>
        </div>
      )}
      {note}
    </>
  );
}

export function useSelection(p, sel1, sel2) {
  if (!sel1) return null;
  if (p.options2 && !sel2) return null;
  if (variantQty(p, sel1, sel2 || '') === 0) return null;
  return [sel1, sel2 || ''];
}

/** Why an add-to-cart can't proceed — lets callers show the RIGHT message
    instead of a generic "pick your size" when the size is actually sold out. */
export function selectionState(p, sel1, sel2) {
  if (!sel1 || (p.options2 && !sel2)) return 'incomplete';
  if (variantQty(p, sel1, sel2 || '') === 0) return 'soldout';
  return 'ok';
}
