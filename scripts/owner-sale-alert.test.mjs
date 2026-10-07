import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildOwnerSaleAlert,
  sendOwnerSaleAlerts,
} from '../supabase/functions/_shared/owner-sale-alert.mjs';

const sale = {
  orderId: '12345678-abcd-ef01-2345-6789abcdef01',
  totalCents: 12999,
  currency: 'usd',
  customerEmail: 'buyer@example.com',
  items: [
    { title: 'Ashes Hoodie', qty: 2, option1: 'M', option2: 'Black' },
    { title: 'Divine Tee', qty: 1, option1: 'L', option2: null },
  ],
};

test('buildOwnerSaleAlert creates concise email and SMS sale summaries', () => {
  const alert = buildOwnerSaleAlert(sale);

  assert.equal(alert.subject, 'New Dark Divine sale — $129.99');
  assert.match(alert.text, /Order 12345678/);
  assert.match(alert.text, /2x Ashes Hoodie \(M \/ Black\)/);
  assert.match(alert.text, /buyer@example\.com/);
  assert.match(alert.sms, /^Dark Divine sale: \$129\.99 · Order 12345678/);
  assert.ok(alert.sms.length <= 320);
});

test('sendOwnerSaleAlerts sends only configured private channels', async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 200, text: async () => '' };
  };

  const result = await sendOwnerSaleAlerts({
    sale,
    fetcher,
    secrets: {
      ownerEmail: 'owner@example.com',
      ownerPhone: '+15555550123',
      resendApiKey: 'resend-secret',
      resendFrom: 'Dark Divine <sales@example.com>',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'twilio-secret',
      twilioFrom: '+15555550999',
    },
  });

  assert.deepEqual(result, { email: 'sent', sms: 'sent' });
  assert.equal(requests.length, 2);

  const email = requests.find((request) => request.url === 'https://api.resend.com/emails');
  assert.ok(email);
  assert.equal(JSON.parse(email.init.body).to, 'owner@example.com');

  const sms = requests.find((request) => request.url.includes('/Messages.json'));
  assert.ok(sms);
  assert.match(String(sms.init.body), /To=%2B15555550123/);
});

test('sendOwnerSaleAlerts skips channels whose secrets are incomplete', async () => {
  const result = await sendOwnerSaleAlerts({
    sale,
    fetcher: async () => assert.fail('fetch must not be called'),
    secrets: { ownerEmail: 'owner@example.com' },
  });

  assert.deepEqual(result, { email: 'skipped', sms: 'skipped' });
});

test('sendOwnerSaleAlerts contains provider failures', async () => {
  const result = await sendOwnerSaleAlerts({
    sale,
    fetcher: async () => ({ ok: false, status: 503, text: async () => 'unavailable' }),
    secrets: {
      ownerEmail: 'owner@example.com',
      resendApiKey: 'resend-secret',
      resendFrom: 'Dark Divine <sales@example.com>',
    },
  });

  assert.deepEqual(result, { email: 'failed', sms: 'skipped' });
});

test('every paid order (Stripe + PayPal) wires into the private owner alerts', async () => {
  const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
  const core = await read('../supabase/functions/_shared/checkout-core.ts');
  const webhook = await read('../supabase/functions/stripe-webhook/index.ts');
  const paypal = await read('../supabase/functions/paypal-capture/index.ts');

  // the shared paid-order path sends the alert with the right secrets
  assert.match(core, /import \{ sendOwnerSaleAlerts \}/);
  assert.match(core, /sendOwnerSaleAlerts\(\{/);
  assert.match(core, /ownerEmail:\s*Deno\.env\.get\('OWNER_SALE_EMAIL'\)/);
  assert.match(core, /ownerPhone:\s*Deno\.env\.get\('OWNER_SALE_PHONE'\)/);

  // both providers go through it, passing the real charged total
  assert.match(webhook, /markOrderPaid\(\{/);
  assert.match(webhook, /totalCents:\s*session\.amount_total/);
  assert.match(paypal, /markOrderPaid\(\{/);
  assert.match(paypal, /totalCents:/);
});
