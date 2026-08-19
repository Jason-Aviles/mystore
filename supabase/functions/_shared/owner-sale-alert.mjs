function money(totalCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(totalCents || 0) / 100);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function itemLabel(item) {
  const options = [item.option1, item.option2].filter(Boolean).join(' / ');
  return `${Number(item.qty || 0)}x ${String(item.title || 'Item')}${options ? ` (${options})` : ''}`;
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : '';
}

export function buildOwnerSaleAlert(sale) {
  const total = money(sale.totalCents, sale.currency);
  const orderNumber = String(sale.orderId || '').slice(0, 8).toUpperCase();
  const items = (sale.items || []).map(itemLabel);
  const customer = String(sale.customerEmail || 'Not provided');
  const lines = [
    `New Dark Divine sale: ${total}`,
    `Order ${orderNumber}`,
    `Customer: ${customer}`,
    '',
    ...items,
  ];
  const smsItems = items.length ? ` · ${items.join(', ')}` : '';
  const sms = `Dark Divine sale: ${total} · Order ${orderNumber}${smsItems}`.slice(0, 320);

  return {
    subject: `New Dark Divine sale — ${total}`,
    text: lines.join('\n'),
    html: `<h1>New sale: ${escapeHtml(total)}</h1><p><strong>Order:</strong> ${escapeHtml(orderNumber)}<br><strong>Customer:</strong> ${escapeHtml(customer)}</p><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
    sms,
  };
}

export async function sendOwnerSaleAlerts({ sale, secrets = {}, fetcher = fetch }) {
  const alert = buildOwnerSaleAlert(sale);
  const result = { email: 'skipped', sms: 'skipped' };

  if (secrets.ownerEmail && secrets.resendApiKey && secrets.resendFrom) {
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secrets.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: secrets.resendFrom,
          to: secrets.ownerEmail,
          subject: alert.subject,
          text: alert.text,
          html: alert.html,
        }),
      });
      result.email = response.ok ? 'sent' : 'failed';
    } catch {
      result.email = 'failed';
    }
  }

  const ownerPhone = normalizePhone(secrets.ownerPhone);
  if (ownerPhone && secrets.twilioAccountSid && secrets.twilioAuthToken && secrets.twilioFrom) {
    try {
      const response = await fetcher(
        `https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: ownerPhone,
            From: secrets.twilioFrom,
            Body: alert.sms,
          }),
        },
      );
      result.sms = response.ok ? 'sent' : 'failed';
    } catch {
      result.sms = 'failed';
    }
  }

  return result;
}
