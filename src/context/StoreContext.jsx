import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { fetchProducts, money, variantQty } from '../lib/catalog';
import { DEFAULT_CONFIG, fetchSiteSettings } from '../lib/config';
import { mergeHomepage } from '../lib/homeContent';
import { initMetaPixel, metaTrack } from '../lib/meta';
import { fetchCurrentCampaign, readUnlock, saveUnlock, isPreorderProduct } from '../lib/preorder';
import { MOTION_STORAGE_KEY, readSavedMotionPause, resolveMotionPaused } from '../lib/motionPreference';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const ls = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export function StoreProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(() => ls.get('dd_cart', []));
  const [wishlist, setWishlist] = useState(() => ls.get('dd_wish', []));
  const [recent, setRecent] = useState(() => ls.get('dd_recent', []));
  const [unlocked, setUnlocked] = useState(() => {
    let inSession = false;
    try { inSession = Boolean(sessionStorage.getItem('dd_access')); } catch { /* private mode */ }
    // a campaign unlock counts only until its preorder closes — readUnlock
    // drops expired ones, so access genuinely ends with the campaign
    return Boolean(ls.get('dd_access', 0)) || inSession || Boolean(readUnlock());
  });
  const [campaign, setCampaign] = useState(null); // current preorder campaign (live or coming soon)
  const [subscribed, setSubscribed] = useState(() => Boolean(ls.get('dd_subscribed', 0)));
  const [cartOpen, setCartOpen] = useState(false);
  const [quickView, setQuickView] = useState(null); // product handle or null
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState({});
  const [userMotionPaused, setUserMotionPaused] = useState(readSavedMotionPause);
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const motionPaused = resolveMotionPaused(userMotionPaused, systemReducedMotion);

  // admin-saved overrides merge over the shipped defaults
  const CONFIG = useMemo(() => ({
    ...DEFAULT_CONFIG,
    ...settings,
    homepage: mergeHomepage(settings.homepage),
  }), [settings]);

  useEffect(() => { fetchSiteSettings().then(setSettings).catch(() => {}); }, []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('motion-paused', motionPaused);
    if (motionPaused) document.querySelectorAll('video').forEach((video) => video.pause());
    return () => document.documentElement.classList.remove('motion-paused');
  }, [motionPaused]);
  useEffect(() => { fetchCurrentCampaign().then(setCampaign).catch(() => {}); }, []);
  /* remember OFF: purge any permanent unlock left over from when remember
     was on — the gate must greet this browser again on its next visit
     (the current session stays unlocked so nobody gets locked mid-browse) */
  useEffect(() => {
    if (CONFIG.gateRemember !== true && ls.get('dd_access', 0)) {
      ls.set('dd_access', 0);
      try { sessionStorage.setItem('dd_access', '1'); } catch { /* private mode */ }
    }
  }, [CONFIG.gateRemember]);
  useEffect(() => { if (CONFIG.metaPixelId) initMetaPixel(CONFIG.metaPixelId); }, [CONFIG.metaPixelId]);
  useEffect(() => { fetchProducts().then((p) => { setProducts(p); setLoading(false); }); }, []);
  const reloadProducts = useCallback(() => fetchProducts().then(setProducts), []);

  useEffect(() => { ls.set('dd_cart', cart); ls.set('dd_cart_touched', Date.now()); }, [cart]);
  useEffect(() => { ls.set('dd_wish', wishlist); }, [wishlist]);
  useEffect(() => { ls.set('dd_recent', recent); }, [recent]);

  const byHandle = useCallback((h) => products.find((p) => p.handle === h), [products]);

  /* Inventory-capped: the cart can never hold more units than the real
     variant stock. Returns what actually happened so the caller can be
     honest in the toast — never a silent lie, never a fake success. */
  const addToCart = useCallback((handle, o1, o2 = '', qty = 1) => {
    const prod = products.find((p) => p.handle === handle);
    const available = prod ? variantQty(prod, o1, o2) : 0;
    const key = [handle, o1, o2].join('|');
    const inCart = cart.find((l) => l.key === key)?.qty || 0;
    if (available <= 0) return { ok: false, reason: 'soldout', available: 0 };
    if (inCart >= available) return { ok: false, reason: 'maxed', available, inCart };
    const add = Math.min(qty, available - inCart);
    setCart((c) => {
      // re-clamp against the updater's OWN state: two adds in the same
      // React batch each compute from the stale render, and without this
      // a double-click on the last unit puts 2 in the cart
      const line = c.find((l) => l.key === key);
      return line
        ? c.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + add, available) } : l))
        : [...c, { key, handle, o1, o2, qty: Math.min(add, available) }];
    });
    metaTrack('AddToCart', prod && { content_ids: [handle], content_name: prod.title, value: prod.price, currency: 'USD' });
    return { ok: true, added: add, capped: add < qty, available };
  }, [products, cart]);
  const setQty = useCallback((key, qty) => {
    if (qty <= 0) {
      setCart((c) => c.filter((l) => l.key !== key));
      return { ok: true, qty: 0 };
    }
    const line = cart.find((l) => l.key === key);
    const prod = line && products.find((p) => p.handle === line.handle);
    // unknown product (catalog still loading): allow the edit rather than block
    const available = prod ? variantQty(prod, line.o1, line.o2) : Infinity;
    if (available <= 0) return { ok: false, reason: 'soldout', qty: line?.qty ?? 0, available: 0 };
    const next = Math.min(qty, available);
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: next } : l)));
    return { ok: next === qty, qty: next, available };
  }, [products, cart]);
  const removeLine = useCallback((key) => setCart((c) => c.filter((l) => l.key !== key)), []);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => { const p = byHandle(l.handle); return s + (p ? p.price * l.qty : 0); }, 0);

  const toggleWish = useCallback((handle) => {
    let added = false;
    setWishlist((w) => {
      added = !w.includes(handle);
      return added ? [...w, handle] : w.filter((h) => h !== handle);
    });
    return added;
  }, []);

  const markViewed = useCallback((handle) => {
    setRecent((r) => [handle, ...r.filter((h) => h !== handle)].slice(0, 8));
  }, []);

  const unlock = useCallback((viaCampaign = null) => {
    if (viaCampaign) {
      // campaign unlock: persists exactly until the preorder closes, then
      // the gate greets this browser again — access is never open-ended
      saveUnlock(viaCampaign);
      try { sessionStorage.setItem('dd_access', '1'); } catch { /* private mode */ }
    } else if (CONFIG.gateRemember === true) ls.set('dd_access', 1);
    else { try { sessionStorage.setItem('dd_access', '1'); } catch { /* private mode */ } }
    setUnlocked(true);
  }, [CONFIG.gateRemember]);
  const isPreorder = useCallback((p) => isPreorderProduct(p, campaign), [campaign]);
  const markSubscribed = useCallback(() => { ls.set('dd_subscribed', 1); setSubscribed(true); }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(''), 2600);
  }, []);
  const toggleMotion = useCallback(() => {
    setUserMotionPaused((current) => {
      const next = !current;
      ls.set(MOTION_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    products, loading, reloadProducts, byHandle, money, CONFIG,
    cart, addToCart, setQty, removeLine, cartCount, cartTotal,
    wishlist, toggleWish, recent, markViewed,
    unlocked, unlock, subscribed, markSubscribed,
    campaign, isPreorder,
    cartOpen, setCartOpen, quickView, setQuickView, toast, showToast,
    motionPaused, systemReducedMotion, toggleMotion,
  }), [products, loading, CONFIG, cart, wishlist, recent, unlocked, subscribed, cartOpen, quickView, toast, motionPaused, systemReducedMotion,
       byHandle, addToCart, setQty, removeLine, cartCount, cartTotal, toggleWish, markViewed,
       unlock, markSubscribed, showToast, reloadProducts, campaign, isPreorder, toggleMotion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
