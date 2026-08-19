# Dark Divine — Email Flows

Five ready-to-paste HTML templates (inline-styled, table-based, email-client safe).
Load them into Shopify Email, Klaviyo, or Mailchimp and swap the `{{placeholders}}`.

## Flows & timing

| Flow | Template | Trigger | Timing |
|---|---|---|---|
| Welcome | `welcome.html` | Email signup (popup, footer, gate) | Immediately |
| Abandoned cart #1 | `abandoned-cart.html` | Cart updated, no checkout | 1 hour after |
| Abandoned cart #2 | `abandoned-cart.html` (reuse, add `DARKDIVINECOMEBACK25`) | Still no checkout | 24 hours after |
| New drop | `new-drop.html` | Manual send per drop | 48h before drop + at drop |
| Thank you | `thank-you.html` | Order paid | Immediately |
| Back in stock | `back-in-stock.html` | Restock / units freed from unpaid orders | On event |

## Real discount codes (already exist in Shopify)

- `DARKDIVINEWELCOME10` — 10% off, welcome flow
- `DARKDIVINECOMEBACK25` — 25% off, win-back / abandoned cart #2
- `30DARKDIVINEFOREVER` — 30% off, VIP/loyalty use

## Placeholders used

`{{first_name}}`, `{{cart_items}}`, `{{cart_url}}`, `{{order_number}}`,
`{{tracking_url}}`, `{{product_name}}`, `{{product_url}}`, `{{drop_name}}`, `{{drop_date}}`

## Notes

- Sender name: **DARK DIVINE** · reply-to: support@darkdivine.store
- Subject lines are included as an HTML comment at the top of each file.
- Keep the one-email-per-drop promise made on the site — it's a trust signal.
