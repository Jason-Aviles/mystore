import { useEffect, useRef, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';

/* PayPal Smart Buttons with SERVER-SIDE pricing + capture.
   createOrder → paypal-create-order (DB prices, stock, preorder rules,
   pending order row — the same core as the Stripe checkout).
   onApprove   → paypal-capture (verifies amount + ship country, captures,
   then marks the order paid: address, email, owner alert, inventory).
   The browser never decides the amount and never records the sale.

   Needs VITE_PAYPAL_CLIENT_ID (public) here, and PAYPAL_CLIENT_ID +
   PAYPAL_CLIENT_SECRET + PAYPAL_ENV in Supabase Edge Function secrets. */
const CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

let sdkPromise = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => resolve(window.paypal);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return sdkPromise;
}

async function readBody(data, error) {
  if (data) return data;
  try { return await error?.context?.json(); } catch { return null; }
}

/** getPayload() → { order_id, email, items, country, origin } (same as Stripe)
    onCreated(order_id, access_token) · onCheckoutError(body) · onPaid(result) */
export default function PayPalButtons({ getPayload, onCreated, onCheckoutError, onPaid, disabled }) {
  const box = useRef(null);
  const latest = useRef({ getPayload, onCreated, onCheckoutError, onPaid });
  latest.current = { getPayload, onCreated, onCheckoutError, onPaid };
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(true); // until the server confirms PayPal is set up
  const orderRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID || !hasSupabase) return;
    let alive = true;
    supabase.functions.invoke('paypal-create-order', { body: { probe: true } })
      // same app on both sides, or no button: a browser on one PayPal app and
      // a server on another (e.g. sandbox vs live) can never complete a payment
      // and never a SANDBOX (test-money) PayPal on the real store — test mode
      // only renders in local dev builds
      .then(({ data }) => {
        if (alive && data?.configured && data.client_id === CLIENT_ID
          && (data.env === 'live' || import.meta.env.DEV)) setHidden(false);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!CLIENT_ID || !hasSupabase || !box.current || hidden) return undefined;
    let cancelled = false;
    let buttons;
    loadSdk().then((paypal) => {
      if (cancelled || !box.current) return;
      box.current.innerHTML = '';
      buttons = paypal.Buttons({
        style: { layout: 'horizontal', color: 'black', shape: 'rect', label: 'paypal', height: 45, tagline: false },
        createOrder: async () => {
          setErr('');
          const { data, error } = await supabase.functions.invoke('paypal-create-order', { body: latest.current.getPayload() });
          const body = await readBody(data, error);
          if (body?.paypal_order_id) {
            orderRef.current = body.order_id;
            latest.current.onCreated?.(body.order_id, body.access_token);
            return body.paypal_order_id;
          }
          if (body?.error === 'paypal_not_configured') setHidden(true);
          else latest.current.onCheckoutError?.(body);
          throw new Error(body?.error || 'paypal_create_failed'); // closes the PayPal window
        },
        onApprove: async (data, actions) => {
          const { data: res, error } = await supabase.functions.invoke('paypal-capture', {
            body: { paypal_order_id: data.orderID, order_id: orderRef.current },
          });
          const body = await readBody(res, error);
          if (body?.ok) { latest.current.onPaid?.(body); return undefined; }
          if (body?.error === 'declined' && body.restart) return actions.restart(); // pick another card in PayPal
          if (body?.error === 'ship_country') {
            setErr(`Your PayPal shipping address is in ${body.country === 'CA' ? 'Canada' : 'the US'}, but the cart is set to ship to ${body.country === 'CA' ? 'the US' : 'Canada'}. Nothing was charged — switch “Ship to” above and pay again.`);
          } else if (body?.error === 'ship_unsupported') {
            setErr('We currently ship to the US and Canada only. Nothing was charged — email us about other countries.');
          } else {
            setErr('PayPal didn’t complete — nothing was charged. Try again, or use card checkout above.');
          }
          return undefined;
        },
        onCancel: () => setErr(''),
        onError: () => setErr((e) => e || 'PayPal hit an error — nothing was charged. Use card checkout above or try again.'),
      });
      buttons.render(box.current).catch(() => {});
    }).catch(() => setErr('PayPal failed to load — use card checkout above.'));
    return () => { cancelled = true; try { buttons?.close?.(); } catch { /* already gone */ } };
  }, [hidden]);

  if (!CLIENT_ID || !hasSupabase || hidden) return null;
  return (
    <div className="paypal-box" aria-disabled={disabled || undefined} style={disabled ? { pointerEvents: 'none', opacity: 0.45 } : undefined}>
      <div className="pay-divider">or</div>
      <div ref={box} />
      {err && <p role="alert" style={{ color: '#e8a0a3', fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  );
}

export const hasPayPal = Boolean(CLIENT_ID) && hasSupabase;
