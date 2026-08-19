import { useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { Flip, reducedMotion } from '../lib/motion';
import { SHOPIFY_RATING_COUNTS, productAvg } from '../lib/reviews';
import ProductCard from '../components/ProductCard';
import ScrollSerpent from '../components/ScrollSerpent';

const FILTERS = [
  ['all', 'All'],
  ['bundle', 'The Drop'],
  ['jersey', 'Jerseys'],
  ['pants', 'Pants'],
  ['essentials', 'Essentials'],
  ['saved', 'Saved ♥'],
];
const TITLES = { all: 'Shop All', bundle: 'The Drop', jersey: 'Jerseys', pants: 'Pants', essentials: 'Essentials', saved: 'Saved Pieces' };

/* survives the route change between chip click and re-render */
const flipState = { current: null };

export default function Shop() {
  const { products, wishlist, loading, CONFIG } = useStore();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const active = slug || params.get('c') || 'all';
  const gridRef = useRef(null);
  const barRef = useRef(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');

  const items = useMemo(() => {
    let list = active === 'all' ? products
      : active === 'saved' ? products.filter((p) => wishlist.includes(p.handle))
      : products.filter((p) => p.category === active);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => `${p.title} ${p.collection} ${p.category} ${p.tag || ''}`.toLowerCase().includes(q));
    }
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === 'newest') list = [...list].sort((a, b) => (b.newArrival === true) - (a.newArrival === true));
    // both backed by real data: the merchant's bestseller flag, and the
    // imported verified-review averages (unreviewed products rank last)
    else if (sort === 'best-selling') list = [...list].sort((a, b) => (b.bestseller === true) - (a.bestseller === true));
    else if (sort === 'top-rated') list = [...list].sort((a, b) => (Number(productAvg(b.handle)) || 0) - (Number(productAvg(a.handle)) || 0));
    return list;
  }, [products, wishlist, active, query, sort]);
  const hasRatings = useMemo(() => products.some((p) => SHOPIFY_RATING_COUNTS[p.handle] > 0), [products]);

  function pick(c) {
    // capture where every card is BEFORE the route swaps the list
    if (!reducedMotion() && gridRef.current) {
      flipState.current = Flip.getState(gridRef.current.querySelectorAll('[data-flip-id]'));
    }
    if (!reducedMotion() && gridRef.current) {
      // crash-zoom: the grid punches in and settles as the set changes
      gsap.fromTo(gridRef.current, { scale: 1.14, skewX: 0.6, opacity: 0.7 },
        { scale: 1, skewX: 0, opacity: 1, duration: 0.55, ease: 'power3.out', clearProps: 'all' });
    }
    nav(c === 'all' ? '/shop' : `/collection/${c}`);
  }

  /* cards glide to their new slots; newcomers rise in */
  useGSAP(() => {
    if (!flipState.current || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('[data-flip-id]');
    gsap.set(cards, { transition: 'none', opacity: 1, y: 0 });
    cards.forEach((c) => c.classList.add('in'));
    Flip.from(flipState.current, {
      targets: cards,
      duration: 0.75,
      ease: 'power3.inOut',
      stagger: 0.015,
      absolute: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 40, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.04, ease: 'power3.out' }),
    });
    flipState.current = null;
  }, { scope: gridRef, dependencies: [active, items.length] });

  /* the ink bar slides under the active chip */
  useGSAP(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ink = bar.querySelector('.chip-ink');
    const chip = bar.querySelector('button.sel');
    if (!ink || !chip) return;
    gsap.to(ink, {
      x: chip.offsetLeft, y: chip.offsetTop, width: chip.offsetWidth, height: chip.offsetHeight,
      duration: reducedMotion() ? 0 : 0.45, ease: 'power3.out',
    });
  }, { scope: barRef, dependencies: [active] });

  return (
    <>
      <ScrollSerpent variant="quiet" />
      <section className="page-head mesh">
        <div className="wrap">
          <span className="eyebrow">The Catalog</span>
          <h1 data-fx="guillotine" key={active}>{TITLES[active] || 'Shop All'}</h1>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 34 }}>
        <div className="wrap">
          <div className="filter-bar" role="tablist" aria-label="Filter products" ref={barRef}>
            <span className="chip-ink" aria-hidden="true" />
            {FILTERS.map(([c, label]) => (
              <button key={c} className={active === c ? 'sel' : ''} onClick={() => pick(c)}>{label}</button>
            ))}
          </div>
          <div className="shop-tools">
            <input type="search" placeholder="Search pieces…" aria-label="Search products"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="count" aria-live="polite">{items.length} piece{items.length === 1 ? '' : 's'}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="best-selling">Best selling</option>
              {hasRatings && <option value="top-rated">Top rated</option>}
              <option value="price-asc">Price: low → high</option>
              <option value="price-desc">Price: high → low</option>
            </select>
          </div>
          <div className={`grid g4 ${active === 'all' && !query ? 'rhythm' : ''}`} ref={gridRef} data-fx-grid>
            {items.map((p, i) => {
              const card = <ProductCard key={p.handle} p={p} />;
              // editorial rhythm: a wide campaign tile breaks the grid after the 4th piece
              if (i === 3 && active === 'all' && !query) {
                return [card, (
                  <figure className="grid-ed" key="ed-1" aria-hidden="true" data-fx="kenBurns">
                    <img src={CONFIG.shopCampaignImage || '/content/couch-couple.webp'} alt="" loading="lazy" />
                    <figcaption>Cut once. Worn forever.{CONFIG.dropMode !== false && <em> — {CONFIG.dropName}</em>}</figcaption>
                  </figure>
                )];
              }
              return card;
            })}
          </div>
          {!loading && items.length === 0 && (
            <p className="empty-note">
              {active === 'saved' && !query
                ? 'Nothing saved yet. Tap the heart on any piece to keep it here.'
                : <>Nothing matches “{query}”. Try a different word or <button className="link-btn" onClick={() => setQuery('')}>clear the search</button>.</>}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
