import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminListProducts, adminListOrders, adminListSignups, adminListSms, isLive } from './adminData';
import { totalStock } from '../lib/catalog';
import reviewSeed from '../data/imported-reviews.json';

/* tiny bar chart — pure divs, no library */
function Bars({ data, color = 'var(--red)', height = 44, label }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div aria-label={label}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
        {data.map((d, i) => (
          <div key={i} title={`${d.k}: ${d.v}`} style={{
            flex: 1, minWidth: 4, height: `${Math.max(3, (d.v / max) * 100)}%`,
            background: d.v ? color : 'rgba(232,226,212,0.12)', borderRadius: '2px 2px 0 0',
          }} />
        ))}
      </div>
    </div>
  );
}

/* horizontal ranking bars */
function RankBars({ rows, color = 'var(--green)', fmt = (v) => v }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--bone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{r.k}</span>
            <b style={{ color: 'var(--bone)' }}>{fmt(r.v)}</b>
          </div>
          <div style={{ height: 6, background: 'rgba(232,226,212,0.08)', borderRadius: 3 }}>
            <div style={{ width: `${(r.v / max) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [signups, setSignups] = useState([]);
  const [sms, setSms] = useState([]);

  useEffect(() => {
    adminListProducts().then(setProducts);
    adminListOrders().then(setOrders);
    adminListSignups().then(setSignups);
    adminListSms().then(setSms);
  }, []);

  /* 14-day revenue pulse: paid orders bucketed per day → inline SVG sparkline */
  const paidish = orders.filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const buckets = days.map((d) => paidish
    .filter((o) => {
      const t = new Date(o.created_at || 0);
      return t >= d && t < new Date(d.getTime() + 864e5);
    })
    .reduce((s, o) => s + Number(o.total || 0), 0));
  const maxB = Math.max(...buckets, 1);
  const points = buckets.map((v, i) => `${(i / 13) * 280},${40 - (v / maxB) * 36}`).join(' ');
  const todayRev = buckets[13];
  const weekRev = buckets.slice(7).reduce((s, v) => s + v, 0);

  /* list growth: signups (email + sms) per day, last 14 */
  const growth = days.map((d) => ({
    k: `${d.getMonth() + 1}/${d.getDate()}`,
    v: [...signups, ...sms].filter((r) => {
      const t = new Date(r.created_at || 0);
      return t >= d && t < new Date(d.getTime() + 864e5);
    }).length,
  }));

  /* what actually sells: revenue per product from paid orders */
  const byProduct = {};
  orders.filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status)).forEach((o) => {
    (o.order_items || o.items || []).forEach((it) => {
      const k = it.title || it.product_handle || it.handle || '?';
      byProduct[k] = (byProduct[k] || 0) + Number(it.price || 0) * Number(it.qty || 1);
    });
  });
  const topProducts = Object.entries(byProduct).map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v).slice(0, 5);

  /* the review wall at a glance (all 296 real reviews) */
  const starSpread = [5, 4, 3, 2, 1].map((s) => ({ k: `${s}★`, v: reviewSeed.filter((r) => r.stars === s).length }));

  const active = products.filter((p) => p.status !== 'archived');
  const lowStockItems = active.filter((p) => totalStock(p) > 0 && totalStock(p) <= 8);
  const soldOut = active.filter((p) => totalStock(p) === 0);
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered');
  const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
  const pending = orders.filter((o) => o.status === 'pending');
  const refundRequests = orders.filter((o) => o.status === 'refund_requested');

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Dashboard</h1>
        <span className={`admin-mode ${isLive ? 'live' : ''}`}>{isLive ? 'LIVE — Supabase connected' : 'DEMO MODE — data is local to this browser'}</span>
      </div>

      {typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches && (
        <div className="note-banner warn">
          <b>This device is hiding the storefront's animations.</b> Windows has "Animation effects" turned off,
          so browsers on THIS computer show the simplified no-motion version of the site — customers on normal
          devices see the full cinematic experience. To see it yourself: Windows Settings → Accessibility →
          Visual effects → turn ON <b>Animation effects</b>, then refresh the store.
        </div>
      )}
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Product edits save to this browser only. Follow the README to connect
          Supabase — then products, orders, customers and campaigns all go live, and this banner disappears.
        </div>
      )}
      {refundRequests.length > 0 && (
        <div className="note-banner warn">
          <b>{refundRequests.length} refund request{refundRequests.length > 1 ? 's' : ''}</b> waiting in <Link to="/admin/orders" style={{ textDecoration: 'underline' }}>Orders</Link>.
        </div>
      )}

      <div className="stat-card" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
        <svg width="280" height="44" viewBox="0 0 280 44" aria-label="Revenue, last 14 days" style={{ flexShrink: 0 }}>
          <polyline points={points} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div>
          <div className="lbl">Last 14 days</div>
          <div className="sub">Today <b style={{ color: 'var(--bone)' }}>${todayRev.toFixed(0)}</b> · 7-day <b style={{ color: 'var(--bone)' }}>${weekRev.toFixed(0)}</b></div>
        </div>
        {paidish.length === 0 && <span className="sub">No paid orders yet — the line lights up with the first sale.</span>}
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="lbl">Revenue (paid)</div>
          <div className="val">${revenue.toFixed(0)}</div>
          <div className="sub">{paid.length} paid orders</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Pending orders</div>
          <div className="val">{pending.length}</div>
          <div className="sub">started checkout, not paid</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Email list</div>
          <div className="val">{signups.length}</div>
          <div className="sub">across gate, popup, footer, checkout</div>
        </div>
        <div className={`stat-card ${lowStockItems.length + soldOut.length > 0 ? 'warn' : ''}`}>
          <div className="lbl">Stock alerts</div>
          <div className="val">{lowStockItems.length + soldOut.length}</div>
          <div className="sub">{soldOut.length} sold out · {lowStockItems.length} low</div>
        </div>
      </div>

      <div className="stat-cards" style={{ marginTop: 18 }}>
        <div className="stat-card">
          <div className="lbl">List growth — 14 days</div>
          <div style={{ margin: '12px 0 6px' }}>
            <Bars data={growth} label="Signups per day, last 14 days" />
          </div>
          <div className="sub">{growth.reduce((s, d) => s + d.v, 0)} new contacts · {signups.length} emails · {sms.length} phones total</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Top sellers by revenue</div>
          <div style={{ margin: '12px 0 6px' }}>
            {topProducts.length
              ? <RankBars rows={topProducts} fmt={(v) => `$${v.toFixed(0)}`} />
              : <span className="sub">Lights up with the first paid order.</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="lbl">Review wall — {reviewSeed.length} verified</div>
          <div style={{ margin: '12px 0 6px' }}>
            <RankBars rows={starSpread} color="var(--red)" />
          </div>
          <div className="sub">avg {(reviewSeed.reduce((s, r) => s + r.stars, 0) / reviewSeed.length).toFixed(1)}★ across every product</div>
        </div>
      </div>

      <div className="section-head" style={{ marginBottom: 16, marginTop: 26 }}><h2 className="display" style={{ fontSize: 18 }}>Inventory Watch</h2></div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th></th><th>Product</th><th>Total units</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {active.map((p) => {
              const t = totalStock(p);
              return (
                <tr key={p.handle}>
                  <td><img src={p.images[0]} alt="" /></td>
                  <td>{p.title}</td>
                  <td>{t}</td>
                  <td>
                    {t === 0 ? <span className="pill warn">Sold out</span>
                      : t <= 8 ? <span className="pill warn">Low — {t} left</span>
                      : <span className="pill ok">In stock</span>}
                  </td>
                  <td><Link className="btn btn-ghost btn-sm" to={`/admin/products/${p.handle}`}>Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
