import { useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';

/* Change the admin password from inside the panel (Supabase Auth). */
export default function Account() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });

  async function save(e) {
    e.preventDefault();
    if (pw.length < 12) { setMsg({ ok: false, text: 'Use at least 12 characters.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: 'The two passwords don’t match.' }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `Could not change it — ${error.message}` }); return; }
    setPw(''); setPw2('');
    setMsg({ ok: true, text: 'Password changed. Use the new one next time you sign in.' });
  }

  if (!hasSupabase) return <p className="note-banner">Connect Supabase to manage your account.</p>;
  return (
    <>
      <div className="admin-head"><h1 className="display">Account</h1></div>
      <form className="admin-form" onSubmit={save} style={{ maxWidth: 420 }}>
        <fieldset>
          <legend>Change password</legend>
          <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={12} /></label>
          <label>Type it again<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={12} /></label>
          <small>At least 12 characters. A password manager is the safest place to keep it.</small>
        </fieldset>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        {msg.text && <p role="status" style={{ color: msg.ok ? 'var(--green)' : '#e8a0a3', fontSize: 13 }}>{msg.text}</p>}
      </form>
    </>
  );
}
