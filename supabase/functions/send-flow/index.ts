// Supabase Edge Function: send-flow
// Sends ONE automated flow email (welcome / thank_you / abandoned_1 /
// abandoned_2 / back_in_stock / shipped) through Resend, with dedup +
// unsubscribe + per-flow admin toggles.
//
// Setup:
//   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM=contact@darkdivine.store
//   supabase functions deploy send-flow
//
// Body: { flow, email, vars? }  → { ok } | { ok:false, skipped|error }
// Dedup: unique (email, flow, dedup_key) row in flow_sends — insert-first.
// Toggles: site_settings.data.flows.<flow> === false disables a flow.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE = 'https://darkdivine.store';

/* Shared email-safe shell (mirrors emails/*.html: table layout, inline
   styles, brand header, unsubscribe footer). {{tokens}} filled per flow. */
function shell(inner: string, opts: { script?: boolean; transactional?: boolean } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141416;border:1px solid #2a2a2e;">
      <tr><td style="padding:36px 32px 8px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#f2f1ee;font-weight:bold;">DARK DIVINE</div>
        ${opts.script ? '<div style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#8e939c;margin-top:6px;">Illuminate the darkness within</div>' : ''}
      </td></tr>
      ${inner}
      <tr><td style="padding:0 32px 32px;font-family:Arial,sans-serif;color:#8e939c;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #2a2a2e;padding-top:20px;">
        Secure checkout &middot; 30-day returns &middot; <a href="mailto:contact@darkdivine.store" style="color:#c9c7c1;">contact@darkdivine.store</a><br><br>
        ${opts.transactional
          ? 'You are receiving this because of an order or request you made at darkdivine.store.'
          : '<a href="{{unsubscribe_url}}" style="color:#5a5f66;">Unsubscribe</a>'}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const P = 'padding:24px 32px 0;font-family:Arial,sans-serif;color:#c9c7c1;font-size:15px;line-height:1.6;';
const H = 'margin:0 0 14px;color:#f2f1ee;font-size:18px;font-weight:bold;';
const BTN = (href: string, label: string, bg = '#f2f1ee', fg = '#0a0a0b') =>
  `<tr><td style="padding:20px 32px 32px;" align="center"><a href="${href}" style="display:inline-block;background:${bg};color:${fg};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:3px;text-decoration:none;padding:15px 38px;">${label}</a></td></tr>`;
const CODE = (label: string, code: string) =>
  `<tr><td style="padding:20px 32px;" align="center"><div style="border:1px dashed #555;padding:16px;text-align:center;"><div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#8e939c;">${label}</div><div style="font-family:Georgia,serif;font-size:24px;letter-spacing:3px;color:#efb6c4;font-weight:bold;margin-top:6px;">${code}</div></div></td></tr>`;

const FLOWS: Record<string, { subject: string; html: string }> = {
  welcome: {
    subject: "You're in. Here's 10% — DARK DIVINE",
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">You're on the list.</p>
        <p style="margin:0 0 14px;">Three things are now true: you get drop dates first, you get the private access code before every release, and you get 10% off your first order — starting now.</p>
      </td></tr>
      ${CODE('YOUR CODE', '{{welcome_code}}')}
      ${BTN(SITE, 'SHOP THE DROP')}`, { script: true }),
  },
  thank_you: {
    subject: 'You were there for the run — DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Order {{order_number}} confirmed.</p>
        <p style="margin:0 0 14px;">Payment received. We pack within 2 business days and tracking follows the moment it ships. Once this run sells through, what you're holding doesn't exist again.</p>
        <p style="margin:0 0 14px;">Wear it. Tag <b style="color:#f2f1ee;">@darkdivine.official</b> — lookbook features get first pick of the next run.</p>
      </td></tr>
      ${BTN(SITE + '/shop', 'KEEP SHOPPING')}`),
  },
  abandoned_1: {
    subject: 'Your size is still in the cart — DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Still thinking it over?</p>
        <p style="margin:0 0 14px;">Fair. But this is a one-run brand — carts don't hold stock, and nothing gets reprinted. When your size sells through, it's gone for good.</p>
      </td></tr>
      ${BTN('{{cart_url}}', 'FINISH CHECKOUT', '#efb6c4')}`),
  },
  abandoned_2: {
    subject: 'Last call — 25% says come back | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Your run is about to leave without you.</p>
        <p style="margin:0 0 14px;">One production run, no restocks — and your cart doesn't hold stock. Here's 25% to finish it today.</p>
      </td></tr>
      ${CODE('25% OFF YOUR CART', 'DARKDIVINECOMEBACK25')}
      ${BTN('{{cart_url}}', 'FINISH CHECKOUT', '#efb6c4')}`),
  },
  back_in_stock: {
    subject: 'It came back — DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">{{product_name}} is available again.</p>
        <p style="margin:0 0 14px;">Stock came back on the piece you asked about — you're hearing it first, exactly as promised. Same rule as always: one run, and when it's gone, it's gone.</p>
      </td></tr>
      ${BTN('{{product_url}}', 'CLAIM IT', '#efb6c4')}`),
  },
  shipped: {
    subject: 'It left the building — tracking inside | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Order {{order_number}} is on the move.</p>
        <p style="margin:0 0 14px;">Your run left the building. Track it below — and get the fit-pic ready.</p>
      </td></tr>
      ${BTN('{{tracking_url}}', 'TRACK YOUR ORDER')}`, { transactional: true }),
  },

  /* ---------- private preorder lifecycle ----------
     Every date/number below comes from Supabase via {{tokens}} — these
     templates never invent a timeline of their own. */
  preorder_access: {
    subject: 'Access confirmed — {{campaign_name}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">You're inside the private preorder.</p>
        <p style="margin:0 0 14px;"><b style="color:#f2f1ee;">{{campaign_name}}</b> — every piece is made to order after the preorder closes{{close_line}}.</p>
        <p style="margin:0 0 14px;">Estimated shipping: {{ship_window_line}}. You'll get production updates by email at every stage.</p>
      </td></tr>
      ${BTN(SITE + '/shop', 'SHOP THE PREORDER', '#efb6c4')}`, { script: true, transactional: true }),
  },
  preorder_confirmation: {
    subject: 'Preorder confirmed — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Preorder {{order_number}} confirmed.</p>
        <p style="margin:0 0 14px;">Payment received for <b style="color:#f2f1ee;">{{campaign_name}}</b>. Your items are made after the preorder closes — estimated shipping {{ship_window}}. Preorder items may ship separately from ready-to-ship items.</p>
        {{balance_block}}
        <p style="margin:0 0 14px;">You'll receive production updates by email, and you can check your order's live status any time with your private link below. Questions or cancellations: reply to this email.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS', '#efb6c4')}`, { transactional: true }),
  },
  preorder_balance: {
    subject: 'Your preorder balance is ready — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Time to complete your preorder.</p>
        <p style="margin:0 0 14px;">Your deposit is paid and your order {{order_number}} is nearly ready. The remaining balance is <b style="color:#f2f1ee;">{{total}}</b>. Pay it securely below — it's a Stripe-hosted page, you approve the charge, and nothing was billed automatically.</p>
      </td></tr>
      ${BTN('{{pay_url}}', 'PAY BALANCE SECURELY', '#efb6c4')}`, { transactional: true }),
  },
  payment_receipt: {
    subject: 'Payment receipt — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Receipt for order {{order_number}}.</p>
        <p style="margin:0 0 14px;">Amount paid: <b style="color:#f2f1ee;">{{total}}</b>. Your card statement will show this charge from Dark Divine via Stripe.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  preorder_closing_reminder: {
    subject: '{{campaign_name}} closes {{close_date}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">The preorder window is closing.</p>
        <p style="margin:0 0 14px;"><b style="color:#f2f1ee;">{{campaign_name}}</b> closes on {{close_date}}. After that we go into production for the orders placed — nothing is made beyond them.</p>
      </td></tr>
      ${BTN(SITE + '/shop', 'COMPLETE YOUR PREORDER', '#efb6c4')}`),
  },
  preorder_closed: {
    subject: 'Preorder closed — production is next | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">{{campaign_name}} is closed.</p>
        <p style="margin:0 0 14px;">Your order {{order_number}} is locked in. Production is scheduled to begin around {{production_start}}, and your estimated shipping window is {{ship_window}}. We'll email you as each stage completes.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  production_started: {
    subject: 'Production has started — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Your pieces are being made.</p>
        <p style="margin:0 0 14px;">Production for <b style="color:#f2f1ee;">{{campaign_name}}</b> has started. Estimated shipping window: {{ship_window}}.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  production_update: {
    subject: 'Production update — {{campaign_name}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">{{update_title}}</p>
        <p style="margin:0 0 14px;white-space:pre-line;">{{update_body}}</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  qc_update: {
    subject: 'Quality control — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Your order is in quality control.</p>
        <p style="margin:0 0 14px;">Every piece from <b style="color:#f2f1ee;">{{campaign_name}}</b> is being checked before it ships. Estimated shipping window: {{ship_window}}.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  shipping_soon: {
    subject: 'Shipping soon — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Your order is being prepared for shipment.</p>
        <p style="margin:0 0 14px;">Packing is underway. Tracking arrives by email the moment your order ships.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  delay_notice: {
    subject: 'A delay on your order — the honest version | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">{{update_title}}</p>
        <p style="margin:0 0 14px;white-space:pre-line;">{{update_body}}</p>
        <p style="margin:0 0 14px;">New estimated shipping window: <b style="color:#f2f1ee;">{{ship_window}}</b>. If the new timeline doesn't work for you, reply to this email — you can cancel for a full refund.</p>
      </td></tr>
      ${BTN('{{status_url}}', 'VIEW ORDER STATUS')}`, { transactional: true }),
  },
  delivery_followup: {
    subject: 'It arrived — how does it fit? | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Order {{order_number}} was delivered.</p>
        <p style="margin:0 0 14px;">If anything's off — fit, print, stitching — reply to this email within 30 days and we'll make it right.</p>
      </td></tr>
      ${BTN(SITE + '/contact', 'CONTACT SUPPORT')}`, { transactional: true }),
  },
  review_request: {
    subject: 'One minute for the next run — DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">How did we do?</p>
        <p style="margin:0 0 14px;">You've had your pieces for a bit — a short honest review (good or bad) helps the next customer pick their size and helps us cut the next run better.</p>
      </td></tr>
      ${BTN('{{product_url}}', 'WRITE A REVIEW')}`),
  },
  cancellation_confirmation: {
    subject: 'Cancellation confirmed — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Order {{order_number}} is cancelled.</p>
        <p style="margin:0 0 14px;">Your refund of <b style="color:#f2f1ee;">{{total}}</b> is being processed and lands back on your original payment method within 5–10 business days.</p>
      </td></tr>`, { transactional: true }),
  },
  refund_confirmation: {
    subject: 'Refund issued — order {{order_number}} | DARK DIVINE',
    html: shell(`
      <tr><td style="${P}">
        <p style="${H}">Your refund is on the way.</p>
        <p style="margin:0 0 14px;"><b style="color:#f2f1ee;">{{total}}</b> was refunded to your original payment method for order {{order_number}}. Depending on your bank it appears within 5–10 business days.</p>
      </td></tr>`, { transactional: true }),
  },
};

/* Order/production emails go through even to marketing-unsubscribed
   customers — they are about a purchase, not promotion. */
const TRANSACTIONAL = new Set([
  'thank_you', 'shipped', 'preorder_access', 'preorder_confirmation',
  'payment_receipt', 'preorder_balance', 'preorder_closed', 'production_started', 'production_update',
  'qc_update', 'shipping_soon', 'delay_notice', 'delivery_followup',
  'cancellation_confirmation', 'refund_confirmation',
]);

function renderTemplate(html: string, vars: Record<string, string>) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { flow, email, vars = {} } = await req.json();
    const def = FLOWS[flow];
    const to = String(email ?? '').trim().toLowerCase();
    if (!def || !to.includes('@')) return json({ ok: false, error: 'bad flow or email' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('RESEND_FROM') ?? 'contact@darkdivine.store';
    if (!RESEND_KEY) return json({ ok: false, error: 'RESEND_API_KEY not set' }, 500);

    // toggle check: site_settings.data.flows.<flow> === false disables
    const { data: settings } = await supabase.from('site_settings').select('data').eq('id', 1).maybeSingle();
    if (settings?.data?.flows?.[flow] === false) return json({ ok: false, skipped: 'disabled' });

    // unsubscribe check — marketing flows only; order/production emails are
    // transactional and still reach customers who left the mailing list
    if (!TRANSACTIONAL.has(flow)) {
      const { data: sub } = await supabase.from('email_signups')
        .select('unsubscribed').eq('email', to).maybeSingle();
      if (sub?.unsubscribed) return json({ ok: false, skipped: 'unsubscribed' });
    }

    // dedup: insert-first makes it atomic
    const dedup = String(vars.dedup_key ?? vars.order_number ?? vars.product_url ?? 'once');
    const { error: dupErr } = await supabase.from('flow_sends')
      .insert({ email: to, flow, dedup_key: dedup });
    if (dupErr) return json({ ok: false, skipped: 'duplicate' });

    const allVars = {
      // welcome code follows the admin setting so the email always names
      // the same code the site shows after signup
      welcome_code: settings?.data?.welcomeCode || 'DARKDIVINEWELCOME10',
      ...vars,
      // derived phrasings — never claim a date the caller didn't supply
      close_line: vars.close_date ? ` on ${vars.close_date}` : '',
      ship_window_line: vars.ship_window || 'announced before the preorder closes',
      ship_window: vars.ship_window || 'announced before the preorder closes',
      // deposit balance renders as its own paragraph ONLY when a balance is owed
      balance_block: vars.balance_line
        ? `<p style="margin:0 0 14px;padding:12px 14px;border:1px solid #3a3a3e;color:#efb6c4;">${vars.balance_line}</p>`
        : '',
      unsubscribe_url: `${SITE}/unsubscribe?email=${encodeURIComponent(to)}`,
    };
    const html = renderTemplate(def.html, allVars);
    const subject = renderTemplate(def.subject, allVars);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `DARK DIVINE <${FROM}>`, to: [to], subject, html }),
    });
    if (!res.ok) {
      // free the dedup row so a transient Resend failure can retry
      await supabase.from('flow_sends').delete()
        .eq('email', to).eq('flow', flow).eq('dedup_key', dedup);
      return json({ ok: false, error: `resend ${res.status}` }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
