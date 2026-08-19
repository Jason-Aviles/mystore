import { useEffect, useMemo, useState } from 'react';
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
import { formatHomepageText, mergeHomepage } from '../lib/homeContent';

function Lines({ text }) {
  const lines = String(text || '').split('|');
  return lines.map((line, index) => (
    <span key={`${line}-${index}`}>{line}{index < lines.length - 1 && <br />}</span>
  ));
}

function HomeLink({ href, children, ...props }) {
  if (!href || !children) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) {
    return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} {...props}>{children}</a>;
  }
  return <Link to={href} {...props}>{children}</Link>;
}

function RichText({ text }) {
  const parts = [];
  const matcher = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match;
  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(<HomeLink href={match[2]} key={`${match.index}-${match[2]}`}>{match[1]}</HomeLink>);
    cursor = matcher.lastIndex;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export default function Home() {
  const { products, CONFIG, money, markSubscribed, showToast } = useStore();
  const HOME = useMemo(() => mergeHomepage(CONFIG.homepage), [CONFIG.homepage]);
  const homeText = (value, extra = {}) => formatHomepageText(value, { ...CONFIG, ...extra });
  const [liveReviews, setLiveReviews] = useState([]);
  useEffect(() => { fetchReviews().then(setLiveReviews); }, []);
  const featured = products.filter((p) => p.featured);
  const best = products.filter((p) => p.bestseller);
  const fresh = products.filter((p) => p.newArrival && !p.featured);
  const bundles = products.filter((product) => product.category === 'bundle');
  const maxBundleCombo = Math.max(0, ...bundles.flatMap((product) => product.variants.map((variant) => variant[2] || 0)));
  const tickerParts = HOME.tickerText.split('·');

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
          <video className="hs-video hs-broadcast" src={CONFIG.heroVideoA} poster={CONFIG.heroPosterA}
            muted loop playsInline preload="none" aria-hidden="true" />
          <div className="vhs-chrome" aria-hidden="true">
            <span className="vhs-tc">TCR 00:00:00:00</span>
            <span className="vhs-rec">● REC</span>
            <span className="vhs-scan" />
          </div>
          <div className="hs-kinetic">
            <h1 className="hs-title" aria-label={HOME.heroBrandTitle.replace('|', ' ')}>
              {HOME.heroBrandTitle.split('|').map((line, index) => (
                <span className="line" key={`${line}-${index}`}><span className="w">{line}</span></span>
              ))}
            </h1>
            <span className="hs-script">{CONFIG.heroScript} {HOME.heroScriptSuffix}</span>
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
              <video src={CONFIG.heroVideoB} poster={CONFIG.heroPosterB}
                muted loop playsInline preload="none" />
              <span className="hs-mono-glow" />
            </div>
            <span className="hs-floor" />
          </div>
          <div className="wrap hero-inner">
            <span className="script" data-hero-script>{CONFIG.heroScript}</span>
            <h2 data-hero-title>
              <Lines text={CONFIG.heroTitle} />
            </h2>
            <p className="hero-sub" data-hero-sub>{CONFIG.heroSub}</p>
            <div className="hero-ctas" data-hero-ctas>
              <HomeLink className="btn" href={CONFIG.dropMode !== false ? HOME.heroPrimaryHrefDrop : HOME.heroPrimaryHrefShop} data-magnetic data-scramble-hover>
                {CONFIG.dropMode !== false ? HOME.heroPrimaryTextDrop : HOME.heroPrimaryTextShop}
              </HomeLink>
              <HomeLink className="btn btn-ghost" href={HOME.heroSecondaryHref} data-magnetic data-scramble-hover>{HOME.heroSecondaryText}</HomeLink>
            </div>
            <div className="hero-meta" data-hero-meta>
              {HOME.heroMetaItems.map((item, index) => <span key={`${item.text}-${index}`}>{homeText(item.text)}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>{tickerParts.map((part, index) => <span key={`${copy}-${index}`}>{part}{index < tickerParts.length - 1 && <i>·</i>}</span>)}</span>
          ))}
        </div>
      </div>

      {/* MANIFESTO — one huge line that ignites word by word as you scroll */}
      <section className="manifesto" aria-label="Brand manifesto" data-fx="dust">
        <div className="wrap">
          <p className="mani-line" data-fx-later="possession">{HOME.manifestoText}</p>
        </div>
      </section>

      {/* ACT I — THE DROP: pinned horizontal scroll showcase */}
      <section className="hdrop">
        <div className="hdrop-track">
          <div className="hpanel hp-intro">
            <span className="hp-act">{homeText(HOME.dropActLabel)}</span>
            <h2 className="hp-title"><Lines text={homeText(HOME.dropTitle)} /></h2>
            {CONFIG.dropImage && (
              <div className="hp-drop-pic" data-hp-media data-speed="1.06"><img src={CONFIG.dropImage} alt={CONFIG.dropName} /></div>
            )}
            <p>{maxBundleCombo > 0 && maxBundleCombo <= 3 ? HOME.dropBodyLimited : HOME.dropBodyGeneral}</p>
            {featured[0]?.compare > featured[0]?.price && (
              <p className="hp-anchor">{homeText(HOME.dropAnchorText, {
                comparePrice: money(featured[0].compare), price: money(featured[0].price),
              })}</p>
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
                <Link className="btn btn-sm" to={`/product/${p.handle}`}>{HOME.dropProductButtonText}</Link>
              </div>
            </div>
          ))}
          <div className="hpanel hp-outro">
            <Logo3D modelSrc={HOME.dropOutroLogoModel} posterSrc={HOME.dropOutroLogoPoster} alt={HOME.dropOutroLogoAlt} />
            <h3 className="hp-title" style={{ fontSize: 'clamp(28px,4.5vw,64px)' }}><Lines text={HOME.dropOutroTitle} /></h3>
            <HomeLink className="btn" href={CONFIG.dropMode !== false ? HOME.dropOutroHrefDrop : HOME.dropOutroHrefShop} data-magnetic data-scramble-hover>
              {CONFIG.dropMode !== false ? HOME.dropOutroButtonDrop : HOME.dropOutroButtonShop}
            </HomeLink>
          </div>
        </div>
      </section>

      {/* BEST SELLERS */}
      <section className="section">
        <div className="ghost-00" data-speed="0.85">00</div>
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-head split">
            <div><span className="sec-index"><i>{HOME.bestIndex}</i>{HOME.bestEyebrow}</span><h2 data-fx="echo">{HOME.bestTitle}</h2></div>
            <HomeLink className="btn btn-ghost btn-sm" href={HOME.bestButtonHref}>{HOME.bestButtonText}</HomeLink>
          </div>
          <div className="grid g4 feature-first" data-fx-grid>{best.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
        </div>
      </section>

      {/* NEW ARRIVALS */}
      {fresh.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head split">
              <div><span className="sec-index"><i>{HOME.newIndex}</i>{HOME.newEyebrow}</span><h2>{HOME.newTitle}</h2></div>
            </div>
            <div className="grid g4">{fresh.map((p) => <ProductCard key={p.handle} p={p} />)}</div>
          </div>
        </section>
      )}

      {/* BRAND STORY */}
      <section className="section mesh" id="story">
        <div className="wrap story">
          <Reveal className="media" data-fx="shatter"><img src={HOME.storyImage} alt={HOME.storyImageAlt} loading="lazy" /></Reveal>
          <Reveal>
            <span className="sec-index" style={{ maxWidth: 260 }}><i>{HOME.storyIndex}</i>{HOME.storyEyebrow}</span>
            <div className="script-line" data-fx="fangBite">{HOME.storyScript}</div>
            {HOME.storyParagraph1 && <p data-lines>{HOME.storyParagraph1}</p>}
            {HOME.storyParagraph2 && <p data-lines>{HOME.storyParagraph2}</p>}
            {HOME.storyParagraph3 && <p>{HOME.storyParagraph3}</p>}
            <div className="sig">{HOME.storySignature}</div>
          </Reveal>
        </div>
      </section>

      {/* QUALITY */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <span className="sec-index" style={{ maxWidth: 420, margin: '0 auto' }}><i>{HOME.qualityIndex}</i>{HOME.qualityEyebrow}</span>
            <h2>{HOME.qualityTitle}</h2>
          </div>
          <Reveal className="quality-grid">
            {HOME.qualityItems.map((item, index) => (
              <div className="q-cell" key={`${item.number}-${index}`}><span className="num">{item.number}</span><h3>{item.title}</h3><p>{item.text}</p></div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* SOCIAL PROOF — real Shopify rating counts + live on-site reviews */}
      <section className="section mesh">
        <div className="wrap">
          <div className="section-head split">
            <div><span className="sec-index"><i>{HOME.socialIndex}</i>{HOME.socialEyebrow}</span><h2 data-fx="constrictor">{HOME.socialTitle}</h2></div>
            <div className="rating-summary">
              <span className="big" data-fx="coilCounter">{RATING_AVG}★</span>
              <span><b style={{ color: 'var(--bone)' }}>{TOTAL_SHOPIFY_RATINGS + liveReviews.filter((r) => r.source !== 'shopify_import').length}</b> <Lines text={HOME.socialReviewLabel.replace('\n', '|')} /></span>
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
            {HOME.socialNote}
          </p>
        </div>
      </section>

      {/* THE REEL — draggable film strip of real campaign motion */}
      <FilmStrip content={HOME} />

      {/* LOOKBOOK */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head split">
            <div><span className="sec-index"><i>{HOME.lookbookIndex}</i>{HOME.lookbookEyebrow}</span><h2>{HOME.lookbookTitle}</h2></div>
            <HomeLink className="btn btn-ghost btn-sm" href={homeText(HOME.lookbookButtonHref)}>{homeText(HOME.lookbookButtonText)}</HomeLink>
          </div>
          <div className="lookbook" data-cursor="view" data-fx="slitherWake">
            {HOME.lookbookItems.map((item, index) => (
              <Reveal as={Link} className="look" to={item.to || '/shop'} key={`${item.src}-${index}`} data-fx="xray">
                <img src={item.src} alt={item.alt} loading="lazy" />
                <span className="tag">{item.tag}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head"><span className="sec-index"><i>{HOME.faqIndex}</i>{HOME.faqEyebrow}</span><h2>{HOME.faqTitle}</h2></div>
          <div className="faq">
            {HOME.faqItems.map((item, index) => (
              <details key={`${item.question}-${index}`}><summary>{item.question}</summary><div className="a"><RichText text={homeText(item.answer, { payMethods: payMethodList(CONFIG).join(', ') })} /></div></details>
            ))}
          </div>
        </div>
      </section>

      {/* SIGNUP (email + optional SMS) */}
      <section className="section" id="signup">
        <div className="wrap">
          <Reveal className="signup-box mesh">
            <video className="ambient-video" src={HOME.signupVideo} poster={HOME.signupVideoPoster || undefined} autoPlay muted loop playsInline preload="none" aria-hidden="true" />
            <span className="eyebrow" style={{ justifyContent: 'center' }}>{HOME.signupEyebrow}</span>
            <h2 data-fx="charOrbit">{HOME.signupTitle}</h2>
            <p>{HOME.signupBody}</p>
            {signedUp ? (
              <p style={{ color: 'var(--bone)', fontWeight: 600 }}>{homeText(HOME.signupSuccessText)}</p>
            ) : (
              <form onSubmit={submitSignup}>
                <div className="signup-form">
                  <input type="email" name="email" required placeholder={HOME.signupEmailPlaceholder} aria-label={HOME.signupEmailPlaceholder} autoComplete="email" spellCheck="false"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn" type="submit">{HOME.signupButtonText}</button>
                </div>
                <div className="signup-form" style={{ marginTop: 10 }}>
                  <input type="tel" name="phone" inputMode="tel" placeholder={HOME.signupPhonePlaceholder} aria-label={HOME.signupPhonePlaceholder} autoComplete="tel"
                    value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                {phone && (
                  <label className="consent-row">
                    <input type="checkbox" name="sms-consent" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
                    <span>{HOME.signupSmsConsent}</span>
                  </label>
                )}
              </form>
            )}
            <p className="form-note">{HOME.signupNote}</p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
