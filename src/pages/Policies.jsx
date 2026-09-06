import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useStore } from '../context/StoreContext';
import { SizeTable, UnitToggle, SizeRecommender } from '../components/SizeGuide';
import { returnShippingText } from '../lib/trust';

function PageShell({ eyebrow, title, children }) {
  const bodyRef = useRef(null);
  const [toc, setToc] = useState([]);

  /* index the h2s → sticky TOC with scroll-spy */
  useEffect(() => {
    const heads = Array.from(bodyRef.current?.querySelectorAll('h2') || []);
    const items = heads.map((h, i) => {
      const id = h.id || `sec-${i}-${h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      h.id = id;
      return { id, label: h.textContent };
    });
    setToc(items);
    const triggers = heads.map((h, i) => ScrollTrigger.create({
      trigger: h,
      start: 'top 30%',
      end: () => (heads[i + 1] ? `${heads[i + 1].getBoundingClientRect().top + window.scrollY - h.getBoundingClientRect().top - window.scrollY}px 30%` : 'bottom 10%'),
      onToggle: (self) => {
        document.querySelectorAll('.policy-toc a').forEach((a) => a.classList.remove('now'));
        if (self.isActive) document.querySelector(`.policy-toc a[href="#${h.id}"]`)?.classList.add('now');
      },
    }));
    return () => triggers.forEach((t) => t.kill());
  }, [title]);

  return (
    <>
      <section className="page-head mesh">
        <div className="wrap">
          <span className="eyebrow">{eyebrow}</span>
          <h1 data-split-title>{title}</h1>
        </div>
      </section>
      <div className="wrap policy-layout">
        {toc.length > 1 && (
          <nav className="policy-toc" data-sticky-pin aria-label="On this page">
            <span className="lbl">On this page</span>
            {toc.map(({ id, label }) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
        )}
        <div className="prose" ref={bodyRef}>{children}</div>
      </div>
    </>
  );
}

export function ShippingPolicy() {
  const { CONFIG } = useStore();
  return (
    <PageShell eyebrow="Policy" title="Shipping">
      <h2 className="display">Processing</h2>
      <p>Orders ship from the US within {CONFIG.processingDays} business days. During a drop weekend, allow up to 4 business days — every piece is checked and packed by hand.</p>
      <h2 className="display">Rates &amp; Delivery</h2>
      <ul>
        <li><b>US Standard</b> — $6.95, free over ${CONFIG.freeShipThreshold} · 3–7 business days</li>
        <li><b>US Priority</b> — $14.95 · 2–3 business days</li>
        <li><b>Canada</b> — $14.95 tracked · 7–14 business days</li>
      </ul>
      <p>Checkout currently ships to the US and Canada. Somewhere else? Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> before ordering and we'll see what we can arrange.</p>
      <p>Canadian orders may be subject to customs duties set by your country — those are collected by your carrier, not by us.</p>
      <h2 className="display">Tracking</h2>
      <p>You'll get a tracking number by email the moment your order leaves. Nothing after 3 business days? <Link to="/contact#track">Resend it here</Link> or email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>.</p>
      <h2 className="display">Lost or Stolen Packages</h2>
      <p>If tracking shows delivered but nothing arrived, contact us within 7 days — we'll open a carrier claim and make it right. You will not be left hanging.</p>
    </PageShell>
  );
}

export function RefundPolicy() {
  const { CONFIG } = useStore();
  return (
    <PageShell eyebrow="Policy" title="Returns & Refunds">
      <h2 className="display">The Short Version</h2>
      <p>{CONFIG.returnsDays} days from delivery. Unworn, unwashed, tags on. Full refund to your original payment method. No restocking fee, no store-credit games. {returnShippingText(CONFIG)}</p>
      <h2 className="display">How to Start a Return</h2>
      <ul>
        <li>Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> with your order number and what you're sending back.</li>
        <li>We reply {CONFIG.returnsResponse} with a return address and instructions.</li>
        <li>Refunds land within 5–7 business days of us receiving the item.</li>
      </ul>
      <h2 className="display">Exchanges</h2>
      <p>Wrong size? We'll swap it if your size is still in stock — limited runs sell through, so email us fast. If it's gone, you get a full refund.</p>
      <h2 className="display">Final Sale</h2>
      <p>Only items clearly marked final sale on the product page. Everything else is returnable. Defective or wrong items are always on us — we cover the label and ship the fix first.</p>
    </PageShell>
  );
}

export function PrivacyPolicy() {
  const { CONFIG } = useStore();
  return (
    <PageShell eyebrow="Policy" title="Privacy">
      <p className="policy-effective"><b>Effective September 6, 2026.</b> This policy explains what Dark Divine collects, why we use it, and the choices available to you.</p>
      <h2 className="display">What We Collect</h2>
      <p>We collect the information you provide at checkout or through our forms: name, email, phone when supplied, shipping address, order history, support messages, size or product preferences, and marketing choices. We also receive basic device, browser, page-view, and referral information needed to operate and protect the store.</p>
      <h2 className="display">What We Do With It</h2>
      <ul>
        <li>Process, fulfill, ship, and support your orders</li>
        <li>Operate private-access drops and preorder production updates</li>
        <li>Send marketing only when you separately opt in</li>
        <li>Prevent fraud, diagnose errors, and improve store performance</li>
      </ul>
      <p>We do not sell your data. Ever.</p>
      <h2 className="display">Checkout &amp; Service Providers</h2>
      <p>Stripe processes payments and receives the payment and delivery details required to complete checkout. We never see or store your full card number. Supabase stores the storefront catalog, settings, orders, consent records, and support data behind access controls. Our hosting provider delivers the website. When enabled, Resend delivers email and Twilio delivers requested SMS alerts.</p>
      {CONFIG.metaPixelId && (
        <p>Meta Pixel is enabled to measure visits and shopping actions associated with our advertising. Your browser controls can limit cookies and similar tracking, and you can contact us to exercise the rights described below.</p>
      )}
      <h2 className="display">Browser Storage</h2>
      <p>We use local storage and session storage to keep your cart, saved products, access status, consent choices, and motion preference on your device. These tools are required for requested storefront features; clearing browser data removes them.</p>
      <h2 className="display">Email &amp; SMS</h2>
      <p>You only get marketing messages if you joined the list. Every email has a one-click unsubscribe. Reply STOP to any SMS to opt out.</p>
      <h2 className="display">Retention</h2>
      <p>We keep order and transaction records as long as reasonably needed for fulfillment, refunds, fraud prevention, tax, and accounting duties. Support requests are retained while an issue is active and for a reasonable recordkeeping period afterward. Marketing records remain until you unsubscribe or request deletion, subject to any legally required suppression record.</p>
      <h2 className="display">Your Rights</h2>
      <p>You may ask to access, correct, export, or delete your personal information and withdraw marketing consent. Send a request through <Link to="/contact">Contact &amp; Support</Link> or email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>. We respond within 30 days unless the law allows additional time, and we may verify that the request is really yours.</p>
      <h2 className="display">Children</h2>
      <p>This store is not directed to children under 13, and we do not knowingly collect personal information from them. A parent or guardian who believes a child submitted information should contact us for removal.</p>
      <h2 className="display">Security &amp; International Processing</h2>
      <p>We use access controls and reputable service providers to protect information, but no online service can promise absolute security. Our providers may process information in the United States or other countries where they operate.</p>
      <h2 className="display">Policy Changes</h2>
      <p>We may update this policy when the store, providers, or legal requirements change. The effective date at the top shows the latest published version. Material changes will be communicated on the site or by email when appropriate.</p>
    </PageShell>
  );
}

export function TermsPolicy() {
  const { CONFIG } = useStore();
  const identity = CONFIG.legalBusinessName || CONFIG.brand || 'Dark Divine';
  const jurisdiction = [CONFIG.businessCity, CONFIG.businessRegion].filter(Boolean).join(', ');
  return (
    <PageShell eyebrow="Legal" title="Terms of Service">
      <p className="policy-effective"><b>Effective September 6, 2026.</b> These terms govern your use of {CONFIG.domain || 'darkdivine.store'} and purchases from {identity}.</p>
      <h2 className="display">Agreement &amp; Eligibility</h2>
      <p>By using the store or placing an order, you agree to these terms and our Privacy, Shipping, and Returns policies. You must be able to enter a binding purchase agreement in your location. If you do not agree, do not use checkout.</p>
      <h2 className="display">Products, Availability &amp; Pricing</h2>
      <p>We work to describe colors, sizing, materials, pricing, and availability accurately. Displays can vary, and genuine errors can happen. We may correct an error or cancel and refund an affected order rather than fulfill it on incorrect terms. Limited products can sell out without restock.</p>
      <h2 className="display">Orders &amp; Payment</h2>
      <p>Your cart is not a reservation. An order is accepted after payment authorization and confirmation. Stripe processes payment information. We may refuse or cancel orders reasonably suspected of fraud, resale abuse, technical error, or violation of these terms; any captured amount for a cancelled order is returned to the original payment method.</p>
      <h2 className="display">Preorders &amp; Deposits</h2>
      <p>A preorder is made after its campaign closes and does not ship immediately. The product and checkout pages show the amount due today, any later balance, the campaign window, and estimated shipping range. A later balance is not charged automatically unless checkout clearly says otherwise and you authorize it. You may cancel for a full refund before shipping by contacting support. If a production change materially affects the item or timeline, we will communicate the update and available options.</p>
      <h2 className="display">Shipping, Customs &amp; Delivery</h2>
      <p>Our <Link to="/shipping">Shipping Policy</Link> states current destinations, rates, processing estimates, tracking, customs responsibility, and lost-package help. Delivery dates are estimates rather than guarantees because carriers and customs are outside our control.</p>
      <h2 className="display">Returns, Refunds &amp; Final Sale</h2>
      <p>Our <Link to="/refunds">Returns &amp; Refunds Policy</Link> explains eligibility, timing, return shipping, exchanges, refunds, and clearly marked final-sale items. Your legal consumer rights are not limited where applicable law says they cannot be.</p>
      <h2 className="display">Acceptable Use</h2>
      <p>Do not misuse the store, interfere with security, attempt unauthorized access, submit malicious code, scrape protected customer information, impersonate another person, or use the service for unlawful activity.</p>
      <h2 className="display">Intellectual Property</h2>
      <p>Dark Divine names, artwork, product graphics, photography, video, writing, and site design are owned by or licensed to us. Personal shopping use does not grant permission to reproduce, sell, or exploit that work.</p>
      <h2 className="display">Service Limits</h2>
      <p>We provide the storefront with reasonable care, but it may occasionally be unavailable or contain errors. To the fullest extent permitted by law, we are not responsible for indirect or consequential loss arising from use of the site. Nothing here excludes liability or warranties that applicable law does not allow us to exclude.</p>
      {jurisdiction && (
        <>
          <h2 className="display">Governing Location</h2>
          <p>These terms are governed by the applicable laws of {jurisdiction}, without overriding consumer protections that apply where you live.</p>
        </>
      )}
      <h2 className="display">Changes &amp; Contact</h2>
      <p>We may update these terms for operational or legal reasons. The effective date identifies the current version; changes apply prospectively after publication. Questions can be sent through <Link to="/contact">Contact &amp; Support</Link> or to <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>.</p>
    </PageShell>
  );
}

export function SizeGuidePage() {
  const { CONFIG } = useStore();
  const [unit, setUnit] = useState('in');
  return (
    <PageShell eyebrow="Fit Reference" title="Size Guide">
      <p className="sg-note">Garment laid flat. Between sizes? Size up for the intended relaxed fit.</p>
      <SizeRecommender p={null} />
      <UnitToggle unit={unit} onChange={setUnit} />
      <h2 className="display">Tops — jerseys, tees, hoodies</h2>
      <SizeTable kind="tops" unit={unit} />
      <h2 className="display">Bottoms — nylon pants, sweatpants</h2>
      <SizeTable kind="bottoms" unit={unit} />
      <h2 className="display">How Each Piece Fits</h2>
      <ul>
        <li><b>City of Sins Jersey</b> — true to size, relaxed athletic cut. Size up to wear it oversized.</li>
        <li><b>City of Sins Nylon Pants</b> — relaxed straight leg. Size down for a tapered stack.</li>
        <li><b>Dark Divine Hoodie</b> — structured, true to size. Size up for an oversized drape.</li>
        <li><b>Stacked Sweatpants</b> — slim thigh, long stacked leg. True to size.</li>
        <li><b>Dark Divine T-Shirt</b> — classic fit, true to size.</li>
      </ul>
      <p className="sg-note">Still unsure? Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> with your height and weight — we answer {CONFIG.supportResponse}.</p>
    </PageShell>
  );
}
