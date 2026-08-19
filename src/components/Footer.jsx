import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { saveEmailSignup } from '../lib/marketing';
import { RATING_AVG, TOTAL_SHOPIFY_RATINGS } from '../lib/reviews';
import { payMethodList } from '../lib/trust';
import { Lock } from './Icons';

export default function Footer() {
  const { CONFIG, markSubscribed, showToast } = useStore();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    await saveEmailSignup({ email, source: 'footer_signup' });
    markSubscribed();
    setDone(true);
    showToast('Welcome to the list');
  }

  return (
    <footer className="site-footer">
      <div className="foot-marquee" aria-hidden="true">
        <div className="fm-track">Dark Divine <i>·</i> Illuminate the Darkness Within <i>·</i> One Run. No Restock. <i>·</i> Dark Divine <i>·</i> 00</div>
      </div>
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <span className="logo">Dark <em>Divine</em></span>
            <p>Limited-run streetwear. Cut in small numbers, released in drops, never restocked.</p>
            {done ? (
              <p style={{ color: 'var(--bone)' }}>You're in. Code <b>{CONFIG.welcomeCode}</b> = 10% off.</p>
            ) : (
              <form className="foot-signup" onSubmit={submit}>
                <input type="email" name="email" required placeholder="Email for drop alerts" aria-label="Email for drop alerts" autoComplete="email" spellCheck="false"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="btn btn-sm" type="submit">Join</button>
              </form>
            )}
          </div>
          <div>
            <h4 data-fx="venomDrip">Shop</h4>
            <Link to="/shop">Shop all</Link>
            {CONFIG.dropMode !== false && <Link to="/drop">City of Sins drop</Link>}
            <Link to="/collection/essentials">Core essentials</Link>
            <Link to="/size-guide">Size guide</Link>
          </div>
          <div>
            <h4 data-fx="venomDrip">Help</h4>
            <Link to="/contact">Contact &amp; support</Link>
            <Link to="/contact#track">Track your order</Link>
            <Link to="/shipping">Shipping policy</Link>
            <Link to="/refunds">Returns &amp; refunds</Link>
          </div>
          <div>
            <h4 data-fx="venomDrip">Brand</h4>
            <Link to="/about">Our story</Link>
            <a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
            <p className="foot-human">Real humans, real replies — {CONFIG.supportResponse}. US-based.</p>
          </div>
        </div>
        <div className="trust-row">
          <span className="lock"><Lock /> Secure SSL checkout</span>
          <span className="lock">★ {RATING_AVG} · {TOTAL_SHOPIFY_RATINGS} verified reviews</span>
          <div className="pay-icons" aria-label="Accepted payments">
            {payMethodList(CONFIG).map((p) => <span key={p} className="pay">{p.toUpperCase()}</span>)}
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} Dark Divine. All rights reserved.</span>
          <span><Link to="/privacy">Privacy</Link> &nbsp;·&nbsp; <Link to="/refunds">Refunds</Link> &nbsp;·&nbsp; <Link to="/shipping">Shipping</Link></span>
        </div>
      </div>
    </footer>
  );
}
