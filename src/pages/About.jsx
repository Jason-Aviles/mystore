import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';

export default function About() {
  return (
    <>
      <section className="page-head mesh">
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <span className="logo-mark serpent-reveal" aria-hidden="true" data-serpent />
          <div>
            <span className="eyebrow">The Brand</span>
            <h1 data-fx="venetian">Our Story</h1>
          </div>
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
            <div style={{ marginTop: 28 }}>
              <Link className="btn" to="/drop">Enter the Drop</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
