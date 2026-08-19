import { useEffect, useState } from 'react';
import { adminListReviews, adminSetApproved, adminDeleteReview, adminAddReview } from '../lib/reviews';
import { isLive, adminListProducts } from './adminData';

const EMPTY = { product_handle: '', name: '', email: '', stars: 5, size: '', body: '', approved: true };

export default function ReviewsAdmin() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [products, setProducts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => adminListReviews().then(setRows);
  useEffect(() => { load(); adminListProducts().then(setProducts).catch(() => {}); }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submitReview(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await adminAddReview(form);
    setBusy(false);
    if (!res.ok) { setMsg(res.error || 'Could not save.'); return; }
    setMsg(res.verified ? 'Added — email matched an order, so it shows Verified.' : 'Added.');
    setForm(EMPTY);
    setAdding(false);
    load();
  }

  const visible = filter === 'all' ? rows
    : filter === 'pending' ? rows.filter((r) => !r.approved)
    : rows.filter((r) => r.approved);

  async function approve(r, approved) { await adminSetApproved(r.id, approved); load(); }
  async function remove(r) {
    if (!window.confirm(`Delete this review by ${r.name}? No undo.`)) return;
    await adminDeleteReview(r.id);
    load();
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Reviews</h1>
        <button className="btn btn-sm" onClick={() => { setAdding((a) => !a); setMsg(''); }}>{adding ? 'Close' : '+ Add a review'}</button>
      </div>

      {adding && (
        <form className="admin-form review-add" onSubmit={submitReview} style={{ maxWidth: 640, marginBottom: 20 }}>
          <div className="note-banner" style={{ marginTop: 0 }}>
            <b>Only for real reviews a customer actually gave you</b> — a DM, an email, in person — entered in their words.
            The <b>Verified</b> badge appears only if their email matches a real order; it can’t be set by hand. Please don’t invent reviews.
          </div>
          <label>Product
            <select value={form.product_handle} onChange={(e) => setF('product_handle', e.target.value)}>
              <option value="">— general / no specific product —</option>
              {products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: 1 }}>Customer name<input required value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="How they want to be credited" /></label>
            <label style={{ width: 90 }}>Rating
              <select value={form.stars} onChange={(e) => setF('stars', Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: 1 }}>Their email (optional)<input type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} placeholder="Only to auto-verify against an order" /></label>
            <label style={{ width: 110 }}>Size (optional)<input value={form.size} onChange={(e) => setF('size', e.target.value)} placeholder="e.g. M" /></label>
          </div>
          <label>Review<textarea required rows={3} value={form.body} onChange={(e) => setF('body', e.target.value)} placeholder="Their words, verbatim" /></label>
          <label className="consent-row" style={{ margin: '2px 0' }}>
            <input type="checkbox" checked={form.approved} onChange={(e) => setF('approved', e.target.checked)} />
            <span>Publish immediately (uncheck to hold as pending)</span>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add review'}</button>
            {msg && <span style={{ fontSize: 12, color: 'var(--silver)' }}>{msg}</span>}
          </div>
        </form>
      )}
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Reviews submitted in this browser show here. Once Supabase is connected:
          run <b>npm run import:reviews</b> with your review-app CSV export (Judge.me / Loox) to bring
          your 500+ Shopify reviews over — they import pre-approved and go live instantly.
        </div>
      )}
      <div className="filter-bar">
        {['pending', 'approved', 'all'].map((f) => (
          <button key={f} className={filter === f ? 'sel' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="empty-note">No {filter === 'all' ? '' : filter + ' '}reviews. New ones arrive after every purchase — buyers are prompted on the thank-you page.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Rating</th><th>Review</th><th>Customer</th><th>Product</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{'★'.repeat(r.stars)}</td>
                  <td style={{ maxWidth: 340 }}>{r.title && <b>{r.title}<br /></b>}{r.body}</td>
                  <td>
                    {r.name}
                    {r.verified && <div><span className="pill ok">Verified</span></div>}
                    {r.email && <div style={{ fontSize: 11, color: 'var(--silver)' }}>{r.email}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.product_handle || '—'}</td>
                  <td>{r.approved ? <span className="pill ok">Live</span> : <span className="pill warn">Pending</span>}</td>
                  <td className="actions">
                    {r.approved
                      ? <button className="btn btn-ghost btn-sm" onClick={() => approve(r, false)}>Unpublish</button>
                      : <button className="btn btn-sm" onClick={() => approve(r, true)}>Approve</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button>
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
