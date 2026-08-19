import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/* one cell — the number slides out/in like a split-flap when it changes */
function Cell({ label, value }) {
  const numRef = useRef(null);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // departures-board flap: the digit folds down from the top edge
    gsap.fromTo(numRef.current,
      { rotationX: -92, opacity: 0.4, transformOrigin: 'center top' },
      { rotationX: 0, opacity: 1, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
  }, [value]);

  return (
    <div className="count-cell" style={{ perspective: 300 }}>
      <b ref={numRef} style={{ display: 'block', willChange: 'transform' }}>{String(value).padStart(2, '0')}</b>
      <small>{label}</small>
    </div>
  );
}

export default function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const t = new Date(target).getTime();
  if (Number.isNaN(t)) return null; // unset/invalid date must not render NaN cells
  const d = t - now;
  if (d <= 0) return <div className="drop-live">DROP IS LIVE</div>;

  const cells = [
    ['Days', Math.floor(d / 864e5)],
    ['Hrs', Math.floor(d / 36e5) % 24],
    ['Min', Math.floor(d / 6e4) % 60],
    ['Sec', Math.floor(d / 1e3) % 60],
  ];
  const urgent = d < 864e5; // under 24h: the countdown starts burning
  return (
    <div className={`countdown ${urgent ? 'urgent' : ''}`} aria-label="Time until the drop">
      {cells.map(([l, v]) => <Cell key={l} label={l} value={v} />)}
    </div>
  );
}
