import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminListProducts, adminSaveProduct, uploadProductImage, isLive } from './adminData';
import { supabase } from '../lib/supabase';
import LoadError from './LoadError';

const SIZE_PRESETS = [
  ['S–XL', 'S, M, L, XL'],
  ['XS–XL', 'XS, S, M, L, XL'],
  ['S–2XL', 'S, M, L, XL, 2XL'],
  ['XS–2XL', 'XS, S, M, L, XL, 2XL'],
  ['One size', 'One Size'],
];

/** color = Color/Size pair, size = sizes only, custom = anything else (bundles) */
function optionMode(p) {
  if (p.optionNames?.[0] === 'Color') return 'color';
  if (!p.options2) return 'size';
  return 'custom';
}

/* Photo manager: upload from your computer, paste a URL, reorder, remove.
   First image = main image everywhere on the store. */
function ImageManager({ images, onChange }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleFiles(files) {
    setBusy(true);
    setErr('');
    try {
      const added = [];
      for (const f of files) added.push(await uploadProductImage(f));
      onChange([...images, ...added]);
    } catch (e) {
      setErr('Upload failed: ' + (e.message || e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <label>Photos (first = main image on the store)</label>
      <div className="img-manager">
        {images.map((src, i) => (
          <div className="img-tile" key={src.slice(0, 80) + i}>
            <img src={src} alt={`Photo ${i + 1}`} />
            {i === 0 && <span className="img-main">MAIN</span>}
            <div className="img-tools">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">←</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move later">→</button>
              <button type="button" className="danger" aria-label="Remove photo"
                onClick={() => { if (window.confirm('Remove this photo from the product?')) onChange(images.filter((_, x) => x !== i)); }}>✕</button>
            </div>
          </div>
        ))}
        <button type="button" className="img-add" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : '+ Upload photos'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => e.target.files?.length && handleFiles([...e.target.files])} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 520 }}>
        <input type="url" placeholder="…or paste an image URL" aria-label="Image URL"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => { if (url.trim()) { onChange([...images, url.trim()]); setUrl(''); } }}>Add</button>
      </div>
      {err && <p style={{ color: '#e8a0a3', fontSize: 12, marginTop: 6 }}>{err}</p>}
      <div className="hint">
        {isLive
          ? 'Uploads go to Supabase Storage — a permanent CDN link that survives every redeploy.'
          : 'Demo mode: uploads are stored in this browser only. Connect Supabase and they get permanent CDN links.'}
        {' '}Photos are auto-resized to 1400px so pages stay fast.
      </div>
    </div>
  );
}

const BLANK = {
  handle: '', title: '', sub: '', price: 0, compare: null,
  category: 'essentials', collection: 'Core', tag: 'CORE',
  featured: false, bestseller: false, newArrival: true,
  short: '', desc: [''], includes: null,
  materials: '', care: '', fit: '', model: '',
  optionNames: ['Size', null], options1: ['S', 'M', 'L', 'XL'], options2: null,
  images: [], colorImages: null, variants: [], stripeLink: '',
  seoTitle: '', seoDescription: '', status: 'active',
};

export default function ProductEdit() {
  const { handle } = useParams();
  const nav = useNavigate();
  const isNew = !handle;
  const [p, setP] = useState(isNew ? BLANK : null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [search] = useSearchParams();
  const [campaigns, setCampaigns] = useState([]);
  const [colorsText, setColorsText] = useState('');
  const [sizesText, setSizesText] = useState('');
  const [customOptions, setCustomOptions] = useState(false);
  const [fillQty, setFillQty] = useState('');
  const seeded = useRef(false);

  useEffect(() => {
    if (isNew) {
      // "+ New product" from a preorder campaign arrives with ?campaign=<id>
      const campaign = search.get('campaign');
      if (campaign) setP((prev) => ({ ...prev, campaignId: campaign, status: 'draft', newArrival: true }));
      return;
    }
    adminListProducts().then((list) => {
      const found = list.find((x) => x.handle === handle);
      setP(found || BLANK);
    }).catch((e) => setLoadError(e.message));
  }, [handle]);

  useEffect(() => {
    if (!isLive) return;
    supabase.from('preorder_campaigns').select('id, name, status').order('created_at', { ascending: false })
      .then(({ data }) => setCampaigns(data || []));
  }, []);

  // seed the simple colors/sizes fields once the product is in hand
  useEffect(() => {
    if (!p || seeded.current) return;
    seeded.current = true;
    const mode = optionMode(p);
    if (mode === 'custom') { setCustomOptions(true); return; }
    setColorsText(mode === 'color' ? p.options1.join(', ') : '');
    setSizesText(mode === 'color' ? (p.options2 || []).join(', ') : p.options1.join(', '));
  }, [p]);

  // Without this the editor would sit on "Loading…" forever when the read fails.
  if (loadError) return <LoadError error={loadError} />;
  if (!p) return <p style={{ color: 'var(--silver)' }}>Loading…</p>;

  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));
  const isPreorder = Boolean(p.campaignId);
  const colors = optionMode(p) === 'color' ? p.options1 : [];

  /* simple mode: colors become option 1 (so the photo can follow the color
     pick on the product page) and sizes option 2; no colors = sizes only */
  function applyOptions(colorsRaw, sizesRaw) {
    const list = (t) => [...new Set(t.split(',').map((s) => s.trim()).filter(Boolean))];
    const cs = list(colorsRaw);
    const ss = list(sizesRaw);
    setP((prev) => {
      const options1 = cs.length ? cs : (ss.length ? ss : ['One Size']);
      const options2 = cs.length && ss.length ? ss : null;
      const optionNames = cs.length ? ['Color', ss.length ? 'Size' : null] : ['Size', null];
      const colorImages = cs.length
        ? Object.fromEntries(cs.filter((c) => prev.colorImages?.[c]).map((c) => [c, prev.colorImages[c]]))
        : null;
      const keep = new Map(prev.variants.map((v) => [`${v[0]}|${v[1]}`, v[2]]));
      const variants = [];
      for (const o1 of options1) {
        for (const o2 of options2 || ['']) variants.push([o1, o2, keep.get(`${o1}|${o2}`) ?? 0]);
      }
      return { ...prev, options1, options2, optionNames, colorImages: colorImages && Object.keys(colorImages).length ? colorImages : (cs.length ? {} : null), variants };
    });
  }
  function setColorImage(color, src) {
    setP((prev) => {
      const next = { ...(prev.colorImages || {}) };
      if (src) next[color] = src; else delete next[color];
      return { ...prev, colorImages: next };
    });
  }
  function fillAll(qty) {
    setP((prev) => ({ ...prev, variants: prev.variants.map((v) => [v[0], v[1], Math.max(0, qty)]) }));
  }

  /* variants are rebuilt from options whenever options change */
  function rebuildVariants(options1, options2) {
    const keep = new Map(p.variants.map((v) => [`${v[0]}|${v[1]}`, v[2]]));
    const out = [];
    for (const o1 of options1) {
      if (options2 && options2.length) {
        for (const o2 of options2) out.push([o1, o2, keep.get(`${o1}|${o2}`) ?? 0]);
      } else {
        out.push([o1, '', keep.get(`${o1}|`) ?? 0]);
      }
    }
    return out;
  }

  function setOptions1(text) {
    const options1 = text.split(',').map((s) => s.trim()).filter(Boolean);
    setP((prev) => ({ ...prev, options1, variants: rebuildVariants(options1, prev.options2) }));
  }
  function setOptions2(text) {
    const arr = text.split(',').map((s) => s.trim()).filter(Boolean);
    const options2 = arr.length ? arr : null;
    setP((prev) => ({
      ...prev,
      options2,
      optionNames: [prev.optionNames[0], options2 ? (prev.optionNames[1] || 'Size') : null],
      variants: rebuildVariants(prev.options1, options2),
    }));
  }
  function setVariantQty(i, qty) {
    setP((prev) => {
      const variants = prev.variants.map((v, idx) => (idx === i ? [v[0], v[1], Math.max(0, qty)] : v));
      return { ...prev, variants };
    });
  }

  async function save(e) {
    e.preventDefault();
    const problems = validateProduct(p);
    if (problems.length) { setMsg('Save failed: ' + problems.join(' · ')); return; }
    setBusy(true);
    setMsg('');
    try {
      const clean = {
        ...p,
        handle: p.handle || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        price: Number(p.price),
        compare: p.compare ? Number(p.compare) : null,
        desc: (Array.isArray(p.desc) ? p.desc : [p.desc]).filter(Boolean),
        variants: p.variants.length ? p.variants : rebuildVariants(p.options1, p.options2),
      };
      await adminSaveProduct(clean);
      setMsg('Saved.');
      setTimeout(() => nav(search.get('campaign') ? '/admin/preorders' : '/admin/products'), 600);
    } catch (err) {
      setMsg('Save failed: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="display">{isNew ? 'Add Product' : `Edit — ${p.title}`}</h1>
      </div>
      <form className="admin-form" onSubmit={save}>
        <div className="row two">
          <div>
            <label>Title</label>
            <input type="text" required value={p.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div>
            <label>Handle (URL slug)</label>
            <input type="text" value={p.handle} placeholder="auto from title"
              onChange={(e) => set('handle', e.target.value)} disabled={!isNew} />
          </div>
        </div>
        <div>
          <label>Subtitle</label>
          <input type="text" value={p.sub} onChange={(e) => set('sub', e.target.value)} />
        </div>
        <div className="row three">
          <div>
            <label>Price (USD)</label>
            <input type="number" step="0.01" min="0" required value={p.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div>
            <label>Compare-at price</label>
            <input type="number" step="0.01" min="0" value={p.compare ?? ''} onChange={(e) => set('compare', e.target.value || null)} />
          </div>
          <div>
            <label>Category</label>
            <select value={p.category} onChange={(e) => set('category', e.target.value)}>
              {['bundle', 'jersey', 'pants', 'essentials'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="row three">
          <div>
            <label>Collection</label>
            <input type="text" value={p.collection} onChange={(e) => set('collection', e.target.value)} />
          </div>
          <div>
            <label>Tag (badge)</label>
            <input type="text" value={p.tag} onChange={(e) => set('tag', e.target.value)} />
          </div>
          <div>
            <label>Stripe Payment Link</label>
            <input type="url" placeholder="https://buy.stripe.com/…" value={p.stripeLink} onChange={(e) => set('stripeLink', e.target.value)} />
            <div className="hint">Buy It Now uses this. Create at dashboard.stripe.com/payment-links.</div>
          </div>
        </div>
        <div className="row three">
          {[['featured', 'Featured (homepage)'], ['bestseller', 'Best seller'], ['newArrival', 'New arrival']].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--bone-dim)' }}>
              <input type="checkbox" style={{ width: 'auto', accentColor: 'var(--red)' }}
                checked={!!p[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div>
          <label>Short pitch (cards / quick view)</label>
          <textarea rows="2" value={p.short} onChange={(e) => set('short', e.target.value)} />
        </div>
        <div>
          <label>Description (one paragraph per line)</label>
          <textarea rows="4" value={(Array.isArray(p.desc) ? p.desc : [p.desc]).join('\n')}
            onChange={(e) => set('desc', e.target.value.split('\n'))} />
        </div>
        <div className="row two">
          <div>
            <label>Materials</label>
            <textarea rows="2" value={p.materials} onChange={(e) => set('materials', e.target.value)} />
          </div>
          <div>
            <label>Care</label>
            <textarea rows="2" value={p.care} onChange={(e) => set('care', e.target.value)} />
          </div>
        </div>
        <div className="row two">
          <div>
            <label>Fit notes</label>
            <textarea rows="2" value={p.fit} onChange={(e) => set('fit', e.target.value)} />
          </div>
          <div>
            <label>Model sizing</label>
            <input type="text" value={p.model} onChange={(e) => set('model', e.target.value)} />
          </div>
        </div>
        <ImageManager images={p.images} onChange={(images) => set('images', images)} />
        {customOptions ? (
          <>
            <div className="row two">
              <div>
                <label>{p.optionNames[0] || 'Option 1'} values (comma-separated)</label>
                <input type="text" value={p.options1.join(', ')} onChange={(e) => setOptions1(e.target.value)} />
              </div>
              <div>
                <label>{p.optionNames[1] || 'Option 2'} values (blank = single option)</label>
                <input type="text" value={p.options2 ? p.options2.join(', ') : ''} onChange={(e) => setOptions2(e.target.value)} />
              </div>
            </div>
            <div className="row two">
              <div>
                <label>Option 1 name</label>
                <input type="text" value={p.optionNames[0] || ''} onChange={(e) => set('optionNames', [e.target.value, p.optionNames[1]])} />
              </div>
              {p.options2 && (
                <div>
                  <label>Option 2 name</label>
                  <input type="text" value={p.optionNames[1] || ''} onChange={(e) => set('optionNames', [p.optionNames[0], e.target.value])} />
                </div>
              )}
            </div>
            <button type="button" className="link-btn" onClick={() => setCustomOptions(false)}>← Back to simple colors &amp; sizes</button>
          </>
        ) : (
          <fieldset className="opt-builder">
            <legend>Colors &amp; sizes</legend>
            <div>
              <label>Colors (comma-separated — leave blank if it comes in one color)</label>
              <input type="text" value={colorsText} placeholder="e.g. Black, Bone, Blush"
                onChange={(e) => setColorsText(e.target.value)} onBlur={() => applyOptions(colorsText, sizesText)} />
            </div>
            {colors.length > 0 && (
              <div className="color-photos">
                {colors.map((c) => (
                  <div className="color-photo" key={c}>
                    <span className="k">{c}</span>
                    <select value={p.colorImages?.[c] || ''} aria-label={`Photo shown when ${c} is picked`}
                      onChange={(e) => setColorImage(c, e.target.value)}>
                      <option value="">Photo: main image</option>
                      {p.images.map((src, i) => <option key={src.slice(0, 80) + i} value={src}>Photo {i + 1}</option>)}
                    </select>
                    {p.colorImages?.[c] && <img src={p.colorImages[c]} alt="" />}
                  </div>
                ))}
                <div className="hint">Pick which photo the product page switches to when a customer taps that color.</div>
              </div>
            )}
            <div>
              <label>Sizes (comma-separated)</label>
              <input type="text" value={sizesText} placeholder="S, M, L, XL"
                onChange={(e) => setSizesText(e.target.value)} onBlur={() => applyOptions(colorsText, sizesText)} />
              <div className="size-presets">
                {SIZE_PRESETS.map(([label, list]) => (
                  <button type="button" key={label} className="btn btn-ghost btn-sm"
                    onClick={() => { setSizesText(list); applyOptions(colorsText, list); }}>{label}</button>
                ))}
              </div>
            </div>
            <button type="button" className="link-btn" onClick={() => setCustomOptions(true)}>Advanced: custom option names (bundles)</button>
          </fieldset>
        )}
        <div>
          <label>Inventory per variant {isPreorder && <span style={{ textTransform: 'none', letterSpacing: 0 }}>— for a preorder this is how many of each you will make</span>}</label>
          {p.variants.length > 1 && (
            <div className="inv-fill">
              <span>Set every variant to</span>
              <input type="number" min="0" value={fillQty} onChange={(e) => setFillQty(e.target.value)} aria-label="Quantity for every variant" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fillAll(Number(fillQty) || 0)}>Apply</button>
            </div>
          )}
          <div className="inv-grid">
            {p.variants.map((v, i) => (
              <div className="inv-cell" key={`${v[0]}|${v[1]}`}>
                <div className="k">{v[0]}{v[1] ? ` / ${v[1]}` : ''}</div>
                <input type="number" min="0" value={v[2]} onChange={(e) => setVariantQty(i, Number(e.target.value))} aria-label={`Stock for ${v[0]} ${v[1]}`} />
              </div>
            ))}
          </div>
          {p.variants.length === 0 && <div className="hint">Set option values above — variant cells appear here.</div>}
          {(p.status || 'active') === 'active' && p.variants.length > 0 && p.variants.every((v) => !v[2]) && (
            <div className="note-banner" style={{ marginTop: 10 }}>
              Every size is at 0 — this product will show as <b>sold out</b> on the store. {isPreorder ? 'Enter how many of each you will make.' : 'Add stock, or switch Visibility to Draft.'}
            </div>
          )}
        </div>
        <fieldset className="opt-builder">
          <legend>Visibility &amp; preorder</legend>
          <div className="row two">
            <div>
              <label>Visibility</label>
              <select value={p.status || 'active'} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Live — shown on the store</option>
                <option value="draft">Draft — hidden while you set it up</option>
                <option value="archived">Archived — retired</option>
              </select>
            </div>
            {isLive && (
              <div>
                <label>Preorder campaign</label>
                <select value={p.campaignId || ''} onChange={(e) => set('campaignId', e.target.value || null)}>
                  <option value="">Not a preorder — ships from stock</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
                </select>
                <div className="hint">Campaign dates, access codes and status live under <b>Preorders</b>.</div>
              </div>
            )}
          </div>
          {isPreorder && (
            <div className="row three">
              <div>
                <label>Max per customer</label>
                <input type="number" min="1" value={p.perCustomerLimit ?? ''} placeholder="no limit"
                  onChange={(e) => set('perCustomerLimit', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
              <div>
                <label>Production cap (all sizes)</label>
                <input type="number" min="1" value={p.maxPreorderUnits ?? ''} placeholder="no cap"
                  onChange={(e) => set('maxPreorderUnits', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
              <div>
                <label>Deposit per unit ($)</label>
                <input type="number" min="0" step="0.01" value={p.deposit ?? ''} placeholder="full price today"
                  onChange={(e) => set('deposit', e.target.value === '' ? null : Number(e.target.value))} />
                <div className="hint">Blank = customer pays in full. Set = they pay this now, you invoice the rest from Preorders.</div>
              </div>
            </div>
          )}
        </fieldset>
        <div className="row two">
          <div>
            <label>SEO title</label>
            <input type="text" value={p.seoTitle || ''} onChange={(e) => set('seoTitle', e.target.value)} />
          </div>
          <div>
            <label>SEO description</label>
            <input type="text" value={p.seoDescription || ''} onChange={(e) => set('seoDescription', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Product'}</button>
          <button className="btn btn-ghost" type="button" onClick={() => nav('/admin/products')}>Cancel</button>
          <span style={{ fontSize: 13, color: msg.startsWith('Save failed') ? '#e8a0a3' : 'var(--green)' }}>{msg}</span>
        </div>
      </form>
    </>
  );
}

/* What must be true before a product can be saved — a broken product page
   or an unpayable price never reaches a customer. */
function validateProduct(p) {
  const out = [];
  const price = Number(p.price);
  if (!p.title?.trim()) out.push('Title is required');
  if (!(price > 0)) out.push('Price must be more than $0');
  if (p.compare && Number(p.compare) <= price) out.push('Compare-at price must be higher than the price (or blank)');
  if ((p.status || 'active') === 'active' && !(p.images || []).length) out.push('A live product needs at least one photo');
  if (!(p.options1 || []).length) out.push('Add at least one size (or One Size)');
  if (p.deposit != null && p.deposit !== '' && !(Number(p.deposit) > 0 && Number(p.deposit) < price)) out.push('Deposit must be more than $0 and less than the price');
  if (p.perCustomerLimit != null && Number(p.perCustomerLimit) < 1) out.push('Max per customer must be 1 or more');
  if (p.maxPreorderUnits != null && Number(p.maxPreorderUnits) < 1) out.push('Production cap must be 1 or more');
  if ((p.variants || []).some((v) => Number(v[2]) < 0)) out.push('Stock can’t be negative');
  return out;
}
