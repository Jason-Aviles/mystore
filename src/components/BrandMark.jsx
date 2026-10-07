import { useStore } from '../context/StoreContext';
import { brandFor } from '../lib/brand';
import { HandWordmark } from './HandMade';
import EmblemFX from './EmblemFX';

/** The brand mark for one placement, exactly as the admin configured it.
    Width-based placements cap at 94vw so a large size never overflows a
    phone. `animated` lets big placements use the live GSAP emblem. */
export default function BrandMark({ placement, reveal = 'scroll', delay = 0, decorative = false, className = '', animated = false }) {
  const { CONFIG } = useStore();
  const b = brandFor(CONFIG.brand, placement);
  if (!b.show) return null;

  if (placement === 'header') {
    // size = height in px; the wordmark is 3:1
    return b.mark === 'emblem'
      ? <span className={`logo-mark ${className}`} aria-hidden="true" style={{ width: b.size, height: b.size }} />
      : <span className={`brand-mark ${className}`} style={{ width: b.size * 3, maxWidth: '46vw' }}><HandWordmark reveal="none" decorative /></span>;
  }

  const width = placement === 'hero' ? `${b.size}vw` : `min(${b.size}px, 94vw)`;
  if (b.mark === 'emblem') {
    const px = placement === 'hero' ? Math.round(Math.min(window.innerWidth * (b.size / 100), 1180) * 0.5) : Math.min(b.size, Math.round(window.innerWidth * 0.94));
    return animated
      ? <span className={`brand-mark ${className}`}><EmblemFX size={px} entrance={reveal === 'now' ? 'now' : 'scroll'} label="Dark Divine" /></span>
      : <span className={`brand-mark ${className}`} style={{ width: px * 0.887, height: px }}><span className="logo-mark" style={{ width: '100%', height: '100%' }} aria-hidden={decorative || undefined} /></span>;
  }
  return (
    <span className={`brand-mark ${className}`} style={{ width, maxWidth: placement === 'hero' ? 1180 : undefined }}>
      <HandWordmark reveal={reveal} delay={delay} decorative={decorative} />
    </span>
  );
}
