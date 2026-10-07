import { useEffect, useState } from 'react';
import { adminGetSettings, adminReplaceSettings, isLive } from './adminData';

/* ONE switch for "private preorder / waitlist mode".
   ON  → the gate can't be skipped (no "Browse as guest"), joining the list
         never unlocks anything, every store page sends visitors to the
         drop, and checkout refuses anything but the drop's preorder pieces
         (and those need a valid access code — enforced on the server).
   OFF → the normal storefront is back.
   Saved to the DRAFT like every setting: Preview, then Publish. */
export default function LockdownCard({ onSaved }) {
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminGetSettings().then((s) => setOn(s.preorderOnlyLock === true && s.gateGuestBypass === false)).catch(() => setOn(false));
  }, []);
  if (!isLive || on === null) return null;

  async function toggle() {
    setBusy(true); setMsg('');
    try {
      const s = await adminGetSettings();
      const next = on
        ? { ...s, preorderOnlyLock: false, gateGuestBypass: true }
        : { ...s, gateEnabled: true, gateGuestBypass: false, preorderOnlyLock: true };
      await adminReplaceSettings(next);
      setOn(!on);
      setMsg(on
        ? 'Lockdown OFF saved to the draft — Publish to reopen the store.'
        : 'Lockdown ON saved to the draft — Preview it, then Publish to lock the store.');
      onSaved?.();
    } catch (e) { setMsg(e.message || 'Could not save'); }
    setBusy(false);
  }

  return (
    <div className={`lockdown-card ${on ? 'on' : ''}`}>
      <div>
        <b>Store lockdown {on ? '— ON (in draft)' : '— off'}</b>
        <p>
          When on: visitors only see the gate (email + phone sign-up, access code). Joining the list never lets anyone in —
          only a valid code does. Regular products can’t be bought, and preorder pieces need a valid code at checkout,
          checked on the server. Policy pages stay reachable (required when collecting emails).
        </p>
      </div>
      <button className={`btn btn-sm ${on ? 'btn-ghost' : ''}`} type="button" onClick={toggle} disabled={busy}>
        {busy ? 'Saving…' : on ? 'Turn lockdown off' : 'Turn lockdown on'}
      </button>
      {msg && <small className="lockdown-msg">{msg}</small>}
    </div>
  );
}
