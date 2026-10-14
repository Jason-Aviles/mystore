import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/* Ship a whole preorder batch at once.
   1. tick which pieces are in hand (e.g. hoodies in January, sets in Feb) —
      an order is ready only when EVERY piece in it is ticked, so combined
      orders wait for their last piece;
   2. "Price labels" quotes each ready order (the service it paid for);
   3. "Buy" buys them one by one: each order is marked shipped, its stage set
      to Shipped, and the customer gets the tracking email (live only).
   Skips: unpaid deposit balances, missing addresses, orders that already
   have a live label. Test mode buys free fake labels and changes nothing. */

async function callLabel(body) {
  const { data, error } = await supabase.functions.invoke('shipping-label', { body });
  if (data) return data;
  try { return (await error?.context?.json?.()) || { ok: false, error: error?.message }; } catch { return { ok: false, error: error?.message }; }
}
const hasLiveLabel = (o) => o.label?.transaction_id && !o.label.test && !o.label.refund_status;

export default function BulkShip({ orders, items, onDone }) {
  const pieces = useMemo(() => {
    const m = new Map();
    for (const i of items) m.set(i.product_handle, i.title);
    return [...m.entries()];
  }, [items]);
  const [ready, setReady] = useState(() => new Set());
  const [test, setTest] = useState(true);
  const [quotes, setQuotes] = useState(null); // [{ order, rate, error }]
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState('');

  const itemsOf = (o) => items.filter((i) => i.order_id === o.id);
  const plan = useMemo(() => {
    const rows = orders.filter((o) => o.status === 'paid').map((o) => {
      const its = itemsOf(o);
      let skip = '';
      if (hasLiveLabel(o)) skip = 'already has a label';
      else if (!o.shipping?.line1) skip = 'no address';
      else if (Number(o.balance_due) > 0 && o.balance_status !== 'paid') skip = 'balance unpaid';
      else if (!its.length || !its.every((i) => ready.has(i.product_handle))) skip = 'waiting on a piece';
      return { o, its, skip };
    });
    return { go: rows.filter((r) => !r.skip), skipped: rows.filter((r) => r.skip) };
  }, [orders, items, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  async function price() {
    setBusy('price'); setResults([]);
    const out = [];
    for (const { o } of plan.go) {
      const r = await callLabel({ action: 'rates', order_id: o.id, test });
      const rate = r?.ok ? (r.rates.find((x) => x.id === r.recommended) || r.rates[0]) : null;
      out.push({ order: o, rate, error: r?.ok ? (rate ? '' : 'no rates') : (r?.gaps ? `setup missing: ${r.gaps.join(', ')}` : r?.error || 'failed') });
      setQuotes([...out]);
    }
    setBusy('');
  }

  async function buy() {
    const list = (quotes || []).filter((q) => q.rate);
    const total = list.reduce((s, q) => s + Number(q.rate.amount), 0);
    if (!list.length) return;
    if (!test && !window.confirm(`Buy ${list.length} REAL labels for about $${total.toFixed(2)}? Shippo charges your account, each order is marked shipped and every customer gets their tracking email.`)) return;
    setBusy('buy');
    const out = [];
    for (const q of list) {
      const r = await callLabel({ action: 'buy', order_id: q.order.id, rate_id: q.rate.id, test });
      out.push({ order: q.order, ok: r?.ok, url: r?.label?.url, tracking: r?.label?.tracking_number, error: r?.ok ? '' : r?.error || 'failed' });
      setResults([...out]);
    }
    setBusy('');
    setQuotes(null);
    onDone?.();
  }

  const total = (quotes || []).reduce((s, q) => s + (q.rate ? Number(q.rate.amount) : 0), 0);
  const num = (o) => String(o.id).slice(0, 8).toUpperCase();

  return (
    <div className="ship-panel" style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 12.5, color: 'var(--silver)', margin: '0 0 10px' }}>
        Tick the pieces you have in hand. Orders where every piece is ticked are ready; combined orders wait for their last piece.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        {pieces.length === 0 && <span className="empty-note">No paid orders yet.</span>}
        {pieces.map(([h, title]) => (
          <label key={h} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={ready.has(h)}
              onChange={(e) => { const n = new Set(ready); e.target.checked ? n.add(h) : n.delete(h); setReady(n); setQuotes(null); }} />
            {title}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        <b>{plan.go.length}</b> ready to ship
        {plan.skipped.length > 0 && <span style={{ color: 'var(--silver)' }}> · {plan.skipped.length} not yet ({[...new Set(plan.skipped.map((r) => r.skip))].join(', ')})</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={test} onChange={(e) => { setTest(e.target.checked); setQuotes(null); }} />
          Test labels (free, fake — nothing changes on the orders)
        </label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !plan.go.length} onClick={price}>
          {busy === 'price' ? `Pricing ${quotes?.length || 0}/${plan.go.length}…` : `Price ${plan.go.length} label${plan.go.length === 1 ? '' : 's'}`}
        </button>
        {quotes && !busy && quotes.some((q) => q.rate) && (
          <button type="button" className="btn btn-sm" onClick={buy}>
            {test ? 'Buy test labels' : `Buy ${quotes.filter((q) => q.rate).length} labels · $${total.toFixed(2)}`}
          </button>
        )}
        {busy === 'buy' && <span style={{ fontSize: 12 }}>Buying {results.length}/{(quotes || []).filter((q) => q.rate).length}…</span>}
      </div>

      {quotes && (
        <table className="admin-table" style={{ marginTop: 10 }}>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.order.id}>
                <td style={{ fontFamily: 'monospace' }}>{num(q.order)}</td>
                <td>{q.order.shipping?.name} · {q.order.shipping?.city} {q.order.shipping?.state}</td>
                <td>{q.rate ? `${q.rate.carrier} ${q.rate.service} — $${q.rate.amount}` : <span style={{ color: '#e8a0a3' }}>{q.error}</span>}</td>
                <td style={{ fontSize: 11.5, color: 'var(--silver)' }}>{q.order.shipping_quote?.paid_cents != null ? `paid $${(q.order.shipping_quote.paid_cents / 100).toFixed(2)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>{results.filter((r) => r.ok).length} of {results.length} labels bought{test ? ' (test)' : ''}</b>
          {results.some((r) => r.url) && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}
              onClick={() => results.filter((r) => r.url).forEach((r) => window.open(r.url, '_blank', 'noopener'))}>
              Open all PDFs
            </button>
          )}
          <ul style={{ fontSize: 12.5, margin: '8px 0 0', paddingLeft: 18 }}>
            {results.map((r) => (
              <li key={r.order.id}>
                {num(r.order)} — {r.ok ? <><a href={r.url} target="_blank" rel="noopener noreferrer">label PDF</a> · {r.tracking}</> : <span style={{ color: '#e8a0a3' }}>{r.error}</span>}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11.5, color: 'var(--silver)', margin: '6px 0 0' }}>“Open all” may need pop-ups allowed for this site. Every label also stays on its order (Orders → Label).</p>
        </div>
      )}
    </div>
  );
}
