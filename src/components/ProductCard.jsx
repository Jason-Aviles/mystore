import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { lowStock, totalStock, soldOut, sizeAvailability } from '../lib/catalog';
import { SHOPIFY_RATING_COUNTS, productAvg } from '../lib/reviews';
import { Heart } from './Icons';
import Reveal from './Reveal';

export default function ProductCard({ p }) {
  const { money, wishlist, toggleWish, showToast, setQuickView, CONFIG, isPreorder } = useStore();
  const pre = isPreorder(p);
  const wished = wishlist.includes(p.handle);
  const low = lowStock(p, CONFIG.lowStockThreshold); // same threshold the admin set — card and PDP can't disagree
  const off = p.compare && p.compare > p.price ? Math.round((1 - p.price / p.compare) * 100) : 0;
  const gone = soldOut(p);
  // honest scarcity: bar length is the real unit count against a full run of 10+
  const stock = totalStock(p);
  const sizes = sizeAvailability(p); // [inStock, total] for single-option products

  return (
    <Reveal as="article" className={`pcard ${gone ? 'pc-gone' : ''}`} data-flip-id={p.handle}>
      <div className={`media ${p.images[1] ? 'flip3d' : ''}`}>
        <div className="flip-inner">
          <img className="primary" src={p.images[0]} alt={p.title} loading="lazy" />
          {p.images[1] && <img className="alt" src={p.images[1]} alt="" loading="lazy" />}
        </div>
        <div className="badges">
          {gone
            ? <span className="badge">Sold out</span>
            : pre
              ? <span className="badge red">Preorder</span>
              : p.tag === 'DROP 002'
                ? <span className="badge red">Drop 002</span>
                : off > 0 && <span className="badge">Sale −{off}%</span>}
        </div>
        <button
          className={`wish ${wished ? 'on' : ''}`}
          aria-label={`Save ${p.title}`}
          onClick={() => { const on = toggleWish(p.handle); showToast(on ? 'Saved to your list' : 'Removed from saved'); }}
        >
          <Heart fill={wished} />
        </button>
        {!gone && <button className="pc-quick" aria-label={`Quick view ${p.title}`} onClick={() => setQuickView(p.handle)}>+</button>}
        <span className="pc-cta" aria-hidden="true">View piece</span>
      </div>
      <div className="info">
        <div className="row">
          <span className="cat">{p.collection}</span>
          {SHOPIFY_RATING_COUNTS[p.handle] > 0 && (
            <span className="card-rating">★ {productAvg(p.handle)} ({SHOPIFY_RATING_COUNTS[p.handle]})</span>
          )}
        </div>
        <h3><Link to={`/product/${p.handle}`}>{p.title}</Link></h3>
        <div className="price">
          {money(p.price)}
          {off > 0 && <><s>{money(p.compare)}</s></>}
        </div>
        {gone ? (
          <div className="run-note">Sold through — never reprinted</div>
        ) : pre ? (
          // preorder truth on the card too — never "in stock" language
          <div className="run-note">Made after the preorder closes</div>
        ) : low ? (
          <div className="stock-meter" aria-label={`Only ${low} left`}>
            <span className="fill" style={{ width: `${Math.min(100, (low / 10) * 100)}%` }} />
            <em>Only {low} left — no restock</em>
          </div>
        ) : sizes && sizes[0] < sizes[1] ? (
          // some sizes gone: say exactly how many remain — real availability
          <div className="run-note">{sizes[0]} of {sizes[1]} sizes in stock</div>
        ) : stock > 0 ? (
          <div className="run-note">One run · never reprinted</div>
        ) : null}
      </div>
    </Reveal>
  );
}
