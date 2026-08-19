import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { useStore } from '../context/StoreContext';
import { reducedMotion } from '../lib/motion';

gsap.registerPlugin(SplitText);

/* ============================================================
   Full-screen editorial menu — the luxury-house navigation.
   Numbered links reveal line by line; on desktop, hovering a
   link swaps the campaign media beside it. Esc closes, focus
   is trapped, body scroll locks while open.
   ============================================================ */

const LINKS = [
  ['/', 'Home', '/content/poster-LTX_2.0_i2v_00019_.webp'],
  ['/shop', 'Shop All', '/content/ig-hatstore.webp'],
  ['/drop', 'The Drop', '/content/desert-00.webp'],
  ['/collection/essentials', 'Essentials', '/content/hoodie-script-back.webp'],
  ['/about', 'Our Story', '/content/couch-couple.webp'],
  ['/contact', 'Support', '/content/ig-jersey-fit.webp'],
];

export default function MegaMenu({ open, onClose }) {
  const { CONFIG } = useStore();
  const root = useRef(null);
  const [media, setMedia] = useState(LINKS[1][2]);
  const nav = useNavigate();

  /* focus trap + escape + scroll lock */
  useEffect(() => {
    if (!open) return;
    const el = root.current;
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('dd:lockScroll'));
    const focusables = () => el.querySelectorAll('a, button');
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = Array.from(focusables());
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.dispatchEvent(new Event('dd:unlockScroll')); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  /* open/close choreography */
  useGSAP(() => {
    const el = root.current;
    if (!el) return;
    if (open) {
      const dur = reducedMotion() ? 0 : undefined;
      gsap.timeline({ defaults: { ease: 'power4.out' } })
        .fromTo(el, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: dur ?? 0.7, ease: 'power4.inOut' })
        .fromTo('.mm-link', { yPercent: 120 }, { yPercent: 0, duration: dur ?? 0.8, stagger: 0.07 }, 0.25)
        .fromTo('.mm-media', { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1, duration: dur ?? 0.9 }, 0.4)
        .fromTo('.mm-foot > *', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: dur ?? 0.5, stagger: 0.06 }, 0.55);
    }
  }, { scope: root, dependencies: [open] });

  /* hover: the link's characters ripple like a struck chord */
  function wave(e) {
    if (reducedMotion()) return;
    const label = e.currentTarget.querySelector('span[data-text]');
    if (!label || label.dataset.waving) return;
    if (!label.dataset.split) {
      new SplitText(label, { type: 'chars' });
      label.dataset.split = '1';
    }
    const chars = label.querySelectorAll('div');
    if (!chars.length) return;
    label.dataset.waving = '1';
    gsap.to(chars, {
      keyframes: [{ yPercent: -22 }, { yPercent: 0 }], duration: 0.5, stagger: 0.022, ease: 'power2.inOut',
      onComplete: () => { delete label.dataset.waving; },
    });
  }

  /* media crossfade on hover */
  function preview(src) {
    if (src === media || reducedMotion()) { setMedia(src); return; }
    const img = root.current?.querySelector('.mm-media img');
    if (!img) { setMedia(src); return; }
    gsap.to(img, {
      opacity: 0, scale: 1.06, duration: 0.22, ease: 'power2.in',
      onComplete: () => {
        setMedia(src);
        gsap.fromTo(img, { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' });
      },
    });
  }

  function go(to) {
    onClose();
    nav(to);
  }

  if (!open) return null;
  return (
    <div className="megamenu" ref={root} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="mm-inner">
        <div className="mm-links">
          {LINKS.map(([to, label, img], i) => (
            <div className="mm-line" key={to}>
              <button className="mm-link" onMouseEnter={(e) => { preview(img); wave(e); }} onFocus={() => preview(img)} onClick={() => go(to)}>
                <i>{String(i + 1).padStart(2, '0')}</i>
                <span data-text={label}>{label}</span>
              </button>
            </div>
          ))}
        </div>
        <div className="mm-media" aria-hidden="true">
          <img src={media} alt="" />
        </div>
      </div>
      <div className="mm-foot">
        <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
        <a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">{CONFIG.instagramHandle}</a>
        <Link to="/shipping" onClick={onClose}>Shipping</Link>
        <Link to="/refunds" onClick={onClose}>Returns</Link>
      </div>
      <button className="mm-close" aria-label="Close menu" onClick={onClose}>&times;</button>
    </div>
  );
}
