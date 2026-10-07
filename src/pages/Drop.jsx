import { Link, Navigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCard from '../components/ProductCard';
import Countdown from '../components/Countdown';
import Reveal from '../components/Reveal';
import NextDrop from '../components/NextDrop';
import { DROP_STATUS_LABEL } from '../lib/preorder';
import BrandMark from '../components/BrandMark';

/* With a FEATURED drop (admin → Drops → Feature), this page is that drop's
   landing page: its heading, description, picture, button, countdown and
   the pieces assigned to it. Without one it keeps the City of Sins layout. */
export default function Drop() {
  const { products, CONFIG, featuredDrop } = useStore();
  // drop mode off in admin: the whole drop concept disappears
  if (CONFIG.dropMode === false) return <Navigate to="/shop" replace />;

  const dropPieces = featuredDrop ? products.filter((p) => p.campaignId === featuredDrop.id) : [];
  const eyebrow = featuredDrop
    ? ({ coming_soon: 'Coming Soon', live: featuredDrop.access_required === false ? 'Preorder Open' : 'Private Preorder', released: 'Out Now', closed: 'Preorder Closed' }[featuredDrop.status] || DROP_STATUS_LABEL[featuredDrop.status] || 'The Drop')
    : 'Coming Soon';
  const href = CONFIG.dropButtonHref || (dropPieces[0] ? `/product/${dropPieces[0].handle}` : '');
  const cta = CONFIG.dropButtonText && href
    ? (/^https?:/.test(href)
      ? <a className="btn" href={href}>{CONFIG.dropButtonText}</a>
      : <Link className="btn" to={href}>{CONFIG.dropButtonText}</Link>)
    : null;

  return (
    <>
      <div className="drop-video">
        {CONFIG.dropImage
          ? <img src={CONFIG.dropImage} alt={CONFIG.dropName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <video src="/media/brand/emblem-loop.mp4" poster="/media/brand/emblem-loop-poster.jpg"
              autoPlay muted loop playsInline preload="metadata" />}
        <div className="dv-copy wrap">
          <BrandMark placement="dropPage" className="dv-mark" animated />
          <span className="eyebrow">{eyebrow}</span>
          <h1 data-fx="inferno" style={{ fontSize: 'clamp(28px, 5vw, 64px)' }}>{CONFIG.dropName}</h1>
          {cta && <div style={{ marginTop: 18 }}>{cta}</div>}
        </div>
      </div>
      <section className="section" style={{ paddingTop: 34 }}>
        <div className="ghost-00" data-speed="0.85">00</div>
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <Reveal className="drop-panel" style={{ marginBottom: 48 }}>
            <div>
              <span className="eyebrow">{CONFIG.storeUnlockedByCountdown ? 'Open Now' : 'Goes Live'}</span>
              <h2 data-fx="serpentPupil">One Run. No Restock.</h2>
              {featuredDrop
                ? (CONFIG.dropDescription && <p>{CONFIG.dropDescription}</p>)
                : (CONFIG.nextDropBlurb && <p>{CONFIG.nextDropBlurb}</p>)}
            </div>
            <Countdown target={CONFIG.dropDate} />
          </Reveal>

          {featuredDrop ? (
            dropPieces.length > 0 ? (
              <>
                <div className="section-head"><span className="eyebrow">The Pieces</span><h2>{featuredDrop.status === 'released' ? 'Out Now' : 'In This Drop'}</h2></div>
                <div className="grid">{dropPieces.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
              </>
            ) : (
              <p className="empty-note">The pieces are revealed soon — join the list to see them first.</p>
            )
          ) : (
            <p className="empty-note">The pieces are revealed soon — join the list below to see them first. Looking for City of Sins? <Link to="/shop">Shop the collection</Link>.</p>
          )}
        </div>
      </section>
      <NextDrop />
    </>
  );
}
