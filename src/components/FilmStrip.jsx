import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(Draggable, InertiaPlugin, ScrollTrigger, useGSAP);

/* Homepage film strip. Content is supplied by the Supabase-backed homepage
   settings; ratios keep card dimensions stable before media metadata loads. */
export default function FilmStrip({ content }) {
  const sectionRef = useRef(null);
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const barRef = useRef(null);
  const beatRef = useRef(null);
  const scrollEnhancedRef = useRef(false);
  const items = content?.reelItems || [];

  useEffect(() => {
    const videos = Array.from(wrapRef.current?.querySelectorAll('video') || []);
    if (!videos.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (scrollEnhancedRef.current) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: 0.25 });
    videos.forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [items]);

  useGSAP(() => {
    const section = sectionRef.current;
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!section || !wrap || !track) return undefined;

    const cards = gsap.utils.toArray('.fs-card', section);
    const videos = gsap.utils.toArray('video', section);
    const mm = gsap.matchMedia();

    mm.add('(min-width: 1100px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      let activeIndex = -1;
      const travel = () => Math.max(0, track.scrollWidth - wrap.clientWidth);
      const scrollDistance = () => Math.max(
        window.innerHeight * 3,
        Math.min(window.innerHeight * 4, travel() * 1.15),
      );
      const setActiveCard = () => {
        const viewportCenter = window.innerWidth / 2;
        const nextIndex = cards.reduce((nearest, card, index) => {
          const rect = card.getBoundingClientRect();
          const distance = Math.abs(rect.left + rect.width / 2 - viewportCenter);
          return distance < nearest.distance ? { index, distance } : nearest;
        }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
        if (nextIndex === activeIndex) return;
        activeIndex = nextIndex;
        cards.forEach((card, index) => card.classList.toggle('is-active', index === activeIndex));
        videos.forEach((video) => {
          if (video.closest('.fs-card')?.classList.contains('is-active')) video.play().catch(() => {});
          else video.pause();
        });
      };
      const renderProgress = (progress) => {
        const beat = Math.min(4, Math.floor(progress * 3 + 0.5) + 1);
        if (beatRef.current) beatRef.current.textContent = `${String(beat).padStart(2, '0')} / 04`;
        if (barRef.current) gsap.set(barRef.current, { scaleX: Math.max(0.06, progress) });
        setActiveCard();
      };

      scrollEnhancedRef.current = true;
      section.classList.add('is-scroll-reel');
      gsap.set(track, { x: 0 });
      renderProgress(0);

      const tween = gsap.to(track, {
        x: () => -travel(),
        ease: 'none',
        scrollTrigger: {
          id: 'film-reel-scroll',
          trigger: section,
          start: 'top top',
          end: () => `+=${scrollDistance()}`,
          pin: true,
          scrub: 0.65,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => renderProgress(self.progress),
          onRefresh: (self) => renderProgress(self.progress),
        },
      });

      let alive = true;
      const refresh = () => { if (alive) ScrollTrigger.refresh(); };
      window.addEventListener('load', refresh, { once: true });
      document.fonts?.ready.then(refresh);

      return () => {
        alive = false;
        window.removeEventListener('load', refresh);
        tween.scrollTrigger?.kill();
        tween.kill();
        scrollEnhancedRef.current = false;
        section.classList.remove('is-scroll-reel');
        cards.forEach((card) => card.classList.remove('is-active'));
        gsap.set([track, barRef.current], { clearProps: 'transform' });
      };
    });

    mm.add('(hover: hover) and (pointer: fine) and (max-width: 1099px) and (prefers-reduced-motion: no-preference)', () => {
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
      return () => {
        window.removeEventListener('resize', onResize);
        drag.kill();
        gsap.set([track, barRef.current], { clearProps: 'transform' });
      };
    });

    return () => mm.revert();
  }, { scope: sectionRef, dependencies: [items], revertOnUpdate: true });

  return (
    <section className="filmstrip section" ref={sectionRef} aria-label={content?.reelTitle || 'Brand film reel'}>
      <div className="wrap">
        <div className="section-head split">
          <div>
            <span className="sec-index"><i>{content?.reelIndex}</i>{content?.reelEyebrow}</span>
            <h2>{String(content?.reelTitle || '').split('|').map((line, index, lines) => (
              <span key={`${line}-${index}`}>{line}{index < lines.length - 1 && <br />}</span>
            ))}</h2>
          </div>
          <span className="fs-hint" aria-hidden="true">
            <span className="fs-hint-drag">{content?.reelHint}</span>
            <span className="fs-hint-scroll">Scroll to advance</span>
            <span className="fs-beat" ref={beatRef}>01 / 04</span>
          </span>
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
