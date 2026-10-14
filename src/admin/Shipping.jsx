import { useEffect, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { useStore } from '../context/StoreContext';

/* Shipping setup for Shippo: ship-from address, boxes, packaging weight,
   which upgrades checkout offers. Saved to the admin-only shipping_config
   table — the address never reaches the public site. Product weights live
   on each product (Products → edit → Packed weight). */

const FROM_FIELDS = [
  ['name', 'Name on the label', 'Dark Divine'],
  ['company', 'Company (optional)', ''],
  ['street1', 'Street address', ''],
  ['street2', 'Apt / suite (optional)', ''],
  ['city', 'City', ''],
  ['state', 'State (2 letters)', 'NY'],
  ['zip', 'ZIP', ''],
  ['phone', 'Phone (carriers require it)', ''],
  ['email', 'Email', 'contact@darkdivine.store'],
];
const UPGRADES = [
  ['priority', 'USPS Priority Mail'],
  ['ups_2day', 'UPS 2nd Day Air'],
  ['express', 'USPS Priority Mail Express'],
  ['ups_next', 'UPS Next Day Air'],
];
const STARTER_BOXES = [
  { name: 'Poly mailer 14.5×19', length: 19, width: 14.5, height: 2, maxOz: 48 },
  { name: 'Box 12×10×4', length: 12, width: 10, height: 4, maxOz: 96 },
];

export default function Shipping() {
  const { CONFIG } = useStore();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });
  const [check, setCheck] = useState(null);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase.from('shipping_config').select('data').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setMsg({ ok: false, text: `Could not load shipping setup — ${error.message}. Has the shipping migration been run?` }); setCfg({}); return; }
      const d = data?.data || {};
      setCfg({
        from: { country: 'US', ...(d.from || {}) },
        packagingOz: d.packagingOz ?? 3,
        defaultItemOz: d.defaultItemOz ?? 24,
        handlingCents: d.handlingCents ?? 0,
        boxes: d.boxes?.length ? d.boxes : STARTER_BOXES,
        services: d.services ?? UPGRADES.map(([id]) => id),
      });
    });
  }, []);

  if (!hasSupabase) return <p className="note-banner">Connect Supabase to set up shipping.</p>;
  if (!cfg) return <p className="empty-note">Loading…</p>;

  const setFrom = (k, v) => setCfg((c) => ({ ...c, from: { ...c.from, [k]: v } }));
  const setBox = (i, k, v) => setCfg((c) => ({ ...c, boxes: c.boxes.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));
  const num = (v) => (v === '' ? '' : Number(v));

  async function save(e) {
    e?.preventDefault();
    const f = cfg.from;
    const missing = ['name', 'street1', 'city', 'state', 'zip', 'phone', 'email'].filter((k) => !String(f[k] || '').trim());
    if (missing.length) { setMsg({ ok: false, text: `Fill in: ${missing.join(', ')}` }); return false; }
    if (!/^\d{5}$/.test(String(f.zip).trim())) { setMsg({ ok: false, text: 'ZIP must be 5 digits.' }); return false; }
    const boxes = cfg.boxes
      .filter((b) => b.name && b.length > 0 && b.width > 0 && b.height > 0)
      .map((b) => ({ name: b.name, length: Number(b.length), width: Number(b.width), height: Number(b.height), maxOz: b.maxOz === '' || b.maxOz == null ? null : Number(b.maxOz) }));
    if (!boxes.length) { setMsg({ ok: false, text: 'Add at least one box or mailer with all three sizes.' }); return false; }
    setBusy(true);
    const data = {
      ...cfg,
      from: { ...f, state: String(f.state).trim().toUpperCase(), zip: String(f.zip).trim() },
      boxes,
      packagingOz: Number(cfg.packagingOz) || 0,
      defaultItemOz: Number(cfg.defaultItemOz) || 24,
      handlingCents: Math.max(0, Math.round(Number(cfg.handlingCents) || 0)),
    };
    const { error } = await supabase.from('shipping_config').update({ data, updated_at: new Date().toISOString() }).eq('id', 1);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `Not saved — ${error.message}` }); return false; }
    setMsg({ ok: true, text: 'Saved.' });
    return true;
  }

  async function runCheck(test) {
    if (!(await save())) return;
    setBusy(true);
    setCheck(null);
    const { data, error } = await supabase.functions.invoke('shipping-label', { body: { action: 'check', test } });
    let body = data;
    if (!body && error?.context?.json) { try { body = await error.context.json(); } catch { /* */ } }
    setBusy(false);
    setCheck({ test, ...(body || { ok: false, error: error?.message || 'No answer — is the shipping-label function deployed?' }) });
  }

  return (
    <>
      <div className="admin-head"><h1 className="display">Shipping</h1></div>
      <div className="note-banner">
        Labels are bought through <b>Shippo</b> from <b>Orders → Ship</b>. Checkout uses
        {CONFIG.shipLiveRates ? <> <b>live carrier rates</b> by ZIP</> : <> the <b>flat rates</b> on your Shipping policy</>}
        {' '}— switch it in <a href="/admin/settings">Site Settings → Store → Live carrier rates</a> once this page,
        and every product’s <b>Packed weight</b>, are filled in.
      </div>

      <form className="admin-form" onSubmit={save} style={{ maxWidth: 760 }}>
        <fieldset>
          <legend>Ship from (printed on every label — kept private)</legend>
          <div className="row">
            {FROM_FIELDS.map(([k, label, ph]) => (
              <label key={k}>{label}
                <input type="text" value={cfg.from[k] || ''} placeholder={ph}
                  autoComplete="off" onChange={(e) => setFrom(k, e.target.value)} />
              </label>
            ))}
          </div>
          <small>US addresses only. Returns use this address too.</small>
        </fieldset>

        <fieldset>
          <legend>Boxes &amp; mailers</legend>
          <small>The smallest one whose “holds up to” covers the order’s weight is used. Inches and ounces.</small>
          {cfg.boxes.map((b, i) => (
            <div className="row" key={i} style={{ alignItems: 'end', gridTemplateColumns: '2fr repeat(4, 1fr) auto' }}>
              <label>Name<input type="text" value={b.name} onChange={(e) => setBox(i, 'name', e.target.value)} /></label>
              <label>Length<input type="number" min="1" step="0.1" value={b.length} onChange={(e) => setBox(i, 'length', num(e.target.value))} /></label>
              <label>Width<input type="number" min="1" step="0.1" value={b.width} onChange={(e) => setBox(i, 'width', num(e.target.value))} /></label>
              <label>Height<input type="number" min="0.5" step="0.1" value={b.height} onChange={(e) => setBox(i, 'height', num(e.target.value))} /></label>
              <label>Holds up to (oz)<input type="number" min="1" value={b.maxOz ?? ''} placeholder="any" onChange={(e) => setBox(i, 'maxOz', num(e.target.value))} /></label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCfg((c) => ({ ...c, boxes: c.boxes.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCfg((c) => ({ ...c, boxes: [...c.boxes, { name: '', length: '', width: '', height: '', maxOz: '' }] }))}>+ Add box</button>
        </fieldset>

        <fieldset>
          <legend>Weights &amp; fees</legend>
          <div className="row three">
            <label>Packaging weight (oz)<input type="number" min="0" step="0.1" value={cfg.packagingOz} onChange={(e) => setCfg({ ...cfg, packagingOz: num(e.target.value) })} /></label>
            <label>Default piece weight (oz)<input type="number" min="1" step="0.1" value={cfg.defaultItemOz} onChange={(e) => setCfg({ ...cfg, defaultItemOz: num(e.target.value) })} /></label>
            <label>Handling added to paid rates (¢)<input type="number" min="0" value={cfg.handlingCents} onChange={(e) => setCfg({ ...cfg, handlingCents: num(e.target.value) })} /></label>
          </div>
          <small>Default piece weight is used for any product without its own Packed weight. Handling is never added to free shipping.</small>
        </fieldset>

        <fieldset>
          <legend>Faster options offered at checkout</legend>
          {UPGRADES.map(([id, label]) => (
            <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={cfg.services.includes(id)}
                onChange={(e) => setCfg((c) => ({ ...c, services: e.target.checked ? [...c.services, id] : c.services.filter((x) => x !== id) }))} />
              {label}
            </label>
          ))}
          <small>Standard (USPS Ground Advantage) is always offered. Canada gets USPS First-Class and Priority International.</small>
        </fieldset>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Working…' : 'Save'}</button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => runCheck(true)}>Save &amp; test (test key)</button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => runCheck(false)}>Save &amp; check live</button>
        </div>
        {msg.text && <p role="status" style={{ color: msg.ok ? 'var(--green)' : '#e8a0a3', fontSize: 13 }}>{msg.text}</p>}
      </form>

      {check && (
        <div className="note-banner" style={{ maxWidth: 760, marginTop: 18 }} role="status">
          <b>{check.ok ? '✓ Shipping works' : '✗ Not ready yet'}</b> ({check.test ? 'test key' : 'live key'})
          {check.keys && <div>Shippo keys on the server: live {check.keys.live ? '✓' : '✗ missing'} · test {check.keys.test ? '✓' : '✗ missing'}</div>}
          {check.gaps?.length > 0 && <div>Missing: {check.gaps.join(', ')}</div>}
          {check.error && <div>{check.error}</div>}
          {check.address_valid === false && <div>Shippo couldn’t verify the ship-from address: {(check.address_messages || []).join(' ') || 'check street, city and ZIP'}</div>}
          {check.sample?.rates?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              Sample: one piece ({check.sample.weight_oz} oz, {check.sample.box}) to {check.sample.to}:
              <ul style={{ margin: '6px 0 0' }}>
                {check.sample.rates.map((r) => <li key={r.carrier + r.service}>{r.carrier} {r.service} — ${r.amount}{r.days ? ` · ${r.days} days` : ''}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
