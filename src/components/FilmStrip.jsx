import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { useGSAP } from '@gsap/react';
import { reducedMotion } from '../lib/motion';

gsap.registerPlugin(Draggable, InertiaPlugin);

/* Homepage film strip. Content is supplied by the Supabase-backed homepage
   settings; ratios keep card dimensions stable before media metadata loads. */
export default function FilmStrip({ content }) {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const barRef = useRef(null);
  const items = content?.reelItems || [];

  useEffect(() => {
    const videos = Array.from(wrapRef.current?.querySelectorAll('video') || []);
    if (!videos.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: 0.25 });
    videos.forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [items]);

  useGSAP(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return undefined;
    if (reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    const bounds = () => ({ minX: Math.min(0, wrap.clientWidth - track.scrollWidth), maxX: 0 });
    const setBar = () => {
      const currentBounds = bounds();
      const progress = currentBounds.minX ? gsap.getProperty(track, 'x') / currentBounds.minX : 0;
      if (barRef.current) gsap.set(barRef.current, { scaleX: Math.max(0.06, progress) });
    };
    const [drag] = Draggable.create(track, {
      type: 'x', inertia: true, bounds: bounds(), edgeResistance: 0.82,
      cursor: 'grab', activeCursor: 'grabbing', onDrag: setBar, onThrowUpdate: setBar,
    });
    const onResize = () => drag.applyBounds(bounds());
    window.addEventListener('resize', onResize);
    setBar();
    return () => { window.removeEventListener('resize', onResize); drag.kill(); };
  }, { scope: wrapRef, dependencies: [items], revertOnUpdate: true });

  return (
    <section className="filmstrip section" aria-label={content?.reelTitle || 'Brand film reel'}>
      <div className="wrap">
        <div className="section-head split">
          <div>
            <span className="sec-index"><i>{content?.reelIndex}</i>{content?.reelEyebrow}</span>
            <h2>{String(content?.reelTitle || '').split('|').map((line, index, lines) => (
              <span key={`${line}-${index}`}>{line}{index < lines.length - 1 && <br />}</span>
            ))}</h2>
          </div>
          <span className="fs-hint" aria-hidden="true">{content?.reelHint}</span>
        </div>
      </div>
      <div className="fs-wrap" ref={wrapRef} data-cursor="drag">
        <div className="fs-track" ref={trackRef}>
          {items.map((item, index) => (
            <figure className="fs-card" data-fx="liquid" key={`${item.src}-${index}`}>
              {item.type === 'video' ? (
                <video src={item.src} poster={item.poster || undefined} muted loop playsInline preload="none" style={{ aspectRatio: item.ratio }} />
              ) : (
                <img src={item.src} alt={item.tag} loading="lazy" style={{ aspectRatio: item.ratio }} />
              )}
              <figcaption>{item.tag}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="wrap"><div className="fs-progress"><span ref={barRef} /></div></div>
    </section>
  );
}
