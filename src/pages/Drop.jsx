import { Navigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCard from '../components/ProductCard';
import Countdown from '../components/Countdown';
import Reveal from '../components/Reveal';

export default function Drop() {
  const { products, CONFIG } = useStore();
  // drop mode off in admin: the whole drop concept disappears
  if (CONFIG.dropMode === false) return <Navigate to="/shop" replace />;
  const bundles = products.filter((p) => p.category === 'bundle');
  const rest = products.filter((p) => p.collection === 'City of Sins' && p.category !== 'bundle');

  return (
    <>
      <div className="drop-video">
        {CONFIG.dropImage
          ? <img src={CONFIG.dropImage} alt={CONFIG.dropName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <video src="/brand/logo-3d-web.mp4" poster="/brand/logo-3d.png"
              autoPlay muted loop playsInline preload="metadata" />}
        <div className="dv-copy wrap">
          <span className="eyebrow">Private Release</span>
          <h1 data-fx="inferno" style={{ fontSize: 'clamp(28px, 5vw, 64px)' }}>{CONFIG.dropName}</h1>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 34 }}>
        <div className="ghost-00" data-speed="0.85">002</div>
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <Reveal className="drop-panel" style={{ marginBottom: 48 }}>
            <div>
              <span className="eyebrow">Goes Live</span>
              <h2 data-fx="serpentPupil">One Run. No Restock.</h2>
              {/* unit claim verified against live inventory before it renders */}
              <p>Three matched bundle colorways plus standalone jerseys and pants.{(() => {
                const maxCombo = Math.max(0, ...bundles.flatMap((p) => p.variants.map((v) => v[2] || 0)));
                return maxCombo > 0 && maxCombo <= 3 ? ' No size combo has more than three units.' : '';
              })()} When the counter hits zero, the door opens for everyone — list members are already inside.</p>
            </div>
            <Countdown target={CONFIG.dropDate} />
          </Reveal>

          <div className="section-head"><span className="eyebrow">The Bundles</span><h2>Matched Sets</h2></div>
          <div className="grid">{bundles.map((p) => <ProductCard key={p.handle} p={p} />)}</div>

          {rest.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 64 }}>
                <span className="eyebrow">Break the Set</span><h2>Singles</h2>
              </div>
              <div className="grid g4">{rest.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
