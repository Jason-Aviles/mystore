import { Fragment, useEffect, useState } from 'react';
import { adminListOrders, adminUpdateOrder, isLive } from './adminData';
import LoadError from './LoadError';
import { supabase } from '../lib/supabase';

/* Order lifecycle: pending → paid → shipped → delivered
   Side paths: refund_requested → refunded | cancelled
   Refunds themselves are issued in the Stripe dashboard (Payments →
   payment → Refund) — this screen tracks the customer-service state. */
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'refund_requested', 'refunded', 'cancelled'];
const PILL = {
  pending: 'info', paid: 'ok', shipped: 'ok', delivered: 'ok',
  refund_requested: 'warn', refunded: '', cancelled: '',
};

function csv(name, head, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[head.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const SERVICE_NAMES = {
  standard: 'Standard', priority: 'USPS Priority', express: 'USPS Express', ups_2day: 'UPS 2nd Day', ups_next: 'UPS Next Day',
  fedex_2day: 'FedEx 2Day', fedex_next: 'FedEx Overnight', ca_express: 'Canada Express',
};

async function callLabel(body) {
  const { data, error } = await supabase.functions.invoke('shipping-label', { body });
  if (data) return data;
  try { return (await error?.context?.json?.()) || { ok: false, error: error?.message }; } catch { return { ok: false, error: error?.message }; }
}

/* Buy a Shippo label for one order: rates for its real address, the
   service the customer paid for pre-selected, live labels confirmed first. */
function ShipPanel({ order: o, onDone }) {
  const [test, setTest] = useState(false);
  const [box, setBox] = useState('');
  const [weight, setWeight] = useState('');
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const q = o.shipping_quote || {};

  async function loadRates() {
    setBusy(true); setErr('');
    const r = await callLabel({ action: 'rates', order_id: o.id, test, box: box || undefined, weight_oz: weight || undefined });
    setBusy(false);
    if (!r?.ok) { setErr(r?.gaps ? `Shipping setup missing: ${r.gaps.join(', ')} — see the Shipping page` : (r?.error || 'Could not get rates')); return; }
    setRes(r); setPick(r.recommended || r.rates[0]?.id || '');
  }
  async function buy() {
    const rate = res?.rates.find((x) => x.id === pick);
    if (!rate) return;
    if (!test && !window.confirm(`Buy a REAL ${rate.carrier} ${rate.service} label for ${rate.amount}? Shippo charges your account, the order is marked shipped, and the customer gets the tracking email.`)) return;
    setBusy(true); setErr('');
    const r = await callLabel({ action: 'buy', order_id: o.id, rate_id: rate.id, test });
    setBusy(false);
    if (!r?.ok) { setErr(r?.error || 'Label not bought'); return; }
    if (r.label?.url) window.open(r.label.url, '_blank', 'noopener');
    onDone();
  }
  async function voidLabel() {
    if (!window.confirm('Void this label? Only if it was never used — Shippo refunds unused labels within a few days.')) return;
    setBusy(true);
    const r = await callLabel({ action: 'refund', order_id: o.id });
    setBusy(false);
    if (!r?.ok) setErr(r?.error || 'Could not void'); else onDone();
  }

  return (
    <div className="ship-panel">
      <div style={{ fontSize: 12, color: 'var(--silver)', marginBottom: 8 }}>
        Customer paid for: <b style={{ color: 'var(--bone)' }}>{SERVICE_NAMES[q.chosen] || 'Standard'}</b>
        {q.paid_cents != null && <> (${(q.paid_cents / 100).toFixed(2)})</>}
        {q.source && <> · quoted {q.source === 'shippo' ? 'live rates' : 'flat rates'}{q.zip ? ` for ${q.zip}` : ''}</>}
        {q.zone_mismatch && <div style={{ color: '#e8a0a3', marginTop: 4 }}>⚠ The address is in a different shipping zone than the ZIP quoted at checkout (e.g. Alaska/Hawaii on a free contiguous-US rate). Decide before buying: absorb it, or contact the customer.</div>}
      </div>
      {o.label?.url && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {o.label.test ? 'Test label' : 'Label'}: <a href={o.label.url} target="_blank" rel="noopener noreferrer">Print PDF</a>
          {' '}· {o.label.carrier} {o.label.service} · ${o.label.cost} · {o.label.tracking_number}
          {o.label.refund_status ? <> · <b>void: {o.label.refund_status}</b></> : !o.label.test && <> · <button type="button" className="btn btn-ghost btn-sm" onClick={voidLabel} disabled={busy}>Void label</button></>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="number" min="1" placeholder="Weight oz (auto)" value={weight} onChange={(e) => setWeight(e.target.value)} style={{ width: 140, padding: '6px 8px', fontSize: 12 }} />
        <input type="text" placeholder="Box name (auto)" value={box} onChange={(e) => setBox(e.target.value)} style={{ width: 150, padding: '6px 8px', fontSize: 12 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={test} onChange={(e) => { setTest(e.target.checked); setRes(null); }} style={{ width: 'auto' }} /> Test label (free, fake)
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={loadRates} disabled={busy}>{busy && !res ? 'Getting rates…' : 'Get rates'}</button>
      </div>
      {res && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: 'var(--silver)', marginBottom: 6 }}>{res.parcel.weight_oz} oz · {res.parcel.box || 'default box'}{res.test ? ' · TEST' : ''}</div>
          {res.rates.map((r) => (
            <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, textTransform: 'none', letterSpacing: 0, margin: '2px 0' }}>
              <input type="radio" name={`rate-${o.id}`} checked={pick === r.id} onChange={() => setPick(r.id)} style={{ width: 'auto' }} />
              {r.carrier} {r.service} — <b>${r.amount}</b>{r.days ? ` · ${r.days}d` : ''}{r.id === res.recommended ? ' ← what they paid for' : ''}
            </label>
          ))}
          <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={buy} disabled={busy || !pick}>
            {busy ? 'Buying…' : test ? 'Buy test label' : 'Buy label & mark shipped'}
          </button>
        </div>
      )}
      {err && <p style={{ color: '#e8a0a3', fontSize: 12, margin: '8px 0 0' }}>{err}</p>}
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState('all'); // all | preorder | regular
  const [loadError, setLoadError] = useState('');
  const [shipOpen, setShipOpen] = useState(null);
  const load = () => adminListOrders()
    .then((list) => { setOrders(list); setLoadError(''); })
    .catch((e) => setLoadError(e.message));
  useEffect(() => { load(); }, []);

  async function setStatus(o, status) {
    const patch = { status };
    if (status === 'shipped') {
      // capture tracking at the moment of shipping — it drives the customer email
      const tracking = o.tracking || window.prompt('Tracking number (sent to the customer — blank skips the email):') || '';
      if (tracking) patch.tracking = tracking;
      await adminUpdateOrder(o.id, patch);
      if (isLive && o.customer_email && tracking) {
        // shipped flow: deduped by order id server-side; failure never blocks the status
        supabase.functions.invoke('send-flow', {
          body: {
            flow: 'shipped',
            email: o.customer_email,
            vars: {
              order_number: String(o.id).slice(0, 8).toUpperCase(),
              tracking_url: `https://t.17track.net/en#nums=${encodeURIComponent(tracking)}`,
              dedup_key: String(o.id),
            },
          },
        }).catch(() => {});
      }
    } else {
      await adminUpdateOrder(o.id, patch);
    }
    load();
  }
  async function saveNote(o, note) {
    await adminUpdateOrder(o.id, { note });
  }
  async function saveTracking(o, tracking) {
    if (tracking === (o.tracking || '')) return; // only write on a real change
    await adminUpdateOrder(o.id, { tracking });
  }

  const visible = (filter === 'all' ? orders : orders.filter((o) => o.status === filter))
    .filter((o) => (kind === 'all' ? true : kind === 'preorder' ? Boolean(o.campaign_id) : !o.campaign_id));
  const preorderCount = orders.filter((o) => o.campaign_id).length;

  function exportCsv() {
    csv('darkdivine-orders.csv',
      ['order', 'email', 'status', 'type', 'items', 'total', 'ship_name', 'ship_phone', 'address1', 'address2', 'city', 'state', 'zip', 'country', 'tracking', 'placed'],
      visible.map((o) => {
        const s = o.shipping || {};
        return [
          String(o.id).slice(0, 8).toUpperCase(), o.customer_email, o.status || 'pending', o.campaign_id ? 'preorder' : 'regular',
          (o.order_items || o.items || []).map((it) => `${it.qty}x ${it.title} ${[it.option1, it.option2].filter(Boolean).join('/')}`).join('; '),
          Number(o.total || 0).toFixed(2),
          s.name || '', s.phone || '', s.line1 || '', s.line2 || '', s.city || '', s.state || '', s.postal_code || '', s.country || '',
          o.tracking || '', o.created_at?.slice(0, 10) || '',
        ];
      }));
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Orders</h1>
        <button className="btn btn-sm" onClick={exportCsv} disabled={visible.length === 0}>Export CSV</button>
      </div>

      <LoadError error={loadError} />
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Orders appear here once Supabase is connected — every checkout writes a
          <b> pending</b> order before the customer is sent to Stripe. Mark it <b>paid</b> when the
          Stripe payment lands (or wire the Stripe webhook later to do it automatically).
        </div>
      )}
      <div className="note-banner">
        <b>Refund flow:</b> customer emails support → set the order to <b>refund_requested</b> →
        issue the refund in the Stripe dashboard → set it to <b>refunded</b>. The status trail is your paper trail.
      </div>

      <div className="filter-bar" style={{ marginBottom: 8 }}>
        {[['all', 'All orders'], ['regular', 'Regular'], ['preorder', `Preorders (${preorderCount})`]].map(([k, l]) => (
          <button key={k} className={kind === k ? 'sel' : ''} onClick={() => setKind(k)}>{l}</button>
        ))}
        {kind === 'preorder' && <a className="btn btn-ghost btn-sm" href="/admin/preorders" style={{ marginLeft: 'auto' }}>Production stages, balances &amp; updates → Drops</a>}
      </div>
      <div className="filter-bar">
        {['all', ...STATUSES].map((s) => (
          <button key={s} className={filter === s ? 'sel' : ''} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="empty-note">No {filter === 'all' ? '' : filter.replace('_', ' ') + ' '}orders yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Ship to</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th><th>Note</th></tr></thead>
            <tbody>
              {visible.map((o) => (
                <Fragment key={o.id}>
                <tr>
                  <td>
                    <b>#{String(o.id).slice(0, 8)}</b>
                    {o.campaign_id && <> <span className="pill info" title="Made after the preorder closes — manage stages in Drops">PREORDER</span></>}
                    <div style={{ fontSize: 11, color: 'var(--silver)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
                    {o.campaign_id && o.production_status && <div style={{ fontSize: 11, color: 'var(--silver)' }}>Stage: {o.production_status.replace(/_/g, ' ')}</div>}
                  </td>
                  <td>{o.customer_email}</td>
                  <td style={{ fontSize: 11.5, maxWidth: 190 }}>
                    {o.shipping ? (
                      <span>{o.shipping.name}<br />
                        {[o.shipping.line1, o.shipping.line2].filter(Boolean).join(', ')}<br />
                        {[o.shipping.city, o.shipping.state, o.shipping.postal_code].filter(Boolean).join(' ')} {o.shipping.country}
                        {o.shipping.phone ? <><br />{o.shipping.phone}</> : null}
                      </span>
                    ) : <span style={{ color: 'var(--silver)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {(o.order_items || o.items || []).map((it) => (
                      <div key={it.id || it.title + it.option1}>
                        {it.qty}× {it.title} <span style={{ color: 'var(--silver)' }}>({[it.option1, it.option2].filter(Boolean).join('/')})</span>
                      </div>
                    ))}
                  </td>
                  <td>${Number(o.total || 0).toFixed(2)}</td>
                  <td>
                    <span className={`pill ${PILL[o.status] || ''}`}>{(o.status || 'pending').replace('_', ' ')}</span>
                    <select style={{ marginTop: 6, padding: '6px 8px', fontSize: 12 }}
                      value={o.status || 'pending'} onChange={(e) => setStatus(o, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="text" defaultValue={o.tracking || ''} placeholder="Tracking #"
                      style={{ padding: '8px 10px', fontSize: 12, minWidth: 120 }}
                      onBlur={(e) => saveTracking(o, e.target.value)} />
                    {isLive && o.shipping && ['paid', 'shipped'].includes(o.status) && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
                        onClick={() => setShipOpen(shipOpen === o.id ? null : o.id)}>
                        {shipOpen === o.id ? 'Close' : o.label?.url && !o.label.test ? 'Label' : 'Ship…'}
                      </button>
                    )}
                    {o.shipping_quote?.zone_mismatch && <div style={{ color: '#e8a0a3', fontSize: 11 }}>⚠ zone mismatch</div>}
                  </td>
                  <td>
                    <input type="text" defaultValue={o.note || ''} placeholder="Internal note"
                      style={{ padding: '8px 10px', fontSize: 12, minWidth: 140 }}
                      onBlur={(e) => saveNote(o, e.target.value)} />
                  </td>
                </tr>
                {shipOpen === o.id && (
                  <tr><td colSpan={8}><ShipPanel order={o} onDone={() => { setShipOpen(null); load(); }} /></td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
