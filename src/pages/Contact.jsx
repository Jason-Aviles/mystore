import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { hasSupabase, supabase } from '../lib/supabase';

export default function Contact() {
  const { CONFIG } = useStore();
  const [trackMsg, setTrackMsg] = useState('');
  const [contactMsg, setContactMsg] = useState('');

  /* keep a copy of the request server-side (insert-only: an existing
     subscriber's row — and their consent — is never overwritten here) */
  async function logSupportRequest(email, meta) {
    if (!hasSupabase) return;
    await supabase.from('email_signups')
      .insert({ email: email.toLowerCase(), source: 'support', consent: false, meta })
      .then(() => {}, () => {}); // duplicate email = fine, the mailto carries the message
  }

  /* No automated resend exists yet, so promise exactly what happens: the
     request opens in their mail app and a human answers it. */
  function submitTrack(e) {
    e.preventDefault();
    const [orderNo, email] = [...e.target.elements].filter((el) => el.tagName === 'INPUT').map((el) => el.value);
    logSupportRequest(email, { kind: 'tracking_request', order: orderNo });
    window.location.href = `mailto:${CONFIG.supportEmail}?subject=${encodeURIComponent(`Tracking request — order ${orderNo}`)}&body=${encodeURIComponent(`Order number: ${orderNo}\nCheckout email: ${email}\n\nPlease resend my tracking link.`)}`;
    setTrackMsg(`Opening your email app — hit send and tracking comes back ${CONFIG.supportResponse}. No email app? Write to ${CONFIG.supportEmail} directly.`);
    e.target.reset();
  }

  async function submitContact(e) {
    e.preventDefault();
    const [name, email, msg] = [...e.target.elements].filter((el) => el.tagName !== 'BUTTON').map((el) => el.value);
    await logSupportRequest(email, { kind: 'support_message', name, message: String(msg).slice(0, 2000) });
    window.location.href = `mailto:${CONFIG.supportEmail}?subject=${encodeURIComponent('Support — ' + name)}&body=${encodeURIComponent(msg + '\n\nFrom: ' + email)}`;
    setContactMsg('Opening your email app — hit send and we’ll take it from there.');
  }

  return (
    <>
      <section className="page-head mesh">
        <div className="wrap">
          <span className="eyebrow">We Actually Answer</span>
          <h1 data-split-title>Support</h1>
        </div>
      </section>
      <div className="wrap">
        <div className="info-cards">
          <div className="info-card">
            <h3 className="display">Email Us</h3>
            <p>Real replies {CONFIG.supportResponse}.<br />
              <a href={`mailto:${CONFIG.supportEmail}`} style={{ color: 'var(--bone)' }}>{CONFIG.supportEmail}</a></p>
          </div>
          <div className="info-card">
            <h3 className="display">Sizing Help</h3>
            <p>Send your height and weight — we'll tell you exactly what to order. Or check the <Link to="/size-guide" style={{ color: 'var(--bone)' }}>size guide</Link>.</p>
          </div>
          <div className="info-card">
            <h3 className="display">DM Us</h3>
            <p>Fastest for quick questions: DM <a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bone)' }}>{CONFIG.instagramHandle}</a> on Instagram.</p>
          </div>
        </div>

        <div className="prose" id="track" style={{ paddingTop: 10 }}>
          <h2 className="display">Track Your Order</h2>
          <p>Every order gets a tracking number by email the moment it ships. Need it again? Send us your order details — a human resends it, {CONFIG.supportResponse}.</p>
          <form onSubmit={submitTrack} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            <input type="text" name="order-number" required placeholder="Order number (e.g. #1042)" aria-label="Order number" autoComplete="off" spellCheck="false" />
            <input type="email" name="order-email" required placeholder="Email used at checkout" aria-label="Email" autoComplete="email" spellCheck="false" />
            <button className="btn" type="submit">Request My Tracking</button>
          </form>
          <p style={{ minHeight: 22, marginTop: 12, color: 'var(--silver)' }} role="status">{trackMsg}</p>

          <h2 className="display">Send a Message</h2>
          <form onSubmit={submitContact} style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <input type="text" name="name" required placeholder="Name" aria-label="Name" autoComplete="name" />
            <input type="email" name="email" required placeholder="Email" aria-label="Email" autoComplete="email" spellCheck="false" />
            <textarea name="message" required rows="5" placeholder="What's going on? Include your order number if you have one." aria-label="Message" />
            <button className="btn" type="submit">Send Message</button>
          </form>
          <p style={{ minHeight: 22, marginTop: 12, color: 'var(--silver)' }} role="status">{contactMsg}</p>

          <h2 className="display">Response Times</h2>
          <ul>
            <li>Order issues and tracking — {CONFIG.supportResponse}</li>
            <li>Sizing and product questions — {CONFIG.supportResponse}</li>
            <li>Returns and refunds — approved or answered {CONFIG.returnsResponse}</li>
          </ul>
        </div>
      </div>
    </>
  );
}
