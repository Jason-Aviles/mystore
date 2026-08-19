import { useEffect, useState } from 'react';
import { adminListOrders, adminUpdateOrder, isLive } from './adminData';
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

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const load = () => adminListOrders().then(setOrders);
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

  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  function exportCsv() {
    csv('darkdivine-orders.csv',
      ['order', 'email', 'status', 'items', 'total', 'ship_name', 'ship_phone', 'address1', 'address2', 'city', 'state', 'zip', 'country', 'tracking', 'placed'],
      visible.map((o) => {
        const s = o.shipping || {};
        return [
          String(o.id).slice(0, 8).toUpperCase(), o.customer_email, o.status || 'pending',
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
                <tr key={o.id}>
                  <td>
                    <b>#{String(o.id).slice(0, 8)}</b>
                    <div style={{ fontSize: 11, color: 'var(--silver)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
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
                  </td>
                  <td>
                    <input type="text" defaultValue={o.note || ''} placeholder="Internal note"
                      style={{ padding: '8px 10px', fontSize: 12, minWidth: 140 }}
                      onBlur={(e) => saveNote(o, e.target.value)} />
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
