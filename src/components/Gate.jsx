import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useStore } from '../context/StoreContext';
import { saveEmailSignup, saveSmsSignup, validateAccessCode } from '../lib/marketing';
import { submitGate, campaignLive, shipWindowText, productionStartText, closesText, opensText } from '../lib/preorder';
import { wiggle, scramble, reducedMotion } from '../lib/motion';
import Countdown from './Countdown';

/* Private preorder gate — two modes, both driven by REAL campaign rows:
     coming_soon → email collection only (no code field, gate stays locked)
     live        → email + access code, validated ONLY by the preorder-gate
                   Edge Function (codes never ship in this bundle)
   With no campaign configured it falls back to the original drop gate.
   Every date shown is the admin's own campaign data; consent is explicit
   checkboxes, never assumed. */
export default function Gate({ onDone }) {
  const { CONFIG, campaign, unlock, markSubscribed, showToast } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailConsent, setEmailConsent] = useState(false); // never pre-checked
  const [smsConsent, setSmsConsent] = useState(false);     // never pre-checked
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false); // coming-soon success state
  const root = useRef(null);
  const codeRef = useRef(null);
  const lblRef = useRef(null);

  const live = campaignLive(campaign);
  const soon = Boolean(campaign) && !live; // coming_soon, or live-but-not-yet-open
  const shipWin = shipWindowText(campaign);

  /* modal semantics: initial focus + Tab trap while the gate is up */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const background = [document.querySelector('.site-top'), document.querySelector('#smooth-wrapper')].filter(Boolean);
    background.forEach((node) => node.setAttribute('inert', ''));
    el.querySelector('input[type="email"]')?.focus();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = Array.from(el.querySelectorAll('input, button'));
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      background.forEach((node) => node.removeAttribute('inert'));
    };
  }, []);

  /* vault doors: shutters part top/bottom, content fades, then unlock */
  function open(after) {
    const el = root.current;
    if (!el || reducedMotion()) { after(); return; }
    gsap.timeline({ onComplete: after })
      .add(scramble(lblRef.current, 'ACCESS GRANTED', { duration: 0.7 }) || gsap.to({}, { duration: 0 }))
      .to(el.querySelector('.inner'), { opacity: 0, y: -24, duration: 0.45, ease: 'power2.in' }, 0.8)
      .to(el.querySelector('.gate-shutter.top'), { yPercent: -101, duration: 0.9, ease: 'power4.inOut' }, 1.05)
      .to(el.querySelector('.gate-shutter.bottom'), { yPercent: 101, duration: 0.9, ease: 'power4.inOut' }, 1.05);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');

    // ---- campaign path: everything goes through the Edge Function ----
    if (campaign) {
      const res = await submitGate({
        email, code: live ? code : '', phone,
        emailConsent, smsConsent: Boolean(phone.trim()) && smsConsent,
        campaignSlug: campaign.slug,
      });
      setBusy(false);
      if (!res.ok) {
        if (res.error === 'invalid_code') {
          setErr('That code isn’t active for this preorder. Join the list to get the next one.');
          wiggle(codeRef.current, { strength: 10 });
        } else if (res.error === 'code_required') {
          setErr('Enter your access code to open the preorder.');
          wiggle(codeRef.current, { strength: 10 });
        } else if (res.error === 'email') {
          setErr('That email doesn’t look right — check it and try again.');
        } else {
          setErr('Something went wrong on our side. Your info wasn’t lost — try again.');
        }
        return;
      }
      markSubscribed();
      if (res.unlocked) {
        open(() => {
          unlock(campaign);
          onDone?.();
          showToast('Access granted — welcome to the preorder');
          navigate('/drop');
        });
      } else {
        setJoined(true); // coming soon: on the list, gate stays closed
      }
      return;
    }

    // ---- legacy path (no campaign configured): original drop gate ----
    const ok = await validateAccessCode(code, CONFIG.fallbackAccessCodes);
    if (!ok) {
      setBusy(false);
      setErr('That code isn’t active. Join the list to get the next one.');
      wiggle(codeRef.current, { strength: 10 });
      return;
    }
    await saveEmailSignup({ email, source: 'password_gate', consent: emailConsent, meta: { code: code.trim().toUpperCase() } });
    if (phone.trim() && smsConsent) await saveSmsSignup({ phone, consent: true });
    markSubscribed();
    setBusy(false);
    open(() => { unlock(); onDone?.(); showToast('Access granted'); });
  }

  async function joinList() {
    if (!email) { setErr('Drop your email first — codes go out to the list.'); wiggle(root.current?.querySelector('input[type="email"]')); return; }
    setBusy(true);
    if (campaign) {
      // record through the Edge Function so campaign + consent land in the audit log
      await submitGate({ email, phone, emailConsent, smsConsent: Boolean(phone.trim()) && smsConsent, campaignSlug: campaign.slug });
      setBusy(false);
      markSubscribed();
      setJoined(true);
      return;
    }
    await saveEmailSignup({ email, source: 'password_gate', consent: emailConsent });
    if (phone.trim() && smsConsent) await saveSmsSignup({ phone, consent: true });
    markSubscribed();
    setBusy(false);
    open(() => { unlock(); onDone?.(); showToast('You’re on the list — next code hits your inbox'); });
  }

  const heading = campaign ? campaign.name : CONFIG.dropName;
  const countTarget = live
    ? campaign?.closes_at                       // live: count down to close
    : (campaign?.opens_at || CONFIG.dropDate);  // coming soon: count to open

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" ref={root}>
      <div className="gate-shutter top" aria-hidden="true" />
      <div className="gate-shutter bottom" aria-hidden="true" />
      <div className="inner">
        <span className="logo-mark lg" aria-hidden="true" style={{ marginBottom: 18 }} />
        <div className="logo-big" id="gate-title">Dark Divine</div>
        <div className="script-line">Illuminate the darkness within</div>
        <div className="gate-tease" aria-hidden="true">
          <span className="gt-tape">{campaign ? 'PRIVATE PREORDER' : (CONFIG.dropMode !== false ? CONFIG.dropName : 'DARK DIVINE')}</span>
          <img src={campaign?.hero_image_url || CONFIG.dropImage || '/media/editorial/cafe-fit.webp'} alt="" fetchPriority="high" />
        </div>
        <div className="lbl" ref={lblRef}>
          {campaign ? `Private Preorder — ${heading}` : `Private Access — ${heading}`}
        </div>

        {campaign && (
          <div className="gate-preorder-meta">
            {campaign.description && <p className="gp-desc">{campaign.description}</p>}
            <ul className="gp-facts">
              {campaign.opens_at && <li><b>{live ? 'Opened' : 'Opens'}</b> {opensText(campaign)}</li>}
              {campaign.closes_at && <li><b>Closes</b> {closesText(campaign)}</li>}
              {campaign.estimated_production_start && <li><b>Production begins</b> ~{productionStartText(campaign)}</li>}
              {shipWin && <li><b>Estimated shipping</b> {shipWin}</li>}
            </ul>
            <p className="gp-note">Every piece is made after the preorder closes. You’ll receive production updates by email.</p>
          </div>
        )}

        {countTarget && (CONFIG.dropMode !== false || campaign) && (
          <div className="gate-count">
            {campaign && <span className="gc-lbl">{live ? 'PREORDER CLOSES IN' : 'PREORDER OPENS IN'}</span>}
            <Countdown target={countTarget} />
          </div>
        )}

        {joined ? (
          <div className="gate-joined">
            <p><b>You’re on the list.</b> We’ll email you when the preorder opens{campaign?.opens_at ? ` (${opensText(campaign)})` : ''}.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <input type="email" name="email" required placeholder="EMAIL ADDRESS" aria-label="Email address" autoComplete="email" spellCheck="false"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="consent-row gate-consent">
              <input type="checkbox" name="email-consent" checked={emailConsent} onChange={(e) => setEmailConsent(e.target.checked)} />
              <span>Email me drop dates, access codes, and offers. (Optional — order and production emails arrive either way if you buy.)</span>
            </label>
            <input type="tel" name="phone" inputMode="tel" placeholder="PHONE (OPTIONAL) — SMS ALERTS" aria-label="Phone number, optional" autoComplete="tel"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
            {phone.trim() && (
              <label className="consent-row gate-consent">
                <input type="checkbox" name="sms-consent" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
                <span>I agree to receive automated SMS alerts from Dark Divine. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
              </label>
            )}
            {(live || !campaign) && (
              <input className="code" type="text" name="access-code" required placeholder="ACCESS CODE" aria-label="Access code"
                value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck="false" ref={codeRef} />
            )}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Checking…' : (campaign ? (live ? 'Enter Private Preorder' : 'Notify Me When It Opens') : 'Enter')}
            </button>
          </form>
        )}
        <div className="err" role="status" aria-live="polite">{err}</div>
        {(live || !campaign) && !joined && (
          <div className="alt">No code? <button type="button" onClick={joinList} disabled={busy}>Join the list</button> — codes go out before every {campaign ? 'preorder' : 'drop'}.</div>
        )}
        {CONFIG.gateGuestBypass !== false && (
          <div className="guest"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { unlock(); onDone?.(); }}>Browse as guest</button></div>
        )}
      </div>
    </div>
  );
}
