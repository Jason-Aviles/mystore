import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { Bag, Heart, Menu, Search } from './Icons';
import MegaMenu from './MegaMenu';
import SearchOverlay from './SearchOverlay';

const LINKS = [
  ['/', 'Home'],
  ['/shop', 'Shop All'],
  ['/drop', 'The Drop'],
  ['/collection/essentials', 'Essentials'],
  ['/contact', 'Support'],
];

/* live "sale ends in" chip — renders only when the admin sets a real end
   date in Site Settings, so the urgency is never fabricated */
function SaleCountdown({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const d = new Date(endsAt).getTime() - now;
  if (Number.isNaN(d) || d <= 0) return null;
  const h = Math.floor(d / 36e5);
  const m = Math.floor(d / 6e4) % 60;
  return <span className="annc-count">&nbsp;·&nbsp; Sale ends in <b>{h > 48 ? `${Math.floor(h / 24)} days` : `${h}h ${String(m).padStart(2, '0')}m`}</b></span>;
}

export default function Header() {
  const { cartCount, setCartOpen, CONFIG } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const nav = useNavigate();
  const badgeRef = useRef(null);
  const firstCount = useRef(true);
  const topRef = useRef(null);

  /* fixed chrome: publish its real height so smooth-content pads under it */
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--top-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* cart badge pops when the count changes */
  useGSAP(() => {
    if (firstCount.current) { firstCount.current = false; return; }
    if (!badgeRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(badgeRef.current, { scale: 1.7 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', overwrite: 'auto', clearProps: 'transform' });
  }, { dependencies: [cartCount] });

  return (
    <>
      <div className="site-top" ref={topRef}>
      <div className="annc">
        {CONFIG.anncText
          ? CONFIG.anncText
          : CONFIG.dropMode !== false
            ? (() => {
                // date-aware status so it never reads like a "loading" bug or
                // a stale countdown: upcoming date → "coming soon", otherwise
                // just the drop name (no misleading status word)
                const t = CONFIG.dropDate ? Date.parse(CONFIG.dropDate) : NaN;
                const status = !Number.isNaN(t) && t > Date.now() ? ' — coming soon' : '';
                return <>Free US shipping over <b>${CONFIG.freeShipThreshold}</b> &nbsp;·&nbsp; {CONFIG.dropName}{status}</>;
              })()
            : <>Free US shipping over <b>${CONFIG.freeShipThreshold}</b> &nbsp;·&nbsp; One run. Never reprinted.</>}
        {CONFIG.saleEndsAt && <SaleCountdown endsAt={CONFIG.saleEndsAt} />}
      </div>
      <header className="site-header">
        <div className="wrap bar">
          <button className="icon-btn nav-toggle" aria-label="Open menu" aria-expanded={menuOpen}
            data-cursor="open" onClick={() => setMenuOpen(true)}><Menu /></button>
          <Link className="logo" to="/"><span className="logo-mark" aria-hidden="true" />Dark <em>Divine</em></Link>
          <nav className="main-nav" aria-label="Main">
            {LINKS.filter(([to]) => to !== '/drop' || CONFIG.dropMode !== false).map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="roll"><span data-text={label}>{label}</span></span>
              </NavLink>
            ))}
          </nav>
          <div className="head-actions">
            <button className="icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}><Search /></button>
            <button className="icon-btn" aria-label="Saved items" onClick={() => nav('/shop?c=saved')}><Heart /></button>
            <button className="icon-btn" aria-label="Open cart" onClick={() => setCartOpen(true)}>
              <Bag />
              {cartCount > 0 && <span className="cart-count" ref={badgeRef}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>
      </div>
      <MegaMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
