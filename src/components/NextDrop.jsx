import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { saveEmailSignup } from '../lib/marketing';
import EmblemFX from './EmblemFX';
import Reveal from './Reveal';
import Countdown from './Countdown';

/* "Up next" teaser for the drop after the current one. No prices or dates
   until the owner sets them — just the pieces and a way onto the list.
   Every word and image is editable in Admin → Site Settings → Next drop. */
export default function NextDrop() {
  const { CONFIG } = useStore();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  if (!CONFIG.nextDropEnabled) return null;
  const pics = [CONFIG.nextDropImage1, CONFIG.nextDropImage2].filter(Boolean);

  async function join(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('busy');
    try {
      await saveEmailSignup({ email, source: 'next_drop', meta: { drop: CONFIG.nextDropName } });
      setState('done');
    } catch { setState('error'); }
  }

  return (
    <section className="section next-drop" aria-labelledby="next-drop-title">
      <div className="wrap nd-grid">
        <Reveal className="nd-copy">
          <EmblemFX size={110} className="nd-emblem" />
          <span className="eyebrow">Up Next</span>
          <h2 id="next-drop-title">{CONFIG.nextDropName}</h2>
          {CONFIG.nextDropBlurb && <p>{CONFIG.nextDropBlurb}</p>}
          {CONFIG.dropDate && <div className="nd-count"><Countdown target={CONFIG.dropDate} /></div>}
          {state === 'done' ? (
            <p className="nd-done" role="status">You're on the list — you'll hear first when it opens.</p>
          ) : (
            <form className="nd-form" onSubmit={join}>
              <input type="email" required autoComplete="email" placeholder="Email for first access"
                aria-label="Email for first access" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn" type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Joining…' : 'Get first access'}</button>
            </form>
          )}
          {state === 'error' && <p className="nd-err" role="alert">That didn't go through — try again.</p>}
        </Reveal>
        <div className="nd-pics">
          {pics.map((src, i) => (
            <Reveal key={src} className={`nd-pic nd-pic-${i}`}>
              <img src={src} alt={`${CONFIG.nextDropName} preview ${i + 1}`} loading="lazy" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
