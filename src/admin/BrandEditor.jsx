import { BRAND_PLACEMENTS, brandFor } from '../lib/brand';

/* Admin → Site Settings → Logos. One row per placement: show it, pick the
   emblem or the wordmark, and size it within safe limits. */
export default function BrandEditor({ value, onChange }) {
  const update = (key, patch) => onChange({ ...(value || {}), [key]: { ...brandFor(value, key), ...patch } });
  return (
    <div className="brand-editor">
      {BRAND_PLACEMENTS.map(([key, label, , unit, min, max, help]) => {
        const b = brandFor(value, key);
        return (
          <div className="be-row" key={key}>
            <div className="be-name"><b>{label}</b><small>{help}</small></div>
            <label className="be-show">
              <input type="checkbox" checked={b.show} onChange={(e) => update(key, { show: e.target.checked })} aria-label={`Show logo: ${label}`} />
              <span>{b.show ? 'Shown' : 'Hidden'}</span>
            </label>
            <select value={b.mark} disabled={!b.show} onChange={(e) => update(key, { mark: e.target.value })} aria-label={`Logo type: ${label}`}>
              <option value="emblem">Emblem (spiked D)</option>
              <option value="wordmark">Wordmark (DARK DIVINE)</option>
            </select>
            <div className="be-size">
              <input type="range" min={min} max={max} value={b.size} disabled={!b.show}
                onChange={(e) => update(key, { size: Number(e.target.value) })} aria-label={`Logo size: ${label}`} />
              <span>{b.size} {unit}</span>
            </div>
          </div>
        );
      })}
      <small className="be-note">Sizes are capped for phones automatically. Preview shows the result on desktop and mobile before you publish.</small>
    </div>
  );
}
