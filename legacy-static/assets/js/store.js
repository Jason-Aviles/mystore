/* DARK DIVINE — client store: cart, wishlist, recently viewed (localStorage) */
(function () {
  const LS = {
    get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const money = (n) => '$' + Number(n).toFixed(2);
  const byHandle = (h) => window.DD_PRODUCTS.find((p) => p.handle === h);

  function variantQty(p, o1, o2) {
    const v = p.variants.find((v) => v[0] === o1 && (p.options2 ? v[1] === o2 : true));
    return v ? v[2] : 0;
  }
  function totalStock(p) { return p.variants.reduce((s, v) => s + v[2], 0); }
  function lowStock(p) { const t = totalStock(p); return t > 0 && t <= 12 ? t : null; }

  /* ---- cart ---- */
  function cart() { return LS.get('dd_cart', []); }
  function saveCart(c) {
    LS.set('dd_cart', c);
    LS.set('dd_cart_touched', Date.now()); // used by abandoned-cart email flow
    document.dispatchEvent(new CustomEvent('dd:cart'));
  }
  function addToCart(handle, o1, o2, qty = 1) {
    const c = cart();
    const key = [handle, o1, o2 || ''].join('|');
    const line = c.find((l) => l.key === key);
    if (line) line.qty += qty; else c.push({ key, handle, o1, o2: o2 || '', qty });
    saveCart(c);
  }
  function setQty(key, qty) {
    let c = cart();
    const line = c.find((l) => l.key === key);
    if (!line) return;
    line.qty = qty;
    if (line.qty <= 0) c = c.filter((l) => l.key !== key);
    saveCart(c);
  }
  function removeLine(key) { saveCart(cart().filter((l) => l.key !== key)); }
  function cartCount() { return cart().reduce((s, l) => s + l.qty, 0); }
  function cartTotal() {
    return cart().reduce((s, l) => {
      const p = byHandle(l.handle);
      return s + (p ? p.price * l.qty : 0);
    }, 0);
  }

  /* ---- wishlist ---- */
  function wishlist() { return LS.get('dd_wish', []); }
  function toggleWish(handle) {
    let w = wishlist();
    if (w.includes(handle)) w = w.filter((h) => h !== handle); else w.push(handle);
    LS.set('dd_wish', w);
    document.dispatchEvent(new CustomEvent('dd:wish'));
    return w.includes(handle);
  }
  function inWish(handle) { return wishlist().includes(handle); }

  /* ---- recently viewed ---- */
  function recent() { return LS.get('dd_recent', []); }
  function markViewed(handle) {
    let r = recent().filter((h) => h !== handle);
    r.unshift(handle);
    LS.set('dd_recent', r.slice(0, 8));
  }

  /* ---- back-in-stock + email list (client capture; wire to Klaviyo/Shopify later) ---- */
  function saveEmail(email, source) {
    const list = LS.get('dd_emails', []);
    list.push({ email, source, at: new Date().toISOString() });
    LS.set('dd_emails', list);
  }

  window.DDStore = {
    money, byHandle, variantQty, totalStock, lowStock,
    cart, addToCart, setQty, removeLine, cartCount, cartTotal,
    wishlist, toggleWish, inWish,
    recent, markViewed, saveEmail, LS
  };
})();
