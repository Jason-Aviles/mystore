import { useEffect, useRef, useState } from 'react';

/* Real PayPal Smart Buttons — renders only when VITE_PAYPAL_CLIENT_ID is set.
   Setup (free): developer.paypal.com → My Apps → Create App (Live) →
   copy the Client ID into .env / Netlify env. Money lands in your PayPal
   business account; no server needed for capture. */
const CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

let sdkPromise = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=USD&intent=capture`;
    s.onload = () => resolve(window.paypal);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function PayPalButtons({ amount, description, onPaid }) {
  const box = useRef(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!CLIENT_ID || !box.current) return;
    let cancelled = false;
    loadSdk().then((paypal) => {
      if (cancelled || !box.current) return;
      box.current.innerHTML = '';
      paypal.Buttons({
        style: { layout: 'horizontal', color: 'black', shape: 'rect', label: 'paypal', height: 45, tagline: false },
        createOrder: (_data, actions) => actions.order.create({
          purchase_units: [{
            amount: { currency_code: 'USD', value: amount.toFixed(2) },
            description: (description || 'Dark Divine order').slice(0, 120),
          }],
        }),
        onApprove: async (_data, actions) => {
          const details = await actions.order.capture();
          onPaid?.({
            provider: 'paypal',
            ref: details.id,
            payer_email: details?.payer?.email_address || null,
          });
        },
        onError: () => setErr('PayPal hit an error — use card checkout above or try again.'),
      }).render(box.current);
    }).catch(() => setErr('PayPal failed to load — use card checkout above.'));
    return () => { cancelled = true; };
  }, [amount]);

  if (!CLIENT_ID) return null;
  return (
    <div className="paypal-box">
      <div className="pay-divider">or</div>
      <div ref={box} />
      {err && <p style={{ color: '#e8a0a3', fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  );
}

export const hasPayPal = Boolean(CLIENT_ID);
