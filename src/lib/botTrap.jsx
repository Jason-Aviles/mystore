/* Signup bot trap. Since Oct 2026 a bot has been "subscription bombing" our
   forms — entering strangers' real addresses so our welcome email lands in
   their inbox. Three cheap checks, no third-party widget:
     1. honeypot: an off-screen field people never see or fill;
     2. speed: a form submitted < MIN_MS after the page loaded;
     3. Gmail dot-spam: Gmail ignores dots, bots pad addresses with them
        (l.0.0.k1e.1.t.zke… ) — real addresses rarely carry 3+.
   A flagged submit gets the same "you're in" UI, but nothing is saved or
   sent, so the bot learns nothing. The server repeats check 3. */

const PAGE_START = Date.now();
const MIN_MS = 2500;
const HP_NAME = 'company_website';

export function suspiciousEmail(email) {
  const [local = '', domain = ''] = String(email).trim().toLowerCase().split('@');
  if (!/^(gmail|googlemail)\.com$/.test(domain)) return false;
  return (local.split('+')[0].match(/\./g) || []).length >= 3;
}

/** true when the submit should be silently dropped */
export function isBotSubmit(form, email) {
  const hp = form?.elements?.[HP_NAME]?.value;
  if (hp) return true;
  if (Date.now() - PAGE_START < MIN_MS) return true;
  return suspiciousEmail(email);
}

/** honeypot field — render inside every signup <form> */
export function BotTrap() {
  return (
    <input type="text" name={HP_NAME} tabIndex={-1} autoComplete="off" aria-hidden="true"
      defaultValue=""
      style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }} />
  );
}
