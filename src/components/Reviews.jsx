import { useEffect, useMemo, useState } from 'react';
import { fetchReviews, submitReview, avgStars } from '../lib/reviews';
import { Check } from './Icons';

export function Stars({ n, size = 13 }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${n} out of 5 stars`}>
      {'★'.repeat(n)}<span className="dim">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/* the option list that means "size" for this product, if any —
   used to let reviewers volunteer which size they bought */
function sizeOptions(p) {
  if (!p?.optionNames) return null;
  const i = p.optionNames.findIndex((n) => /size/i.test(n || ''));
  if (i === -1) return null;
  return i === 0 ? p.options1 : p.options2;
}

export function ReviewForm({ productHandle, product = null, products = [], onDone, compact = false }) {
  const [form, setForm] = useState({ product_handle: productHandle || '', name: '', email: '', stars: 5, body: '', size: '' });
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const sizes = sizeOptions(product);

  async function submit(e) {
    e.preventDefault();
    setState('busy');
    const { size, ...rest } = form;
    const res = await submitReview({ ...rest, meta: size ? { size } : {} });
    if (!res.ok) { setState('error'); setErr(res.error || 'Something went wrong.'); return; }
    setState('done');
    onDone?.();
  }

  if (state === 'done') {
    return (
      <div className="review-thanks">
        <Stars n={form.stars} size={16} />
        <p>Appreciate you. Your review goes live as soon as it clears moderation — usually same day.</p>
      </div>
    );
  }

  return (
    <form className="review-form" onSubmit={submit}>
      {!productHandle && products.length > 0 && (
        <div>
          <label className="rf-lbl" htmlFor="rf-product">What did you cop?</label>
          <select id="rf-product" name="product-handle" required value={form.product_handle} onChange={(e) => set('product_handle', e.target.value)}>
            <option value="" disabled>Pick the piece</option>
            {products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="rf-lbl" id="rf-stars-lbl">Your rating</label>
        <div className="star-picker" role="radiogroup" aria-labelledby="rf-stars-lbl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={form.stars === n}
              className={n <= form.stars ? 'on' : ''}
              onClick={() => set('stars', n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
          ))}
        </div>
      </div>
      <div className={compact ? '' : 'rf-row'}>
        <input type="text" name="reviewer-name" required placeholder="Name (shown with your review)" aria-label="Name" autoComplete="name"
          value={form.name} onChange={(e) => set('name', e.target.value)} />
        <input type="email" name="reviewer-email" placeholder="Order email (adds the Verified badge)" aria-label="Order email" autoComplete="email" spellCheck="false"
          value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      {sizes && (
        <div>
          <label className="rf-lbl" htmlFor="rf-size">Size you bought (optional — helps others pick)</label>
          <select id="rf-size" name="size" value={form.size} onChange={(e) => set('size', e.target.value)}>
            <option value="">Prefer not to say</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      <textarea name="review" required rows="3" placeholder="How's the fit? The fabric? Would you cop again?" aria-label="Your review"
        value={form.body} onChange={(e) => set('body', e.target.value)} />
      <button className="btn" type="submit" disabled={state === 'busy'}>
        {state === 'busy' ? 'Posting…' : 'Post Review'}
      </button>
      {state === 'error' && <p style={{ color: '#e8a0a3', fontSize: 12 }}>{err}</p>}
    </form>
  );
}

export function ReviewCard({ r }) {
  return (
    <div className="review">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <Stars n={r.stars} />
        {r.created_at && <span style={{ fontSize: 11, color: 'var(--silver)' }}>{new Date(r.created_at).toLocaleDateString()}</span>}
      </div>
      {r.title && <b style={{ fontSize: 13, letterSpacing: '0.04em' }}>{r.title}</b>}
      <p>“{r.body}”</p>
      <div className="who">
        <b>{r.name}</b>
        {r.meta?.size && <span className="rv-size">Size {r.meta.size}</span>}
        {r.verified && <span className="verified"><Check /> Verified buyer</span>}
      </div>
    </div>
  );
}

/* star distribution from the real review set — no invented spread */
function Histogram({ reviews }) {
  const total = reviews.length;
  if (!total) return null;
  const counts = [5, 4, 3, 2, 1].map((n) => [n, reviews.filter((r) => r.stars === n).length]);
  return (
    <div className="rv-histo" aria-label="Rating breakdown">
      {counts.map(([n, c]) => (
        <div className="rv-row" key={n}>
          <span className="rv-n">{n}★</span>
          <span className="rv-bar"><i style={{ width: `${(c / total) * 100}%` }} /></span>
          <span className="rv-c">{c}</span>
        </div>
      ))}
    </div>
  );
}

/** PDP review block: your real Judge.me reviews + live submissions.
    Balanced by design — sort controls include "lowest first" and nothing
    hides critical reviews once they clear moderation. */
const PAGE = 9;
export function ProductReviews({ p }) {
  const [reviews, setReviews] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [sort, setSort] = useState('newest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const load = () => fetchReviews(p.handle).then(setReviews);
  useEffect(() => { load(); setShown(PAGE); setSort('newest'); setVerifiedOnly(false); }, [p.handle]);

  const avg = avgStars(reviews);
  const list = useMemo(() => {
    let l = verifiedOnly ? reviews.filter((r) => r.verified) : reviews.slice();
    if (sort === 'newest') l.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'highest') l.sort((a, b) => b.stars - a.stars);
    else if (sort === 'lowest') l.sort((a, b) => a.stars - b.stars);
    return l;
  }, [reviews, sort, verifiedOnly]);

  return (
    <section className="section" style={{ paddingTop: 0 }} id="reviews">
      <div className="wrap">
        <div className="section-head split">
          <div>
            <span className="eyebrow">From The Buyers</span>
            <h2 style={{ fontSize: 'clamp(20px,3vw,30px)' }}>Reviews{reviews.length > 0 && ` (${reviews.length})`}</h2>
            {avg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <Stars n={Math.round(avg)} size={15} />
                <span style={{ fontSize: 13, color: 'var(--bone-dim)' }}><b style={{ color: 'var(--bone)' }}>{avg}</b> average</span>
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : 'Write a review'}
          </button>
        </div>
        {reviews.length > 0 && <Histogram reviews={reviews} />}
        {showForm && <div style={{ maxWidth: 560, marginBottom: 30 }}><ReviewForm productHandle={p.handle} product={p} onDone={load} /></div>}
        {reviews.length > 0 ? (
          <>
            <div className="rv-tools">
              <select name="review-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort reviews">
                <option value="newest">Most recent</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>
              <label className="rv-verified">
                <input type="checkbox" name="verified-only" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
                Verified buyers only
              </label>
            </div>
            <div className="review-grid">{list.slice(0, shown).map((r) => <ReviewCard key={r.id} r={r} />)}</div>
            {shown < list.length && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShown((s) => s + PAGE * 2)}>
                  Show more ({list.length - shown} remaining)
                </button>
              </div>
            )}
          </>
        ) : (
          !showForm && <p className="empty-note" style={{ padding: '10px 0' }}>No reviews on this piece yet. Copped it? Be the first — reviews post with a Verified badge when your order email matches.</p>
        )}
      </div>
    </section>
  );
}
