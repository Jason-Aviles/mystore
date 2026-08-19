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
      <h2 className="display">What We Collect</h2>
      <p>Your name, email, shipping address, and order history — the minimum needed to get product to your door and answer support requests. Payment details are processed by Stripe; we never see or store your card number.</p>
      <h2 className="display">What We Do With It</h2>
      <ul>
        <li>Fulfill and ship your orders</li>
        <li>Send drop alerts and order updates you opted into</li>
        <li>Answer support requests</li>
      </ul>
      <p>We do not sell your data. Ever.</p>
      <h2 className="display">Email &amp; SMS</h2>
      <p>You only get marketing messages if you joined the list. Every email has a one-click unsubscribe. Reply STOP to any SMS to opt out.</p>
      <h2 className="display">Your Rights</h2>
      <p>Want your data exported or deleted? Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> and it's done within 30 days.</p>
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
