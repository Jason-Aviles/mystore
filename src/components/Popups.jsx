import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { saveEmailSignup } from '../lib/marketing';
import { RATING_AVG, TOTAL_SHOPIFY_RATINGS } from '../lib/reviews';
import { reducedMotion } from '../lib/motion';

/* Email capture popup — conversion-tuned:
   campaign image split-panel, the discount as the headline (people act
   on the number), a single field, social proof line, GSAP bloom entrance.
   Timing/copy/on-off all come from admin Site Settings. Exit-intent
   fires once per session on desktop. */
export default function Popups() {
  const { subscribed, unlocked, markSubscribed, CONFIG, showToast } = useStore();
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState('timed');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const root = useRef(null);

  const enabled = CONFIG.popupEnabled !== false;
  const delay = (Number(CONFIG.popupDelaySec) || 18) * 1000;

  useEffect(() => {
    if (!enabled || subscribed || !unlocked) return;
    const last = Number(localStorage.getItem('dd_pop_at') || 0);
    if (Date.now() - last < 7 * 864e5) return;
    const t = setTimeout(() => {
      localStorage.setItem('dd_pop_at', String(Date.now()));
      setVariant('timed');
      setOpen(true);
    }, delay);
    return () => clearTimeout(t);
  }, [enabled, subscribed, unlocked, delay]);

  useEffect(() => {
    if (!enabled || subscribed || !unlocked) return;
    function onOut(e) {
      if (e.clientY > 8 || e.relatedTarget) return;
      if (sessionStorage.getItem('dd_exit')) return;
      sessionStorage.setItem('dd_exit', '1');
      setVariant('exit');
      setOpen(true);
    }
    document.addEventListener('mouseout', onOut);
    return () => document.removeEventListener('mouseout', onOut);
  }, [enabled, subscribed, unlocked]);

  /* bloom entrance: backdrop fades, panel springs, image unmasks, rows cascade */
  useGSAP(() => {
    if (!open || !root.current || reducedMotion()) return;
    gsap.timeline()
      .fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'none' })
      .fromTo('.pop-panel', { scale: 0.9, y: 34 }, { scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.5)' }, 0.05)
      .fromTo('.pop-media img', { clipPath: 'inset(0 100% 0 0)', scale: 1.15 },
        { clipPath: 'inset(0 0% 0 0)', scale: 1, duration: 0.7, ease: 'power4.inOut' }, 0.15)
      .fromTo('.pop-body > *', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out' }, 0.35);
  }, { scope: root, dependencies: [open] });

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    await saveEmailSignup({ email, source: 'popup', meta: { variant } });
    markSubscribed();
    setDone(true);
    showToast('Welcome to the list');
  }

  return (
    <div className="modal" ref={root} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="panel pop-panel">
        <button className="close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
        <div className="pop-media" aria-hidden="true">
          <img src={CONFIG.popupImage || '/content/pendant-graded-1.webp'} alt="" />
        </div>
        <div className="pop-body">
          {done ? (
            <>
              <div className="script-line">Welcome to the family</div>
              <h3 className="display">You're In</h3>
              <p>Your code: <b className="pop-code">{CONFIG.welcomeCode}</b></p>
              <p className="form-note">Applied at checkout — it's also in your inbox.</p>
              <button className="btn btn-block" onClick={() => setOpen(false)}>Shop the drop</button>
            </>
          ) : (
            <>
              <span className="pop-off">10% OFF</span>
              <h3 className="display">{variant === 'exit' ? 'Before You Dip' : (CONFIG.popupTitle || 'Your First Order')}</h3>
              <p>{variant === 'exit'
                ? 'Leave with the code — 10% off plus the next private access code before anyone else.'
                : 'Plus drop alerts and private access codes before every release. One email per drop.'}</p>
              <form className="signup-form" onSubmit={submit}>
                <input type="email" required placeholder="Email address" aria-label="Email address" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="btn" type="submit">Get 10% Off</button>
              </form>
              <p className="form-note">★ {RATING_AVG} from {TOTAL_SHOPIFY_RATINGS} verified buyers · Unsubscribe anytime</p>
              <button className="later" onClick={() => setOpen(false)}>No thanks</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
