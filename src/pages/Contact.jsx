import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { createSupportRequest } from '../lib/support';

function Confirmation({ result, responseTime }) {
  if (!result) return null;
  return (
    <div className="support-confirmation" role="status" aria-live="polite" data-support-reference={result.reference}>
      <b>Request {result.reference} received.</b>
      <span>Save this number. A real person replies {responseTime}.</span>
    </div>
  );
}

function Failure({ message, email }) {
  if (!message) return null;
  return (
    <div className="support-failure" role="alert">
      <b>{message}</b> Your entries are still here. Try again or email <a href={`mailto:${email}`}>{email}</a> directly.
    </div>
  );
}

export default function Contact() {
  const { CONFIG } = useStore();
  const [busy, setBusy] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [messageResult, setMessageResult] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [messageError, setMessageError] = useState('');

  async function submitTrack(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setBusy('tracking');
    setTrackError('');
    setTrackResult(null);
    try {
      const result = await createSupportRequest({
        kind: 'tracking',
        name: values.get('name'),
        email: values.get('order-email'),
        orderNumber: values.get('order-number'),
        subject: `Tracking request — ${values.get('order-number')}`,
        message: 'Please resend my tracking link and current order status.',
      });
      setTrackResult(result);
      form.reset();
    } catch (error) {
      setTrackError(error.message || 'Your tracking request could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function submitContact(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setBusy('message');
    setMessageError('');
    setMessageResult(null);
    try {
      const result = await createSupportRequest({
        kind: 'message',
        name: values.get('name'),
        email: values.get('email'),
        subject: 'Storefront support request',
        message: values.get('message'),
      });
      setMessageResult(result);
      form.reset();
    } catch (error) {
      setMessageError(error.message || 'Your message could not be saved.');
    } finally {
      setBusy('');
    }
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

        <div className="prose support-page" id="track">
          <h2 className="display">Track Your Order</h2>
          <p>Every order gets a tracking number by email the moment it ships. Need it again? Send the details here and keep the request number we give you.</p>
          <form data-support-form="tracking" onSubmit={submitTrack} className="support-form support-form-track">
            <input type="text" name="name" required maxLength="100" placeholder="Name on the order" aria-label="Name on the order" autoComplete="name" />
            <input type="text" name="order-number" required maxLength="80" placeholder="Order number (e.g. #1042)" aria-label="Order number" autoComplete="off" spellCheck="false" />
            <input type="email" name="order-email" required maxLength="320" placeholder="Email used at checkout" aria-label="Email" autoComplete="email" spellCheck="false" />
            <button className="btn" type="submit" disabled={busy === 'tracking'}>{busy === 'tracking' ? 'Saving request…' : 'Request My Tracking'}</button>
          </form>
          <Confirmation result={trackResult} responseTime={CONFIG.supportResponse} />
          <Failure message={trackError} email={CONFIG.supportEmail} />

          <h2 className="display">Send a Message</h2>
          <form data-support-form="message" onSubmit={submitContact} className="support-form">
            <input type="text" name="name" required maxLength="100" placeholder="Name" aria-label="Name" autoComplete="name" />
            <input type="email" name="email" required maxLength="320" placeholder="Email" aria-label="Email" autoComplete="email" spellCheck="false" />
            <textarea name="message" required maxLength="4000" rows="5" placeholder="What's going on? Include your order number if you have one." aria-label="Message" />
            <button className="btn" type="submit" disabled={busy === 'message'}>{busy === 'message' ? 'Saving message…' : 'Send Message'}</button>
          </form>
          <Confirmation result={messageResult} responseTime={CONFIG.supportResponse} />
          <Failure message={messageError} email={CONFIG.supportEmail} />

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
