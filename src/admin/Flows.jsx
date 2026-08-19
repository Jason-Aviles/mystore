import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { adminGetSettings, adminSaveSettings, isLive } from './adminData';

/* Flows — the automation control room. One card per automated email:
   what triggers it, when it sends, on/off, and how many it has sent.
   Toggles persist to site_settings.data.flows (absent key = enabled);
   the send-flow Edge Function reads the same keys before every send. */

export const FLOW_DEFS = [
  ['welcome', 'Welcome + 10% code', 'Email signup (popup, footer, gate)', 'Immediately'],
  ['abandoned_1', 'Abandoned checkout #1', 'Checkout started, not paid', '1 hour after'],
  ['abandoned_2', 'Abandoned checkout #2 — COMEBACK25', 'Still not paid', '24 hours after'],
  ['back_in_stock', 'Back in stock', 'Waitlisted product has units again', 'Within 30 min'],
  ['thank_you', 'Thank you / order confirmed', 'Payment confirmed by Stripe', 'Immediately'],
  ['shipped', 'Shipped + tracking', 'Order marked shipped in admin', 'Immediately'],
];

export default function Flows() {
  const [flows, setFlows] = useState(null); // { welcome: true, ... }
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState('');

  useEffect(() => {
    adminGetSettings().then((s) => setFlows({ ...(s.flows || {}) }));
    if (isLive) {
      supabase.from('flow_sends').select('flow').then(({ data }) => {
        const c = {};
        (data || []).forEach((r) => { c[r.flow] = (c[r.flow] || 0) + 1; });
        setCounts(c);
      });
    }
  }, []);

  if (!flows) return <p style={{ color: 'var(--silver)' }}>Loading…</p>;

  async function toggle(key) {
    const next = { ...flows, [key]: flows[key] === false }; // absent/true → false, false → true
    setFlows(next);
    setSaving(key);
    // merge-save: adminSaveSettings patches over existing settings
    await adminSaveSettings({ flows: next });
    setSaving('');
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Flows</h1>
        <span className={`admin-mode ${isLive ? 'live' : ''}`}>{isLive ? 'LIVE — sending via Resend' : 'DEMO — flows send only when Supabase is connected'}</span>
      </div>
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Toggles save locally so you can stage your setup. Connect Supabase +
          Resend and deploy <b>send-flow</b> + <b>flow-cron</b> (see supabase/functions) — then these
          automations run for real and the sent counters light up.
        </div>
      )}

      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {FLOW_DEFS.map(([key, name, trigger, timing]) => {
          const on = flows[key] !== false;
          return (
            <div className="stat-card" key={key} style={{ opacity: on ? 1 : 0.55 }}>
              <div className="lbl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{name}</span>
                <button className={`btn btn-sm ${on ? '' : 'btn-ghost'}`} disabled={saving === key}
                  onClick={() => toggle(key)}>
                  {saving === key ? '…' : on ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="sub" style={{ marginTop: 10 }}>Trigger: {trigger}</div>
              <div className="sub">Sends: {timing}</div>
              <div className="val" style={{ fontSize: 22, marginTop: 10 }}>
                {isLive ? (counts[key] || 0) : '—'}
                <span style={{ fontSize: 11, color: 'var(--silver)', marginLeft: 8 }}>sent</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="note-banner" style={{ marginTop: 22 }}>
        Every flow email skips unsubscribed addresses and never sends twice for the same trigger
        (deduped server-side). Discount codes used: <b>DARKDIVINEWELCOME10</b> (welcome),
        <b> DARKDIVINECOMEBACK25</b> (abandoned #2) — keep both active in Stripe.
      </div>
    </>
  );
}
