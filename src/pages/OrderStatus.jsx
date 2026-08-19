import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { fetchOrderStatus, readOrderRef, PRODUCTION_STAGES } from '../lib/preorder';
import Reveal from '../components/Reveal';

/* Customer order-status page. Access requires the order id AND its
   unguessable token (both checked server-side by the order-status Edge
   Function) — the link arrives in the confirmation email, and the buyer's
   own browser remembers its last order. There is no email/order-number
   lookup on purpose: those are guessable, tokens are not. */
export default function OrderStatus() {
  const [params] = useSearchParams();
  const { CONFIG, money } = useStore();
  const [state, setState] = useState('loading'); // loading | ok | notfound | none
  const [order, setOrder] = useState(null);

  const o = params.get('o');
  const t = params.get('t');

  useEffect(() => {
    let id = o, tok = t;
    if (!id || !tok) {
      // no link? fall back to this browser's own last order
      const ref = readOrderRef();
      if (ref?.orderId && ref?.token) { id = ref.orderId; tok = ref.token; }
    }
    if (!id || !tok) { setState('none'); return; }
    fetchOrderStatus(id, tok).then((res) => {
      if (res.ok) { setOrder(res.order); setState('ok'); }
      else setState('notfound');
    });
  }, [o, t]);

  const fmt = (d) => (d ? new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const stageIdx = order?.production_status
    ? PRODUCTION_STAGES.findIndex(([k]) => k === order.production_status)
    : -1;
  const exception = ['delayed', 'cancelled', 'refunded'].includes(order?.production_status);

  return (
    <section className="section wrap" style={{ maxWidth: 760 }}>
      <Reveal>
        <span className="eyebrow">Order Status</span>
        <h1 style={{ fontSize: 'clamp(28px,5vw,44px)', margin: '14px 0 18px' }}>Track Your Order</h1>
      </Reveal>

      {state === 'loading' && <p style={{ color: 'var(--silver)' }}>Looking up your order…</p>}

      {state === 'none' && (
        <Reveal>
          <p style={{ color: 'var(--silver)', maxWidth: '54ch' }}>
            Use the private status link from your confirmation email — it opens this page with your
            order already loaded. Can’t find it? Email <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> from
            your order email and we’ll resend it {CONFIG.supportResponse}.
          </p>
        </Reveal>
      )}

      {state === 'notfound' && (
        <Reveal>
          <p style={{ color: 'var(--silver)', maxWidth: '54ch' }}>
            That link didn’t match an order — it may be incomplete or outdated. Email{' '}
            <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> from your order email
            and we’ll send a fresh status link {CONFIG.supportResponse}.
          </p>
        </Reveal>
      )}

      {state === 'ok' && order && (
        <>
          <Reveal className="os-head">
            <div className="os-row"><span>Order</span><b data-scramble>#{order.number}</b></div>
            <div className="os-row"><span>Placed</span><b>{fmt(order.created_at)}</b></div>
            <div className="os-row"><span>Payment</span><b style={{ textTransform: 'capitalize' }}>{order.payment_status}</b></div>
            {order.campaign && <div className="os-row"><span>Preorder</span><b>{order.campaign.name}</b></div>}
            {(order.est_ship_start && order.est_ship_end) && (
              <div className="os-row"><span>Estimated shipping</span><b>{fmt(order.est_ship_start)} – {fmt(order.est_ship_end)}</b></div>
            )}
            {order.tracking && (
              <div className="os-row"><span>Tracking</span><b>{order.tracking}</b></div>
            )}
            {order.shipping && (order.shipping.line1 || order.shipping.city) && (
              <div className="os-row"><span>Shipping to</span><b style={{ fontWeight: 500 }}>
                {order.shipping.name}{order.shipping.name ? ', ' : ''}
                {[order.shipping.line1, order.shipping.line2, order.shipping.city, order.shipping.state, order.shipping.postal_code, order.shipping.country].filter(Boolean).join(', ')}
              </b></div>
            )}
            {order.balance_due > 0 && (
              <div className="os-row"><span>Preorder balance</span><b>
                {order.balance_status === 'paid'
                  ? `${money(order.balance_due)} — paid`
                  : order.balance_status === 'invoiced'
                    ? `${money(order.balance_due)} — invoice sent, check your email`
                    : `${money(order.balance_due)} — invoiced before shipping`}
              </b></div>
            )}
          </Reveal>
          {order.balance_due > 0 && order.balance_status !== 'paid' && (
            <Reveal className="os-balance" role="note">
              Your deposit is paid. The remaining balance of <b>{money(order.balance_due)}</b> is
              {order.balance_status === 'invoiced'
                ? ' now invoiced — Stripe emailed you a secure link to pay it. '
                : ' invoiced by email before your order ships. '}
              You approve that charge; nothing is billed automatically.
            </Reveal>
          )}

          {order.production_status && !exception && (
            <Reveal className="os-stages" aria-label="Production progress">
              {PRODUCTION_STAGES.map(([key, label], i) => (
                <div key={key} className={`os-stage ${i < stageIdx ? 'done' : ''} ${i === stageIdx ? 'now' : ''}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="os-lbl">{label}</span>
                </div>
              ))}
            </Reveal>
          )}
          {exception && (
            <Reveal className="os-exception">
              <b>{order.production_label}</b>
              {order.production_status === 'delayed' && (
                <p>This order is running behind its original window. The latest update below has the honest details — and if the new timeline doesn’t work, email us to cancel for a full refund.</p>
              )}
            </Reveal>
          )}

          {order.latest_update && (
            <Reveal className="os-update">
              <div className="lbl">Latest update — {fmt(order.latest_update.created_at)}</div>
              <h3 style={{ margin: '6px 0' }}>{order.latest_update.title}</h3>
              <p style={{ color: 'var(--silver)', whiteSpace: 'pre-line' }}>{order.latest_update.body}</p>
            </Reveal>
          )}

          <Reveal className="os-items">
            <div className="lbl">Items</div>
            <ul>
              {order.items.map((it, i) => (
                <li key={i}>
                  <span>{it.title}{[it.option1, it.option2].filter(Boolean).length ? ` — ${[it.option1, it.option2].filter(Boolean).join(' / ')}` : ''} × {it.qty}</span>
                  <b>{money(it.price * it.qty)}</b>
                </li>
              ))}
            </ul>
            <div className="os-row os-total"><span>Total</span><b>{money(order.total)}</b></div>
          </Reveal>

          <Reveal style={{ marginTop: 26 }}>
            <p style={{ fontSize: 13, color: 'var(--silver)' }}>
              Questions, size swaps, or cancellations: <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a> —
              we reply {CONFIG.supportResponse}. Cancellations before shipping are refunded in full to your original payment method.
            </p>
          </Reveal>
        </>
      )}

      <Reveal style={{ marginTop: 30 }}>
        <Link className="btn btn-ghost" to="/shop">Back to the shop</Link>
      </Reveal>
    </section>
  );
}
