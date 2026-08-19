/* DARK DIVINE — shared chrome + behaviors
   Injects announcement bar, header, footer, cart drawer, modals,
   popups and the private-access gate on every page. */
(function () {
  const S = window.DDStore;
  const C = window.DD_CONFIG;
  const P = window.DD_PRODUCTS;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICONS = {
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l1 13H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7.5-4.7-9.6-9.2C.9 8.6 2.7 5 6.2 5c2.2 0 3.7 1.2 4.6 2.6.2.3.4.3.6 0C12.9 6.2 14.4 5 16.6 5c3.5 0 5.3 3.6 3.8 6.8C18.7 16.3 12 21 12 21z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-9.6-9.2C.9 8.6 2.7 5 6.2 5c2.2 0 3.7 1.2 4.6 2.6.2.3.4.3.6 0C12.9 6.2 14.4 5 16.6 5c3.5 0 5.3 3.6 3.8 6.8C18.7 16.3 12 21 12 21z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 5h14v11H1zM15 9h4l4 4v3h-8"/><circle cx="6" cy="18.5" r="1.8"/><circle cx="18" cy="18.5" r="1.8"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>'
  };

  /* ============ chrome injection ============ */
  const page = document.body.dataset.page || '';
  const navLinks = [
    ['index.html', 'Home'],
    ['shop.html', 'Shop All'],
    ['shop.html?c=bundle', 'The Drop'],
    ['shop.html?c=essentials', 'Essentials'],
    ['support.html', 'Support']
  ];

  function chromeTop() {
    return `
    <div class="annc">Free US shipping over <b>$${C.freeShipThreshold}</b> &nbsp;·&nbsp; ${esc(C.dropName)} loading</div>
    <header class="site-header">
      <div class="wrap bar">
        <button class="icon-btn" id="navToggle" aria-label="Open menu">${ICONS.menu}</button>
        <a class="logo" href="index.html">Dark <em>Divine</em></a>
        <nav class="main-nav" aria-label="Main">
          ${navLinks.map(([h, t]) => `<a href="${h}" ${page && h.startsWith(page) ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
        </nav>
        <div class="head-actions">
          <button class="icon-btn" id="wishBtn" aria-label="Saved items">${ICONS.heart}</button>
          <button class="icon-btn" id="cartBtn" aria-label="Open cart">${ICONS.bag}<span class="cart-count" id="cartCount"></span></button>
        </div>
      </div>
    </header>
    <div class="mobile-nav" id="mobileNav" aria-hidden="true">
      <div class="top">
        <span class="logo">Dark <em>Divine</em></span>
        <button class="icon-btn" id="navClose" aria-label="Close menu" style="font-size:22px">&times;</button>
      </div>
      ${navLinks.map(([h, t]) => `<a class="nav-link" href="${h}">${t}</a>`).join('')}
      <div class="foot">${esc(C.supportEmail)}</div>
    </div>`;
  }

  function chromeBottom() {
    return `
    <footer class="site-footer">
      <div class="wrap">
        <div class="foot-grid">
          <div class="foot-brand">
            <span class="logo">Dark <em>Divine</em></span>
            <p>Limited-run streetwear. Cut in small numbers, released in drops, never restocked.</p>
          </div>
          <div>
            <h4>Shop</h4>
            <a href="shop.html">Shop all</a>
            <a href="shop.html?c=bundle">City of Sins drop</a>
            <a href="shop.html?c=essentials">Core essentials</a>
            <a href="size-guide.html">Size guide</a>
          </div>
          <div>
            <h4>Help</h4>
            <a href="support.html">Contact &amp; support</a>
            <a href="support.html#track">Track your order</a>
            <a href="shipping.html">Shipping policy</a>
            <a href="returns.html">Returns &amp; refunds</a>
          </div>
          <div>
            <h4>Brand</h4>
            <a href="index.html#story">Our story</a>
            <a href="${esc(C.instagram)}" target="_blank" rel="noopener">Instagram</a>
            <a href="${esc(C.tiktok)}" target="_blank" rel="noopener">TikTok</a>
            <a href="mailto:${esc(C.supportEmail)}">${esc(C.supportEmail)}</a>
          </div>
        </div>
        <div class="trust-row">
          <span class="lock">${ICONS.lock} Secure 256-bit SSL checkout</span>
          <div class="pay-icons" aria-label="Accepted payments">
            <span class="pay">VISA</span><span class="pay">MASTERCARD</span><span class="pay">AMEX</span>
            <span class="pay">APPLE&nbsp;PAY</span><span class="pay">G&nbsp;PAY</span><span class="pay">PAYPAL</span>
          </div>
        </div>
        <div class="foot-bottom">
          <span>© ${new Date().getFullYear()} Dark Divine. All rights reserved.</span>
          <span><a href="privacy.html">Privacy</a> &nbsp;·&nbsp; <a href="terms.html">Terms</a></span>
        </div>
      </div>
    </footer>

    <div class="overlay" id="overlay"></div>

    <aside class="drawer" id="cartDrawer" aria-label="Cart" aria-hidden="true">
      <div class="head">
        <h3 class="display">Your Cart</h3>
        <button class="icon-btn" id="cartClose" aria-label="Close cart" style="font-size:22px">&times;</button>
      </div>
      <div class="ship-progress" id="shipProgress"></div>
      <div class="items" id="cartItems"></div>
      <div class="cart-upsell" id="cartUpsell"></div>
      <div class="foot" id="cartFoot"></div>
    </aside>

    <div class="modal" id="qvModal" aria-hidden="true"><div class="panel"><button class="close" data-close>&times;</button><div id="qvBody"></div></div></div>
    <div class="modal" id="sgModal" aria-hidden="true"><div class="panel narrow"><button class="close" data-close>&times;</button><div class="pop-body" id="sgBody" style="text-align:left"></div></div></div>
    <div class="modal" id="popModal" aria-hidden="true"><div class="panel narrow"><button class="close" data-close>&times;</button><div class="pop-body" id="popBody"></div></div></div>
    <div class="toast" id="toast" role="status"></div>`;
  }

  document.body.insertAdjacentHTML('afterbegin', chromeTop());
  document.body.insertAdjacentHTML('beforeend', chromeBottom());

  /* ============ helpers ============ */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function openModal(id) { $(id).classList.add('show'); $(id).setAttribute('aria-hidden', 'false'); }
  function closeModals() {
    $$('.modal').forEach((m) => { m.classList.remove('show'); m.setAttribute('aria-hidden', 'true'); });
  }
  document.addEventListener('click', (e) => {
    if (e.target.matches('.modal') || e.target.closest('[data-close]')) closeModals();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModals(); closeCart(); } });

  /* ============ product cards ============ */
  function cardBadges(p) {
    const out = [];
    if (p.tag === 'DROP 002') out.push('<span class="badge red">Drop 002</span>');
    else if (p.compare && p.compare > p.price) out.push('<span class="badge">Sale</span>');
    const low = S.lowStock(p);
    if (low) out.push(`<span class="badge stock">Only ${low} left</span>`);
    return out.join('');
  }

  function productCard(p) {
    const alt = p.images[1] ? `<img class="alt" src="${p.images[1]}" alt="" loading="lazy">` : '';
    const off = p.compare && p.compare > p.price ? `<span class="off">−${Math.round((1 - p.price / p.compare) * 100)}%</span>` : '';
    const wished = S.inWish(p.handle);
    return `
    <article class="pcard reveal">
      <div class="media">
        <img class="primary" src="${p.images[0]}" alt="${esc(p.title)}" loading="lazy">${alt}
        <div class="badges">${cardBadges(p)}</div>
        <button class="wish ${wished ? 'on' : ''}" data-wish="${p.handle}" aria-label="Save ${esc(p.title)}">${wished ? ICONS.heartFill : ICONS.heart}</button>
        <button class="quick" data-qv="${p.handle}">Quick view</button>
      </div>
      <div class="info">
        <span class="cat">${esc(p.collection)}</span>
        <h3><a href="product.html?p=${p.handle}">${esc(p.title)}</a></h3>
        <div class="price">${S.money(p.price)}${p.compare && p.compare > p.price ? `<s>${S.money(p.compare)}</s>` : ''}${off}</div>
      </div>
    </article>`;
  }

  /* ============ cart drawer ============ */
  function openCart() {
    renderCart();
    $('#cartDrawer').classList.add('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'false');
    $('#overlay').classList.add('show');
  }
  function closeCart() {
    $('#cartDrawer').classList.remove('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'true');
    $('#overlay').classList.remove('show');
    $('#mobileNav').classList.remove('open');
  }

  function renderCart() {
    const lines = S.cart();
    const total = S.cartTotal();
    $('#cartCount').textContent = S.cartCount() || '';

    // free shipping progress
    const left = C.freeShipThreshold - total;
    const pct = Math.min(100, (total / C.freeShipThreshold) * 100);
    $('#shipProgress').className = 'ship-progress' + (left <= 0 ? ' free' : '');
    $('#shipProgress').innerHTML = (left > 0
      ? `Add <b>${S.money(left)}</b> more for free US shipping`
      : `You unlocked <b>free US shipping</b>`) +
      `<div class="bar"><div class="fill" style="width:${pct}%"></div></div>`;

    if (!lines.length) {
      $('#cartItems').innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><br><a class="btn btn-ghost btn-sm" href="shop.html">Shop the drop</a></div>`;
      $('#cartUpsell').innerHTML = '';
      $('#cartFoot').innerHTML = '';
      return;
    }

    $('#cartItems').innerHTML = lines.map((l) => {
      const p = S.byHandle(l.handle);
      if (!p) return '';
      const vtxt = [l.o1, l.o2].filter(Boolean).join(' / ');
      return `
      <div class="cart-item">
        <a href="product.html?p=${p.handle}"><img src="${p.images[0]}" alt=""></a>
        <div>
          <div class="t">${esc(p.title)}</div>
          <div class="v">${esc(p.optionNames[0])}: ${esc(l.o1)}${l.o2 ? ` · ${esc(p.optionNames[1])}: ${esc(l.o2)}` : ''}</div>
          <div class="qty">
            <button data-dq="${esc(l.key)}" aria-label="Decrease quantity">−</button><span>${l.qty}</span><button data-iq="${esc(l.key)}" aria-label="Increase quantity">+</button>
          </div>
          <button class="rm" data-rm="${esc(l.key)}">Remove</button>
        </div>
        <div class="p">${S.money(p.price * l.qty)}</div>
      </div>`;
    }).join('');

    // upsell: highest-value product not in cart
    const inCart = new Set(lines.map((l) => l.handle));
    const up = P.filter((p) => !inCart.has(p.handle)).sort((a, b) => (b.bestseller - a.bestseller) || (b.price - a.price))[0];
    $('#cartUpsell').innerHTML = up ? `
      <div class="lbl">Complete the fit</div>
      <div class="upsell-item">
        <img src="${up.images[0]}" alt="">
        <div><div class="t">${esc(up.title)}</div><div class="p">${S.money(up.price)}</div></div>
        <a class="btn btn-ghost btn-sm" href="product.html?p=${up.handle}">View</a>
      </div>` : '';

    $('#cartFoot').innerHTML = `
      <div class="total-row"><span>Subtotal</span><span>${S.money(total)}</span></div>
      <div class="note">${ICONS.lock} Secure checkout · SSL encrypted · Shipping calculated at checkout</div>
      <button class="btn btn-block" id="checkoutBtn">Checkout Securely</button>`;
  }

  function checkout() {
    const lines = S.cart();
    if (!lines.length) return;
    // One-click checkout: Stripe Payment Link when set, live store page otherwise.
    if (lines.length === 1) {
      const p = S.byHandle(lines[0].handle);
      window.open(p.stripeLink || p.shopifyUrl, '_blank', 'noopener');
      return;
    }
    $('#popBody').innerHTML = `
      <h3 class="display">Complete Your Order</h3>
      <p>Each piece checks out through its own secure page. Your sizes: pick them again at checkout.</p>
      ${lines.map((l) => {
        const p = S.byHandle(l.handle);
        return `<a class="btn btn-ghost btn-block" style="margin-bottom:10px" href="${p.stripeLink || p.shopifyUrl}" target="_blank" rel="noopener">${esc(p.title)} — ${S.money(p.price * l.qty)}</a>`;
      }).join('')}
      <p class="form-note">256-bit SSL · Visa · Mastercard · Amex · Apple Pay · PayPal</p>`;
    openModal('#popModal');
  }

  /* ============ quick view ============ */
  function quickView(handle) {
    const p = S.byHandle(handle);
    if (!p) return;
    const low = S.lowStock(p);
    $('#qvBody').innerHTML = `
    <div class="qv-grid">
      <div class="media"><img src="${p.images[0]}" alt="${esc(p.title)}"></div>
      <div class="body">
        <span class="eyebrow">${esc(p.collection)}</span>
        <h3 class="display">${esc(p.title)}</h3>
        <div class="sub">${esc(p.sub)}</div>
        <div class="price">${S.money(p.price)}${p.compare && p.compare > p.price ? `<s>${S.money(p.compare)}</s>` : ''}</div>
        ${low ? `<div class="stock-note low">Only ${low} left in this run</div>` : ''}
        <p class="short">${esc(p.short)}</p>
        <div id="qvOpts"></div>
        <div class="buy-actions">
          <button class="btn btn-block" id="qvAdd">Add to Cart — ${S.money(p.price)}</button>
          <a class="full-link" href="product.html?p=${p.handle}">View full details, fit &amp; materials →</a>
        </div>
      </div>
    </div>`;
    const picker = variantPicker(p, $('#qvOpts'));
    $('#qvAdd').addEventListener('click', () => {
      const sel = picker.selection();
      if (!sel) { toast('Pick your size first'); return; }
      S.addToCart(p.handle, sel[0], sel[1]);
      closeModals();
      toast('Added to cart');
      openCart();
    });
    openModal('#qvModal');
  }

  /* ============ variant picker (shared by QV + PDP) ============ */
  function variantPicker(p, mount, onChange) {
    let sel1 = null, sel2 = null;
    function qtyFor(o1, o2) { return S.variantQty(p, o1, o2); }
    function render() {
      const g1 = `
        <div class="opt-group">
          <div class="lbl"><span>${esc(p.optionNames[0])}</span><a href="size-guide.html" data-sg>Size guide</a></div>
          <div class="opts">${p.options1.map((o) => {
            const out = p.options2 ? p.options2.every((o2) => qtyFor(o, o2) === 0) : qtyFor(o, '') === 0;
            return `<button class="opt ${sel1 === o ? 'sel' : ''} ${out ? 'soldout' : ''}" data-o1="${esc(o)}">${esc(o)}</button>`;
          }).join('')}</div>
        </div>`;
      const g2 = p.options2 ? `
        <div class="opt-group">
          <div class="lbl"><span>${esc(p.optionNames[1])}</span></div>
          <div class="opts">${p.options2.map((o) => {
            const out = sel1 ? qtyFor(sel1, o) === 0 : false;
            return `<button class="opt ${sel2 === o ? 'sel' : ''} ${out ? 'soldout' : ''}" data-o2="${esc(o)}">${esc(o)}</button>`;
          }).join('')}</div>
        </div>` : '';
      let note = '';
      if (sel1 && (!p.options2 || sel2)) {
        const q = qtyFor(sel1, sel2 || '');
        note = q === 0 ? '<div class="stock-note">Sold out in this combo</div>'
          : q <= 3 ? `<div class="stock-note low">Only ${q} left in this size</div>`
          : '<div class="stock-note">In stock — ships within 2 business days</div>';
      }
      mount.innerHTML = g1 + g2 + note;
      $$('.opt[data-o1]', mount).forEach((b) => b.addEventListener('click', () => { sel1 = b.dataset.o1; render(); fire(); }));
      $$('.opt[data-o2]', mount).forEach((b) => b.addEventListener('click', () => { sel2 = b.dataset.o2; render(); fire(); }));
    }
    function fire() { if (onChange) onChange(selection(), sel1, sel2); }
    function selection() {
      if (!sel1) return null;
      if (p.options2 && !sel2) return null;
      if (S.variantQty(p, sel1, sel2 || '') === 0) return null;
      return [sel1, sel2 || ''];
    }
    render();
    return { selection, get sel1() { return sel1; } };
  }

  /* ============ size guide content ============ */
  const SIZE_GUIDE_HTML = `
    <span class="eyebrow">Fit Reference</span>
    <h3 class="display" style="margin:10px 0 4px">Size Guide</h3>
    <p class="sg-note">Measurements in inches, garment laid flat. Between sizes? Size up for the intended relaxed fit.</p>
    <h4 style="margin-top:18px;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Tops — jerseys, tees, hoodies</h4>
    <table class="sg-table">
      <tr><th>Size</th><th>Chest</th><th>Length</th><th>Shoulder</th></tr>
      <tr><td>XS</td><td>19</td><td>26</td><td>17</td></tr>
      <tr><td>S</td><td>20.5</td><td>27</td><td>18</td></tr>
      <tr><td>M</td><td>22</td><td>28</td><td>19</td></tr>
      <tr><td>L</td><td>23.5</td><td>29</td><td>20</td></tr>
      <tr><td>XL</td><td>25</td><td>30</td><td>21</td></tr>
      <tr><td>2XL</td><td>26.5</td><td>31</td><td>22</td></tr>
    </table>
    <h4 style="margin-top:18px;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Bottoms — nylon pants, sweatpants</h4>
    <table class="sg-table">
      <tr><th>Size</th><th>Waist</th><th>Inseam</th><th>Leg opening</th></tr>
      <tr><td>XS</td><td>26–28</td><td>30</td><td>7</td></tr>
      <tr><td>S</td><td>28–30</td><td>31</td><td>7.5</td></tr>
      <tr><td>M</td><td>30–32</td><td>32</td><td>8</td></tr>
      <tr><td>L</td><td>32–34</td><td>33</td><td>8.5</td></tr>
      <tr><td>XL</td><td>34–36</td><td>34</td><td>9</td></tr>
      <tr><td>2XL</td><td>36–38</td><td>34</td><td>9.5</td></tr>
    </table>
    <p class="sg-note">Still unsure? Email <a href="mailto:${C.supportEmail}" style="color:var(--bone)">${C.supportEmail}</a> with your height and weight — we answer within 24 hours.</p>`;
  window.DD_SIZE_GUIDE_HTML = SIZE_GUIDE_HTML;

  document.addEventListener('click', (e) => {
    const sg = e.target.closest('[data-sg]');
    if (sg) { e.preventDefault(); $('#sgBody').innerHTML = SIZE_GUIDE_HTML; openModal('#sgModal'); }
  });

  /* ============ countdown ============ */
  function mountCountdown(el) {
    const target = new Date(C.dropDate).getTime();
    function tick() {
      const d = target - Date.now();
      if (d <= 0) {
        el.innerHTML = `<div class="drop-live">DROP IS LIVE</div>`;
        return;
      }
      const days = Math.floor(d / 864e5), hrs = Math.floor(d / 36e5) % 24,
        min = Math.floor(d / 6e4) % 60, sec = Math.floor(d / 1e3) % 60;
      el.innerHTML = [['Days', days], ['Hrs', hrs], ['Min', min], ['Sec', sec]]
        .map(([l, v]) => `<div class="count-cell"><b>${String(v).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
      setTimeout(tick, 1000);
    }
    tick();
  }
  $$('[data-countdown]').forEach(mountCountdown);

  /* ============ private access gate (homepage, first visit) ============ */
  function mountGate() {
    if (page !== 'home') return;
    if (S.LS.get('dd_access', 0)) return;
    if (location.search.includes('preview=1')) return; // testing bypass
    document.body.insertAdjacentHTML('beforeend', `
    <div class="gate" id="gate" role="dialog" aria-label="Private access">
      <div class="inner">
        <div class="logo-big">Dark Divine</div>
        <div class="script-line">Illuminate the darkness within</div>
        <div class="lbl">Private Access — Drop 002</div>
        <form id="gateForm">
          <input type="text" id="gateCode" placeholder="ACCESS CODE" autocomplete="off" aria-label="Access code">
          <button class="btn" type="submit">Enter</button>
        </form>
        <div class="err" id="gateErr"></div>
        <div class="alt">No code? <button type="button" id="gateJoin">Join the list</button> — codes go out before every drop.</div>
        <div class="guest"><button type="button" class="btn btn-ghost btn-sm" id="gateGuest">Browse as guest</button></div>
      </div>
    </div>`);
    const pass = () => { S.LS.set('dd_access', 1); $('#gate').classList.add('hidden'); };
    $('#gateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#gateCode').value.trim().toUpperCase();
      if (C.accessCodes.includes(code)) { pass(); toast('Access granted'); }
      else $('#gateErr').textContent = 'That code isn’t active. Join the list to get the next one.';
    });
    $('#gateGuest').addEventListener('click', pass);
    $('#gateJoin').addEventListener('click', () => {
      pass();
      document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
  mountGate();

  /* ============ email + exit popups ============ */
  const subscribed = () => S.LS.get('dd_subscribed', 0);
  function signupPopup(title, sub, code, source) {
    $('#popBody').innerHTML = `
      <div class="script-line">Dark Divine</div>
      <h3 class="display">${title}</h3>
      <p>${sub}</p>
      <form id="popForm" class="signup-form">
        <input type="email" required placeholder="Email address" aria-label="Email address">
        <button class="btn" type="submit">Unlock</button>
      </form>
      <p class="form-note">One email per drop. No spam, ever. Unsubscribe anytime.</p>
      <button class="later" data-close>Not now</button>`;
    openModal('#popModal');
    $('#popForm').addEventListener('submit', (e) => {
      e.preventDefault();
      S.saveEmail(e.target.querySelector('input').value, source);
      S.LS.set('dd_subscribed', 1);
      $('#popBody').innerHTML = `
        <div class="script-line">Welcome to the family</div>
        <h3 class="display">You're On The List</h3>
        <p>Use code <b style="color:var(--bone)">${code}</b> for 10% off your first order. It's waiting in your inbox too.</p>
        <button class="btn btn-block" data-close>Shop the drop</button>`;
    });
  }

  // timed signup popup — once per 7 days
  if (!subscribed() && Date.now() - S.LS.get('dd_pop_at', 0) > 7 * 864e5) {
    setTimeout(() => {
      if ($('#gate') && !$('#gate').classList.contains('hidden')) return;
      if (document.querySelector('.modal.show')) return;
      S.LS.set('dd_pop_at', Date.now());
      signupPopup('First Access. 10% Off.', 'Drop alerts, private access codes, and 10% off your first order.', 'DARKDIVINEWELCOME10', 'timed-popup');
    }, 18000);
  }

  // exit intent — desktop, once per session
  document.addEventListener('mouseout', (e) => {
    if (e.clientY > 8 || e.relatedTarget || subscribed()) return;
    if (sessionStorage.getItem('dd_exit')) return;
    if ($('#gate') && !$('#gate').classList.contains('hidden')) return;
    sessionStorage.setItem('dd_exit', 1);
    signupPopup('Before You Dip —', 'Take 10% off your first order and get the next access code before anyone else.', 'DARKDIVINEWELCOME10', 'exit-intent');
  });

  /* ============ inline signup forms ============ */
  $$('form[data-signup]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      S.saveEmail(f.querySelector('input[type=email]').value, f.dataset.signup);
      S.LS.set('dd_subscribed', 1);
      f.innerHTML = `<p style="color:var(--bone);font-weight:600;letter-spacing:.08em">You're in. Code <b>DARKDIVINEWELCOME10</b> = 10% off your first order.</p>`;
      toast('Welcome to the list');
    });
  });

  /* ============ global events ============ */
  document.addEventListener('click', (e) => {
    const wish = e.target.closest('[data-wish]');
    if (wish) {
      const on = S.toggleWish(wish.dataset.wish);
      wish.classList.toggle('on', on);
      wish.innerHTML = on ? ICONS.heartFill : ICONS.heart;
      toast(on ? 'Saved to your list' : 'Removed from saved');
      return;
    }
    const qv = e.target.closest('[data-qv]');
    if (qv) { quickView(qv.dataset.qv); return; }
    if (e.target.closest('#cartBtn')) { openCart(); return; }
    if (e.target.closest('#cartClose') || e.target.matches('#overlay')) { closeCart(); return; }
    if (e.target.closest('#checkoutBtn')) { checkout(); return; }
    if (e.target.closest('#navToggle')) { $('#mobileNav').classList.add('open'); $('#overlay').classList.add('show'); return; }
    if (e.target.closest('#navClose') || e.target.closest('.mobile-nav a')) { $('#mobileNav').classList.remove('open'); $('#overlay').classList.remove('show'); return; }
    if (e.target.closest('#wishBtn')) { location.href = 'shop.html?c=saved'; return; }
    const dq = e.target.closest('[data-dq]'); if (dq) { const l = S.cart().find((x) => x.key === dq.dataset.dq); S.setQty(dq.dataset.dq, l.qty - 1); renderCart(); return; }
    const iq = e.target.closest('[data-iq]'); if (iq) { const l = S.cart().find((x) => x.key === iq.dataset.iq); S.setQty(iq.dataset.iq, l.qty + 1); renderCart(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { S.removeLine(rm.dataset.rm); renderCart(); return; }
  });
  document.addEventListener('dd:cart', () => { $('#cartCount').textContent = S.cartCount() || ''; });
  $('#cartCount').textContent = S.cartCount() || '';

  /* ============ scroll reveal ============ */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  function observeReveals() { $$('.reveal:not(.in)').forEach((el) => io.observe(el)); }
  observeReveals();

  window.DDUI = { productCard, toast, openCart, renderCart, variantPicker, quickView, observeReveals, openModal, closeModals, ICONS, esc, mountCountdown };
})();
