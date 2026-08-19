import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCard from '../components/ProductCard';
import Countdown from '../components/Countdown';
import Reveal from '../components/Reveal';
import Logo3D from '../components/Logo3D';
import FilmStrip from '../components/FilmStrip';
import ScrollSerpent from '../components/ScrollSerpent';
import { ReviewCard } from '../components/Reviews';
import { fetchReviews, SHOPIFY_RATING_COUNTS, TOTAL_SHOPIFY_RATINGS, RATING_AVG, productAvg } from '../lib/reviews';
import { saveEmailSignup, saveSmsSignup } from '../lib/marketing';
import { payMethodList } from '../lib/trust';

export default function Home() {
  const { products, CONFIG, money, markSubscribed, showToast } = useStore();
  const [liveReviews, setLiveReviews] = useState([]);
  useEffect(() => { fetchReviews().then(setLiveReviews); }, []);
  const featured = products.filter((p) => p.featured);
  const best = products.filter((p) => p.bestseller);
  const fresh = products.filter((p) => p.newArrival && !p.featured);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  /* Hero LCP: the video tags ship with preload="none", so the ~5MB of hero
     footage never competes with first paint (the posters are the LCP). Once
     the browser goes idle we upgrade preload + start playback — muted and
     decorative, so a blocked play() just leaves the poster frame showing. */
  useEffect(() => {
    let done = false;
    const start = () => {
      if (done) return; done = true;
      document.querySelectorAll('.hero-cine2 video').forEach((v) => {
        v.preload = 'auto';
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      });
    };
    const ric = window.requestIdleCallback;
    const id = ric ? ric(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    return () => { if (window.cancelIdleCallback) window.cancelIdleCallback(id); else window.clearTimeout(id); };
  }, []);

  async function submitSignup(e) {
    e.preventDefault();
    await saveEmailSignup({ email, source: 'popup', consent: true, meta: { placement: 'homepage_signup' } });
    if (phone && smsConsent) await saveSmsSignup({ phone, consent: true });
    markSubscribed();
    setSignedUp(true);
    showToast('Welcome to the list');
  }

  return (
    <>
      {/* the serpent rides the whole page — drawn by scroll, behind everything */}
      <ScrollSerpent />

      {/* HERO v3 "THE BROADCAST" — Scene A: the real ad plays under VHS
          chrome (live timecode, REC pulse, scanlines), title burning
          through. Scroll TEARS the screen into five slats → Scene B. */}
      <section className="hero-cine2">
        <div className="hs-a">
          <video className="hs-video hs-broadcast" src={CONFIG.heroVideoA || '/content/broadcast.mp4'} poster={CONFIG.heroPosterA || '/content/broadcast-poster.jpg'}
            muted loop playsInline preload="none" aria-hidden="true" />
          <div className="vhs-chrome" aria-hidden="true">
            <span className="vhs-tc">TCR 00:00:00:00</span>
            <span className="vhs-rec">● REC</span>
            <span className="vhs-scan" />
          </div>
          <div className="hs-kinetic">
            <h1 className="hs-title" aria-label="Dark Divine">
              <span className="line"><span className="w">DARK</span></span>
              <span className="line"><span className="w">DIVINE</span></span>
            </h1>
            <span className="hs-script">{CONFIG.heroScript} the darkness within</span>
          </div>
          <div className="hs-cue" aria-hidden="true"><span /></div>
        </div>
        <div className="hs-slats" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => <span className="hs-slat" key={i} />)}
        </div>
        <span className="hs-burn" aria-hidden="true" />
        <div className="hs-b hero">
          <div className="hs-stage" aria-hidden="true">
            <div className="hs-monolith">
              <video src={CONFIG.heroVideoB || '/content/hero-film.mp4'} poster={CONFIG.heroPosterB || '/content/hero-film-poster.jpg'}
                muted loop playsInline preload="none" />
              <span className="hs-mono-glow" />
            </div>
            <span className="hs-floor" />
          </div>
          <div className="wrap hero-inner">
            <span className="script" data-hero-script>{CONFIG.heroScript}</span>
            <h1 data-hero-title>
              {CONFIG.heroTitle.split('|').map((line, i, arr) => (
                <span key={line}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </h1>
            <p className="hero-sub" data-hero-sub>{CONFIG.heroSub}</p>
            <div className="hero-ctas" data-hero-ctas>
              <Link className="btn" to={CONFIG.dropMode !== false ? '/drop' : '/shop'} data-magnetic data-scramble-hover>{CONFIG.dropMode !== false ? 'Enter the Private Drop' : 'Shop the Collection'}</Link>
              <Link className="btn btn-ghost" to="/shop" data-magnetic data-scramble-hover>Shop All</Link>
            </div>
            <div className="hero-meta" data-hero-meta>
              <span>One run per colorway</span>
              <span>Free US shipping over ${CONFIG.freeShipThreshold}</span>
              <span>Secure checkout</span>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          <span>City of Sins <i>·</i> Drop 002 <i>·</i> One Run. No Restock. <i>·</i> Dark Divine <i>·</i> 00 <i>·</i></span>
          <span>City of Sins <i>·</i> Drop 002 <i>·</i> One Run. No Restock. <i>·</i> Dark Divine <i>·</i> 00 <i>·</i></span>
        </div>
      </div>

      {/* MANIFESTO — one huge line that ignites word by word as you scroll */}
      <section className="manifesto" aria-label="Brand manifesto" data-fx="dust">
        <div className="wrap">
          <p className="mani-line" data-fx-later="possession">Every piece is cut once. Sold once. Gone forever. You were either in the run — or you weren't.</p>
        </div>
      </section>

      {/* ACT I — THE DROP: pinned horizontal scroll showcase */}
      <section className="hdrop">
        <div className="hdrop-track">
          <div className="hpanel hp-intro">
            <span className="hp-act">Act I — {CONFIG.dropName.split('—').pop().trim()}</span>
            <h2 className="hp-title">
              {(() => {
                const words = CONFIG.dropName.split('—')[0].trim().split(' ');
                return <>{words[0]}{words.length > 1 && <><br />{words.slice(1).join(' ')}</>}</>;
              })()}
            </h2>
            {CONFIG.dropImage && (
              <div className="hp-drop-pic" data-hp-media data-speed="1.06"><img src={CONFIG.dropImage} alt={CONFIG.dropName} /></div>
            )}
            {/* the unit claim is computed from real inventory — it disappears
                the moment stock levels stop supporting it */}
            <p>{(() => {
              const bundles = products.filter((p) => p.category === 'bundle');
              const maxCombo = Math.max(0, ...bundles.flatMap((p) => p.variants.map((v) => v[2] || 0)));
              return maxCombo > 0 && maxCombo <= 3
                ? 'Three matched bundles. Jersey plus nylon pants, numbered — no size combo has more than three units. Scroll →'
                : 'Three matched bundles. Jersey plus nylon pants, numbered, cut in small runs. Scroll →';
            })()}</p>
            {featured[0]?.compare > featured[0]?.price && (
              <p className="hp-anchor">Pieces separately {money(featured[0].compare)} — the bundle {money(featured[0].price)}</p>
            )}
            {CONFIG.dropMode !== false && <Countdown target={CONFIG.dropDate} />}
          </div>
          {featured.map((p, i) => (
            <div className="hpanel hp-product" key={p.handle}>
              <span className="hp-num" data-hp-num>{String(i + 1).padStart(2, '0')}</span>
              <Link className="hp-media" to={`/product/${p.handle}`} data-hp-media>
                <img src={p.images[0]} alt={p.title} loading="lazy" />
              </Link>
              <div className="hp-info" data-hp-info>
                <span className="eyebrow">{p.collection}</span>
                <h3>{p.title}</h3>
                <div className="price">{money(p.price)}{p.compare > p.price && <s>{money(p.compare)}</s>}</div>
                <Link className="btn btn-sm" to={`/product/${p.handle}`}>View the bundle</Link>
              </div>
            </div>
          ))}
          <div className="hpanel hp-outro">
            <Logo3D />
            <h3 className="hp-title" style={{ fontSize: 'clamp(28px,4.5vw,64px)' }}>No<br />Restock</h3>
            <Link className="btn" to={CONFIG.dropMode !== false ? '/drop' : '/shop'} data-magnetic data-scramble-hover>{CONFIG.dropMode !== false ? 'Enter the Drop' : 'Shop All'}</Link>
          </div>
        </div>
      </section>

      {/* BEST SELLERS */}
      <section className="section">
        <div className="ghost-00" data-speed="0.85">00</div>
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-head split">
            <div><span className="sec-index"><i>02</i>Most Wanted</span><h2 data-fx="echo">Best Sellers</h2></div>
            <Link className="btn btn-ghost btn-sm" to="/shop">Shop all</Link>
          </div>
          <div className="grid g4 feature-first" data-fx-grid>{best.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
        </div>
      </section>

      {/* NEW ARRIVALS */}
      {fresh.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head split">
              <div><span className="sec-index"><i>03</i>Just Landed</span><h2>New Arrivals</h2></div>
            </div>
            <div className="grid g4">{fresh.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
          </div>
        </section>
      )}

      {/* BRAND STORY */}
      <section className="section mesh" id="story">
        <div className="wrap story">
          <Reveal className="media" data-fx="shatter"><img src="/content/tee-model-pose-2.webp" alt="Dark Divine serpent tee — studio portrait" loading="lazy" /></Reveal>
          <Reveal>
            <span className="sec-index" style={{ maxWidth: 260 }}><i>04</i>The Brand</span>
            <div className="script-line" data-fx="fangBite">Illuminate the darkness within</div>
            <p data-lines>Dark Divine didn’t start in a boardroom. It started with a serpent, a number, and the idea that what you wear should say something before you do.</p>
            <p data-lines>Every piece runs through the same hands: designed in-house, sampled until the fit is right, and produced in one small run. No warehouse of leftovers. No re-releases. The 00 on the chest isn’t a size — it’s a marker that you were there for the run.</p>
            <p>We’d rather sell out than mass-produce. That’s the whole model.</p>
            <div className="sig">Dark Divine — darkdivine.store</div>
          </Reveal>
        </div>
      </section>

      {/* QUALITY */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <span className="sec-index" style={{ maxWidth: 420, margin: '0 auto' }}><i>05</i>Built, Not Printed</span>
            <h2>What You're Paying For</h2>
          </div>
          <Reveal className="quality-grid">
            {[
              ['I', 'Game-Grade Mesh', 'Jerseys are cut from breathable athletic mesh with stitched varsity trim — built like game wear, not novelty prints.'],
              ['II', 'Heavyweight Cotton', 'Hoodies and sweats are 100% premium cotton fleece that holds structure and survives the dryer.'],
              ['III', 'Ripstop Nylon', "Track pants in lightweight mesh-lined ripstop — moves fast, doesn't wrinkle, doesn't quit."],
              ['IV', 'One Run Only', "Small-batch production, numbered drops. Scarcity here isn't marketing — it's how we make things."],
            ].map(([n, h, t]) => (
              <div className="q-cell" key={n}><span className="num">{n}</span><h3>{h}</h3><p>{t}</p></div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* SOCIAL PROOF — real Shopify rating counts + live on-site reviews */}
      <section className="section mesh">
        <div className="wrap">
          <div className="section-head split">
            <div><span className="sec-index"><i>06</i>Social Proof</span><h2 data-fx="constrictor">Worn &amp; Vouched</h2></div>
            <div className="rating-summary">
              <span className="big" data-fx="coilCounter">{RATING_AVG}★</span>
              <span><b style={{ color: 'var(--bone)' }}>{TOTAL_SHOPIFY_RATINGS + liveReviews.filter((r) => r.source !== 'shopify_import').length}</b> verified customer reviews<br />across the catalog</span>
            </div>
          </div>
          <Reveal className="proof-grid">
            {products
              .filter((p) => SHOPIFY_RATING_COUNTS[p.handle] > 0)
              .sort((a, b) => SHOPIFY_RATING_COUNTS[b.handle] - SHOPIFY_RATING_COUNTS[a.handle])
              .map((p) => (
                <Link className="proof-cell" to={`/product/${p.handle}#reviews`} key={p.handle}>
                  <img src={p.images[0]} alt="" loading="lazy" />
                  <div>
                    <div className="stars">★ {productAvg(p.handle)}</div>
                    <b>{SHOPIFY_RATING_COUNTS[p.handle]} reviews</b>
                    <span>{p.title}</span>
                  </div>
                </Link>
              ))}
          </Reveal>
          {liveReviews.length > 0 && (
            <div className="review-grid" style={{ marginTop: 24 }}>
              {liveReviews
                .filter((r) => r.stars === 5 && r.body.length > 60)
                .slice(0, 6)
                .map((r) => <ReviewCard key={r.id} r={r} />)}
            </div>
          )}
          <p className="form-note" style={{ marginTop: 18 }}>
            Real reviews from verified orders. New ones are collected after checkout — order email required for the Verified badge.
          </p>
        </div>
      </section>

      {/* THE REEL — draggable film strip of real campaign motion */}
      <FilmStrip />

      {/* LOOKBOOK */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head split">
            <div><span className="sec-index"><i>07</i>On Instagram</span><h2>The Lookbook</h2></div>
            <a className="btn btn-ghost btn-sm" href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">{CONFIG.instagramHandle}</a>
          </div>
          <div className="lookbook" data-cursor="view" data-fx="slitherWake">
            {[
              ['/content/studio-00-pants.webp', 'Dark Divine 00 nylon pants — studio', 'the 00 pants', '/product/city-of-sins-nylon-pants'],
              ['/content/ig-hatstore.webp', 'Dark Divine 00 pants styled in a hat store', '@darkdivine.official', '/product/dark-divine-sweat-pants'],
              ['/content/pendant-graded-1.webp', 'Dark Divine serpent pendant and tee — editorial', 'the serpent', '/product/dark-divine-t-shirt'],
              ['/content/tee-model-pose.webp', 'Dark Divine serpent tee — studio pose', 'the tee, worn', '/product/dark-divine-t-shirt'],
              ['/images/edited-igreel_00018_.webp', 'Dark Divine tee mirror selfie', 'the tee', '/product/dark-divine-t-shirt'],
              ['/content/mask-backscript.webp', 'Illuminate The Darkness Within — back script', 'the darkness within', '/product/dark-divine-hoodie'],
              ['/content/hoodie-mirror.webp', 'Dark Divine zip hoodie mirror fit', 'the zip hoodie', '/product/dark-divine-hoodie'],
              ['/content/ig-jersey-fit.webp', 'City of Sins jersey fit check', 'the jersey', '/product/city-of-sins-jersey'],
            ].map(([src, alt, tag, to]) => (
              <Reveal as={Link} className="look" to={to} key={src} data-fx="xray">
                <img src={src} alt={alt} loading="lazy" />
                <span className="tag">{tag}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head"><span className="sec-index"><i>08</i>Questions</span><h2>Before You Ask</h2></div>
          <div className="faq">
            {[
              ['How does sizing run?', <>Jerseys and tees run true to size with a relaxed athletic cut — size up if you want it oversized. Nylon pants are a relaxed straight leg; size down for a tapered stack. Every product page has fit notes and model sizing, and the full <Link to="/size-guide">size guide</Link> has flat measurements.</>],
              ['When will my order ship?', <>Orders ship within {CONFIG.processingDays} business days from the US. Standard delivery is 3–7 business days, and you'll get a tracking number by email the moment it leaves. Full details in the <Link to="/shipping">shipping policy</Link>.</>],
              ["What's the return policy?", <>{CONFIG.returnsDays} days, unworn with tags, full refund to your original payment — no restocking fee, no interrogation. Drop items are final sale only when marked on the product page. Details in <Link to="/refunds">returns &amp; refunds</Link>.</>],
              ['Will sold-out pieces restock?', <>No. One production run per colorway is the rule the brand is built on. If a size sells out before the run does, join the back-in-stock list on the product page — remaining units sometimes free up from unpaid orders.</>],
              ['Is checkout secure?', <>Yes — payments run through Stripe over an encrypted connection, and we never see or store your card number. Accepted: {payMethodList(CONFIG).join(', ')}.</>],
              ['How do I get a drop access code?', <>Join the email list below. Access codes go out to the list before every drop — that's the only place they're published.</>],
            ].map(([q, a]) => (
              <details key={q}><summary>{q}</summary><div className="a">{a}</div></details>
            ))}
          </div>
        </div>
      </section>

      {/* SIGNUP (email + optional SMS) */}
      <section className="section" id="signup">
        <div className="wrap">
          <Reveal className="signup-box mesh">
            <video className="ambient-video" src="/brand/logo-3d-web.mp4" autoPlay muted loop playsInline preload="none" aria-hidden="true" />
            <span className="eyebrow" style={{ justifyContent: 'center' }}>Private List</span>
            <h2 data-fx="charOrbit">First Access or No Access</h2>
            <p>Drop dates, private access codes, and 10% off your first order. One email per drop — nothing else.</p>
            {signedUp ? (
              <p style={{ color: 'var(--bone)', fontWeight: 600 }}>You're in. Code <b>{CONFIG.welcomeCode}</b> = 10% off your first order.</p>
            ) : (
              <form onSubmit={submitSignup}>
                <div className="signup-form">
                  <input type="email" required placeholder="Email address" aria-label="Email address" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn" type="submit">Join the List</button>
                </div>
                <div className="signup-form" style={{ marginTop: 10 }}>
                  <input type="tel" placeholder="Phone (optional — SMS drop alerts)" aria-label="Phone for SMS alerts" autoComplete="tel"
                    value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                {phone && (
                  <label className="consent-row">
                    <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
                    <span>I agree to receive automated SMS drop alerts from Dark Divine. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
                  </label>
                )}
              </form>
            )}
            <p className="form-note">Unsubscribe anytime. We never sell your info.</p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
