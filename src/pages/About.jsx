import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';
import { useStore } from '../context/StoreContext';

export default function About() {
  const { CONFIG } = useStore();
  const founderReady = Boolean(CONFIG.founderName && CONFIG.founderStatement);
  const location = [CONFIG.businessCity, CONFIG.businessRegion].filter(Boolean).join(', ');
  const proof = [
    ...(CONFIG.productionImages || []).map((src) => ({ src, type: 'Production' })),
    ...(CONFIG.packagingImages || []).map((src) => ({ src, type: 'Packaging' })),
  ];

  return (
    <>
      <section className="page-head mesh">
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <span className="logo-mark serpent-reveal" aria-hidden="true" data-serpent />
          <div><span className="eyebrow">The Brand</span><h1 data-fx="venetian">Our Story</h1></div>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="wrap story">
          <Reveal className="media" data-fx="molt"><img src="/media/editorial/pendant-graded-2.webp" alt="Dark Divine serpent pendant — editorial portrait" loading="lazy" /></Reveal>
          <Reveal>
            <div className="script-line">Illuminate the darkness within</div>
            <p data-lines>Dark Divine didn’t start in a boardroom. It started with a serpent, a number, and the idea that what you wear should say something before you do.</p>
            <p data-lines>Every piece runs through the same hands: designed in-house, sampled until the fit is right, and produced in one small run. No warehouse of leftovers. No re-releases. The 00 on the chest isn’t a size — it’s a marker that you were there for the run.</p>
            <p>We’d rather sell out than mass-produce. That’s the whole model — and it's why every drop is gated, numbered, and gone when it's gone.</p>
            <div className="sig">Dark Divine — darkdivine.store</div>
            <div style={{ marginTop: 28 }}><Link className="btn" to="/drop">Enter the Drop</Link></div>
          </Reveal>
        </div>
      </section>
      {(founderReady || CONFIG.legalBusinessName || location || CONFIG.supportPhone) && (
        <section className="section brand-identity-section">
          <div className="wrap brand-identity">
            {founderReady && (
              <Reveal className="founder-card">
                {CONFIG.founderImage && <img src={CONFIG.founderImage} alt={`${CONFIG.founderName}, ${CONFIG.founderRole || 'founder of Dark Divine'}`} loading="lazy" />}
                <div><span className="eyebrow">Behind the label</span><h2>{CONFIG.founderName}</h2>{CONFIG.founderRole && <p className="founder-role">{CONFIG.founderRole}</p>}<p>{CONFIG.founderStatement}</p></div>
              </Reveal>
            )}
            {(CONFIG.legalBusinessName || location || CONFIG.supportPhone) && (
              <aside className="business-card" aria-label="Business details">
                <span className="eyebrow">Business details</span>
                {CONFIG.legalBusinessName && <strong>{CONFIG.legalBusinessName}</strong>}
                {location && <span>{location}</span>}
                {CONFIG.supportPhone && <a href={`tel:${CONFIG.supportPhone}`}>{CONFIG.supportPhone}</a>}
                <Link to="/contact">Contact support</Link>
              </aside>
            )}
          </div>
        </section>
      )}
      {proof.length > 0 && (
        <section className="section brand-proof-section">
          <div className="wrap">
            <span className="eyebrow">From the workroom</span><h2>How it gets made</h2>
            <p className="proof-intro">Genuine photographs uploaded by Dark Divine from production and order packing.</p>
            <div className="brand-proof-gallery">{proof.map((item, index) => <figure key={`${item.src}-${index}`}><img src={item.src} alt={`${item.type} process ${index + 1}`} loading="lazy" /><figcaption>{item.type}</figcaption></figure>)}</div>
          </div>
        </section>
      )}
    </>
  );
}
