import { useEffect, useMemo, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { isLive } from './adminData';

/* Private preorder mission control.
   Campaigns → products → codes → orders → updates, all against the live
   tables. Status changes here are what the storefront gate, PDP badges and
   checkout window-enforcement read — there is no second switch anywhere. */

const STATUSES = ['draft', 'coming_soon', 'live', 'closed', 'archived'];
const STAGES = [
  ['received', 'Preorder received'],
  ['preorder_closed', 'Preorder closed'],
  ['production_scheduled', 'Production scheduled'],
  ['materials_secured', 'Materials secured'],
  ['in_production', 'In production'],
  ['quality_control', 'Quality control'],
  ['preparing_shipment', 'Preparing shipment'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['delayed', 'Delayed'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
];
const STAGE_FLOW = {
  preorder_closed: 'preorder_closed',
  production_scheduled: 'production_update',
  materials_secured: 'production_update',
  in_production: 'production_started',
  quality_control: 'qc_update',
  preparing_shipment: 'shipping_soon',
  delayed: 'delay_notice',
};

const EMPTY = {
  name: '', slug: '', description: '', status: 'draft',
  opens_at: '', closes_at: '',
  estimated_production_start: '', estimated_shipping_start: '', estimated_shipping_end: '',
  access_required: true, max_orders: '', max_units: '', hero_image_url: '', terms: '',
};

const toForm = (c) => ({
  ...EMPTY, ...c,
  opens_at: c.opens_at ? c.opens_at.slice(0, 16) : '',
  closes_at: c.closes_at ? c.closes_at.slice(0, 16) : '',
  max_orders: c.max_orders ?? '', max_units: c.max_units ?? '',
  estimated_production_start: c.estimated_production_start || '',
  estimated_shipping_start: c.estimated_shipping_start || '',
  estimated_shipping_end: c.estimated_shipping_end || '',
  description: c.description || '', hero_image_url: c.hero_image_url || '', terms: c.terms || '',
});

function csv(name, head, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[head.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Preorders() {
  const [campaigns, setCampaigns] = useState([]);
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null);   // editing form (null = list view)
  const [products, setProducts] = useState([]);
  const [codes, setCodes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', label: '', max_uses: '' });
  const [newUpdate, setNewUpdate] = useState({ title: '', body: '', stage: '' });

  const sel = campaigns.find((c) => c.id === selId) || null;

  async function loadCampaigns() {
    const { data } = await supabase.from('preorder_campaigns').select('*').order('created_at', { ascending: false });
    setCampaigns(data || []);
  }
  useEffect(() => { if (hasSupabase) loadCampaigns(); }, []);

  useEffect(() => {
    if (!hasSupabase || !selId) return;
    (async () => {
      const [p, c, o, u] = await Promise.all([
        supabase.from('products').select('handle, title, price, campaign_id, per_customer_limit, max_preorder_units, deposit').order('title'),
        supabase.from('preorder_access_codes').select('*').eq('campaign_id', selId).order('created_at'),
        supabase.from('orders').select('id, customer_email, status, production_status, total, tracking, created_at, access_token, balance_due, balance_status, shipping').eq('campaign_id', selId).order('created_at', { ascending: false }),
        supabase.from('preorder_campaign_updates').select('*').eq('campaign_id', selId).order('created_at', { ascending: false }),
      ]);
      setProducts(p.data || []);
      setCodes(c.data || []);
      setOrders(o.data || []);
      setUpdates(u.data || []);
      const ids = (o.data || []).filter((x) => ['paid', 'shipped', 'delivered'].includes(x.status)).map((x) => x.id);
      if (ids.length) {
        const { data: it } = await supabase.from('order_items').select('order_id, product_handle, title, option1, option2, qty, price').in('order_id', ids);
        setItems(it || []);
      } else setItems([]);
    })();
  }, [selId, msg]);

  function flash(t) { setMsg(t); setTimeout(() => setMsg(''), 3500); }

  async function saveCampaign(e) {
    e.preventDefault();
    setBusy(true);
    const row = {
      name: form.name.trim(),
      slug: (form.slug || form.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: form.description || null,
      status: form.status,
      opens_at: form.opens_at ? new Date(form.opens_at).toISOString() : null,
      closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
      estimated_production_start: form.estimated_production_start || null,
      estimated_shipping_start: form.estimated_shipping_start || null,
      estimated_shipping_end: form.estimated_shipping_end || null,
      access_required: form.access_required !== false,
      max_orders: form.max_orders === '' ? null : Number(form.max_orders),
      max_units: form.max_units === '' ? null : Number(form.max_units),
      hero_image_url: form.hero_image_url || null,
      terms: form.terms || null,
      updated_at: new Date().toISOString(),
    };
    const q = form.id
      ? supabase.from('preorder_campaigns').update(row).eq('id', form.id)
      : supabase.from('preorder_campaigns').insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) { flash(`Save failed: ${error.message}`); return; }
    setForm(null);
    await loadCampaigns();
    flash('Campaign saved');
  }

  async function setStatus(c, status) {
    await supabase.from('preorder_campaigns').update({ status, updated_at: new Date().toISOString() }).eq('id', c.id);
    await loadCampaigns();
    flash(`Status → ${status}`);
  }

  async function toggleProduct(p) {
    const joining = p.campaign_id !== selId;
    await supabase.from('products').update({ campaign_id: joining ? selId : null }).eq('handle', p.handle);
    flash(joining ? `${p.title} added to campaign` : `${p.title} removed`);
  }
  async function setProductField(p, field, value) {
    await supabase.from('products').update({ [field]: value === '' ? null : Number(value) }).eq('handle', p.handle);
    flash('Saved');
  }

  async function addCode(e) {
    e.preventDefault();
    const code = newCode.code.trim().toUpperCase();
    if (!code) return;
    const { error } = await supabase.from('preorder_access_codes').insert({
      campaign_id: selId, code, label: newCode.label || null,
      max_uses: newCode.max_uses === '' ? null : Number(newCode.max_uses),
    });
    if (error) { flash(`Code failed: ${error.message}`); return; }
    setNewCode({ code: '', label: '', max_uses: '' });
    flash('Code created');
  }
  async function toggleCodeActive(c) {
    await supabase.from('preorder_access_codes').update({ active: !c.active }).eq('id', c.id);
    flash(c.active ? 'Code disabled' : 'Code re-enabled');
  }

  async function setOrderStage(o, stage) {
    await supabase.from('orders').update({ production_status: stage || null, updated_at: new Date().toISOString() }).eq('id', o.id);
    flash('Stage saved');
  }
  async function setTracking(o, tracking) {
    await supabase.from('orders').update({ tracking: tracking || null, updated_at: new Date().toISOString() }).eq('id', o.id);
    flash('Tracking saved');
  }

  /* invoice the remaining balance on a deposit order — Stripe emails the
     customer a hosted payment page; nothing is charged off-session */
  async function invoiceBalance(o) {
    if (!confirm(`Send ${o.customer_email} a Stripe invoice for the $${Number(o.balance_due).toFixed(2)} balance on order ${String(o.id).slice(0, 8).toUpperCase()}?`)) return;
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke('charge-balance', { body: { order_id: o.id } });
    setBusy(false);
    if (error || !res?.ok) { flash(`Invoice failed: ${res?.error || error?.message || 'unknown'}`); return; }
    flash(res.already === 'paid' ? 'Balance already paid' : 'Balance invoice sent — Stripe emailed the customer');
  }

  /* one update → every campaign customer, each with their own status link */
  async function publishUpdate(e) {
    e.preventDefault();
    setBusy(true);
    const { data: created, error } = await supabase.from('preorder_campaign_updates').insert({
      campaign_id: selId, title: newUpdate.title.trim(), body: newUpdate.body.trim(),
      stage: newUpdate.stage || null, published: true,
    }).select('id').single();
    if (error || !created) { setBusy(false); flash(`Update failed: ${error?.message}`); return; }
    const flow = newUpdate.stage ? (STAGE_FLOW[newUpdate.stage] || 'production_update') : 'production_update';
    const { data: res, error: fnErr } = await supabase.functions.invoke('preorder-notify', {
      body: { campaign_id: selId, update_id: created.id, flow, stage: newUpdate.stage || undefined },
    });
    setBusy(false);
    setNewUpdate({ title: '', body: '', stage: '' });
    if (fnErr) flash('Update saved, but emailing failed — retry from the updates list');
    else flash(`Update published — emailed ${res?.sent ?? 0} customers (${res?.skipped ?? 0} skipped)`);
  }
  async function resendUpdate(u) {
    setBusy(true);
    const flow = u.stage ? (STAGE_FLOW[u.stage] || 'production_update') : 'production_update';
    const { data: res, error } = await supabase.functions.invoke('preorder-notify', {
      body: { campaign_id: selId, update_id: u.id, flow },
    });
    setBusy(false);
    flash(error ? 'Send failed' : `Sent to ${res?.sent ?? 0} (dedup skips customers who already got it)`);
  }

  /* ---- derived stats (paid orders only — revenue never counts pendings) ---- */
  const stats = useMemo(() => {
    const paid = orders.filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status));
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const units = items.reduce((s, i) => s + i.qty, 0);
    const byVariant = {};
    items.forEach((i) => {
      const k = [i.product_handle || i.title, i.option1 || '—', i.option2 || ''].join('|');
      byVariant[k] = byVariant[k] || { title: i.title, option1: i.option1, option2: i.option2, qty: 0 };
      byVariant[k].qty += i.qty;
    });
    return { paidCount: paid.length, revenue, units, byVariant: Object.values(byVariant).sort((a, b) => b.qty - a.qty) };
  }, [orders, items]);

  const exportProduction = () => csv(`${sel.slug}-production.csv`,
    ['product', 'option1', 'option2', 'units_to_produce'],
    stats.byVariant.map((v) => [v.title, v.option1 || '', v.option2 || '', v.qty]));
  const exportFulfillment = () => csv(`${sel.slug}-fulfillment.csv`,
    ['order', 'email', 'status', 'production_status', 'items', 'total',
      'ship_name', 'ship_phone', 'address1', 'address2', 'city', 'state', 'zip', 'country', 'tracking', 'placed'],
    orders.filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status)).map((o) => {
      const s = o.shipping || {};
      return [
        String(o.id).slice(0, 8).toUpperCase(), o.customer_email, o.status, o.production_status || '',
        items.filter((i) => i.order_id === o.id).map((i) => `${i.qty}x ${i.title} ${[i.option1, i.option2].filter(Boolean).join('/')}`).join('; '),
        Number(o.total).toFixed(2),
        s.name || '', s.phone || '', s.line1 || '', s.line2 || '', s.city || '', s.state || '', s.postal_code || '', s.country || '',
        o.tracking || '', o.created_at?.slice(0, 10) || '',
      ];
    }));

  if (!isLive) {
    return (
      <>
        <div className="admin-head"><h1 className="display">Preorders</h1></div>
        <div className="note-banner"><b>Preorders need Supabase.</b> Campaigns, access codes, order stages and customer updates all live in the database — connect Supabase to use this page.</div>
      </>
    );
  }

  /* -------- campaign editor -------- */
  if (form) {
    return (
      <>
        <div className="admin-head"><h1 className="display">{form.id ? 'Edit Campaign' : 'New Campaign'}</h1></div>
        <form className="admin-form" onSubmit={saveCampaign} style={{ maxWidth: 680 }}>
          <fieldset>
            <legend>Campaign</legend>
            <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CITY OF SINS — PRIVATE PREORDER" /></label>
            <label>Slug<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from name" /></label>
            <label>Description (shown on the gate)<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label>Hero image URL<input value={form.hero_image_url} onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })} placeholder="/media/editorial/..." /></label>
            <label>Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="consent-row" style={{ margin: '4px 0' }}>
              <input type="checkbox" checked={form.access_required !== false} onChange={(e) => setForm({ ...form, access_required: e.target.checked })} />
              <span>Access code required to enter (private preorder)</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Dates — these appear verbatim on the gate, PDP, checkout and emails</legend>
            <label>Opens<input type="datetime-local" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} /></label>
            <label>Closes<input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></label>
            <label>Estimated production start<input type="date" value={form.estimated_production_start} onChange={(e) => setForm({ ...form, estimated_production_start: e.target.value })} /></label>
            <label>Estimated shipping — start<input type="date" value={form.estimated_shipping_start} onChange={(e) => setForm({ ...form, estimated_shipping_start: e.target.value })} /></label>
            <label>Estimated shipping — end<input type="date" value={form.estimated_shipping_end} onChange={(e) => setForm({ ...form, estimated_shipping_end: e.target.value })} /></label>
          </fieldset>
          <fieldset>
            <legend>Caps (blank = unlimited)</legend>
            <label>Max orders<input type="number" min="1" value={form.max_orders} onChange={(e) => setForm({ ...form, max_orders: e.target.value })} /></label>
            <label>Max total units<input type="number" min="1" value={form.max_units} onChange={(e) => setForm({ ...form, max_units: e.target.value })} /></label>
          </fieldset>
          <fieldset>
            <legend>Preorder terms (shown on product pages — cancellation/refund promise)</legend>
            <textarea rows={4} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })}
              placeholder="Items are made after the preorder closes. Cancel any time before shipping for a full refund…" />
          </fieldset>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Campaign'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
        <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 12 }}>{msg}</p>
      </>
    );
  }

  /* -------- campaign detail -------- */
  if (sel) {
    return (
      <>
        <div className="admin-head">
          <h1 className="display">{sel.name}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelId(null)}>← All campaigns</button>
            <button className="btn btn-sm" onClick={() => setForm(toForm(sel))}>Edit</button>
          </div>
        </div>
        {msg && <div className="note-banner">{msg}</div>}

        <div className="filter-bar" style={{ marginBottom: 14 }}>
          {STATUSES.map((s) => (
            <button key={s} className={sel.status === s ? 'sel' : ''} onClick={() => setStatus(sel, s)}>{s}</button>
          ))}
        </div>

        <div className="stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 22 }}>
          {[['Paid orders', stats.paidCount], ['Units ordered', stats.units], ['Revenue', `$${stats.revenue.toFixed(2)}`],
            ['Access codes', `${codes.filter((c) => c.active).length} active`]].map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--line)', padding: '14px 16px' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--silver)', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="admin-head" style={{ marginTop: 8 }}><h2 style={{ fontSize: 18 }}>Products in this campaign</h2></div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>In</th><th>Product</th><th>Price</th><th>Per-customer limit</th><th>Production cap</th><th>Deposit $</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.handle} style={{ opacity: p.campaign_id && p.campaign_id !== selId ? 0.45 : 1 }}>
                  <td><input type="checkbox" checked={p.campaign_id === selId}
                    disabled={Boolean(p.campaign_id) && p.campaign_id !== selId}
                    onChange={() => toggleProduct(p)} aria-label={`Assign ${p.title}`} /></td>
                  <td>{p.title}{p.campaign_id && p.campaign_id !== selId ? ' (in another campaign)' : ''}</td>
                  <td>${Number(p.price).toFixed(2)}</td>
                  {['per_customer_limit', 'max_preorder_units', 'deposit'].map((f) => (
                    <td key={f}>
                      {p.campaign_id === selId ? (
                        <input type="number" min="0" step={f === 'deposit' ? '0.01' : '1'} defaultValue={p[f] ?? ''}
                          style={{ width: 90 }} aria-label={`${f} for ${p.title}`}
                          onBlur={(e) => e.target.value !== String(p[f] ?? '') && setProductField(p, f, e.target.value)} />
                      ) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin-head" style={{ marginTop: 26 }}><h2 style={{ fontSize: 18 }}>Access codes</h2></div>
        <p style={{ fontSize: 12, color: 'var(--silver)', margin: '0 0 10px' }}>
          Codes are validated server-side only — they never appear in the storefront bundle. Disable a code to rotate it out instantly.
        </p>
        <form onSubmit={addCode} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input required placeholder="CODE" value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} style={{ width: 160 }} aria-label="New access code" />
          <input placeholder="Label (who got it)" value={newCode.label} onChange={(e) => setNewCode({ ...newCode, label: e.target.value })} style={{ width: 180 }} aria-label="Code label" />
          <input type="number" min="1" placeholder="Max uses" value={newCode.max_uses} onChange={(e) => setNewCode({ ...newCode, max_uses: e.target.value })} style={{ width: 110 }} aria-label="Max uses" />
          <button className="btn btn-sm" type="submit">Create code</button>
        </form>
        {codes.length > 0 && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>Code</th><th>Label</th><th>Uses</th><th>Status</th><th /></tr></thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace' }}>{c.code}</td>
                    <td>{c.label || '—'}</td>
                    <td>{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td>{c.active ? <span className="pill ok">active</span> : <span className="pill">disabled</span>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => toggleCodeActive(c)}>{c.active ? 'Disable' : 'Enable'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-head" style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 18 }}>Units by product / size / color</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={exportProduction} disabled={!stats.byVariant.length}>Production CSV</button>
            <button className="btn btn-sm" onClick={exportFulfillment} disabled={!orders.length}>Fulfillment CSV</button>
          </div>
        </div>
        {stats.byVariant.length === 0 ? <p className="empty-note">No paid orders yet.</p> : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>Product</th><th>Option 1</th><th>Option 2</th><th>Units</th></tr></thead>
              <tbody>
                {stats.byVariant.map((v, i) => (
                  <tr key={i}><td>{v.title}</td><td>{v.option1 || '—'}</td><td>{v.option2 || '—'}</td><td>{v.qty}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-head" style={{ marginTop: 26 }}><h2 style={{ fontSize: 18 }}>Publish a campaign update</h2></div>
        <p style={{ fontSize: 12, color: 'var(--silver)', margin: '0 0 10px' }}>
          One update goes to every paid order in this campaign — each customer gets their own private status link.
          Pick a stage to advance all orders at the same time (the email template matches the stage).
        </p>
        <form className="admin-form" onSubmit={publishUpdate} style={{ maxWidth: 620 }}>
          <label>Title<input required value={newUpdate.title} onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })} placeholder="Fabric arrived — cutting starts Monday" /></label>
          <label>Body<textarea required rows={4} value={newUpdate.body} onChange={(e) => setNewUpdate({ ...newUpdate, body: e.target.value })} placeholder="What actually happened, in plain words. This lands in inboxes and on the status page verbatim." /></label>
          <label>Advance all orders to stage (optional)
            <select value={newUpdate.stage} onChange={(e) => setNewUpdate({ ...newUpdate, stage: e.target.value })}>
              <option value="">— no stage change —</option>
              {STAGES.filter(([k]) => !['shipped', 'delivered', 'cancelled', 'refunded'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish + email customers'}</button>
        </form>
        {updates.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="admin-table">
              <thead><tr><th>Update</th><th>Stage</th><th>Emailed</th><th /></tr></thead>
              <tbody>
                {updates.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.title}</b><br /><span style={{ fontSize: 12, color: 'var(--silver)' }}>{u.body.slice(0, 120)}</span></td>
                    <td>{u.stage || '—'}</td>
                    <td>{u.emailed_at ? new Date(u.emailed_at).toLocaleString() : 'not yet'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => resendUpdate(u)} disabled={busy}>Send</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-head" style={{ marginTop: 26 }}><h2 style={{ fontSize: 18 }}>Orders ({orders.length})</h2></div>
        {orders.length === 0 ? <p className="empty-note">No orders in this campaign yet.</p> : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>Order</th><th>Email</th><th>Ship to</th><th>Payment</th><th>Total</th><th>Balance</th><th>Production stage</th><th>Tracking</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace' }}>{String(o.id).slice(0, 8).toUpperCase()}</td>
                    <td>{o.customer_email}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>
                      {o.shipping ? (
                        <span>{o.shipping.name}<br />
                          {[o.shipping.line1, o.shipping.line2].filter(Boolean).join(', ')}<br />
                          {[o.shipping.city, o.shipping.state, o.shipping.postal_code].filter(Boolean).join(' ')} {o.shipping.country}
                          {o.shipping.phone ? <><br />{o.shipping.phone}</> : null}
                        </span>
                      ) : <span style={{ color: 'var(--silver)' }}>—</span>}
                    </td>
                    <td><span className={`pill ${['paid', 'shipped', 'delivered'].includes(o.status) ? 'ok' : ''}`}>{o.status}</span></td>
                    <td>${Number(o.total).toFixed(2)}</td>
                    <td>
                      {Number(o.balance_due) > 0 ? (
                        o.balance_status === 'paid' ? <span className="pill ok">${Number(o.balance_due).toFixed(2)} paid</span>
                        : o.balance_status === 'invoiced' ? <span className="pill info">${Number(o.balance_due).toFixed(2)} invoiced</span>
                        : ['paid', 'shipped', 'delivered'].includes(o.status)
                          ? <button className="btn btn-sm" disabled={busy} onClick={() => invoiceBalance(o)}>Invoice ${Number(o.balance_due).toFixed(2)}</button>
                          : <span style={{ fontSize: 12, color: 'var(--silver)' }}>${Number(o.balance_due).toFixed(2)} (awaiting deposit)</span>
                      ) : <span style={{ fontSize: 12, color: 'var(--silver)' }}>—</span>}
                    </td>
                    <td>
                      <select defaultValue={o.production_status || ''} onChange={(e) => setOrderStage(o, e.target.value)} aria-label={`Stage for ${o.customer_email}`}>
                        <option value="">—</option>
                        {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <input defaultValue={o.tracking || ''} placeholder="Tracking #" style={{ width: 140 }}
                        aria-label={`Tracking for ${o.customer_email}`}
                        onBlur={(e) => e.target.value !== (o.tracking || '') && setTracking(o, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  /* -------- campaign list -------- */
  return (
    <>
      <div className="admin-head">
        <h1 className="display">Preorders</h1>
        <button className="btn btn-sm" onClick={() => setForm({ ...EMPTY })}>New Campaign</button>
      </div>
      {msg && <div className="note-banner">{msg}</div>}
      {campaigns.length === 0 ? (
        <p className="empty-note">
          No preorder campaigns yet. Create one, assign products to it, add access codes — the storefront gate switches to
          private-preorder mode automatically when the campaign is <b>coming_soon</b> (email collection) or <b>live</b> (code entry).
        </p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Campaign</th><th>Status</th><th>Opens</th><th>Closes</th><th>Est. shipping</th><th /></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><br /><span style={{ fontSize: 12, color: 'var(--silver)' }}>{c.slug}</span></td>
                  <td><span className={`pill ${c.status === 'live' ? 'ok' : 'info'}`}>{c.status}</span></td>
                  <td style={{ fontSize: 12 }}>{c.opens_at ? new Date(c.opens_at).toLocaleString() : '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.closes_at ? new Date(c.closes_at).toLocaleString() : '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.estimated_shipping_start ? `${c.estimated_shipping_start} → ${c.estimated_shipping_end || '?'}` : '—'}</td>
                  <td><button className="btn btn-sm" onClick={() => setSelId(c.id)}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
