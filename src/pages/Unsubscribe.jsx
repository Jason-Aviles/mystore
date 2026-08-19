import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase, hasSupabase } from '../lib/supabase';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const email = (params.get('email') || '').toLowerCase();
  const [state, setState] = useState('working'); // working | done | error

  useEffect(() => {
    if (!email) { setState('error'); return; }
    if (!hasSupabase) { setState('done'); return; }
    // definer RPC: anon has no direct UPDATE on email_signups anymore
    supabase.rpc('set_unsubscribed', { p_email: email })
      .then(({ error }) => setState(error ? 'error' : 'done'));
  }, [email]);

  return (
    <section className="section wrap" style={{ textAlign: 'center', minHeight: '55vh' }}>
      <h1 className="display" style={{ fontSize: 'clamp(24px,4vw,36px)' }}>
        {state === 'done' ? "You're Off The List" : state === 'error' ? 'Something Broke' : 'One Second…'}
      </h1>
      <p style={{ color: 'var(--silver)', margin: '16px auto 26px', maxWidth: '46ch' }}>
        {state === 'done' && <>No more emails to <b style={{ color: 'var(--bone)' }}>{email}</b>. Change your mind before the next run? The signup box is always at the bottom of the homepage.</>}
        {state === 'error' && <>We couldn't process that automatically. Email contact@darkdivine.store and we'll remove you by hand — no questions.</>}
      </p>
      <Link className="btn btn-ghost" to="/">Back to the store</Link>
    </section>
  );
}
