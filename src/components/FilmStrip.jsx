import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { useGSAP } from '@gsap/react';
import { reducedMotion } from '../lib/motion';

gsap.registerPlugin(Draggable, InertiaPlugin);

/* ============================================================
   DARK DIVINE IN MOTION — tactile horizontal film strip.
   Desktop: GSAP Draggable with inertia; grab and throw the reel.
   Touch:   native momentum scroll with snap.
   Videos are muted loops that only play while on screen and only
   load when the section approaches (preload=none + poster).
   ============================================================ */

/* ratio is locked per asset so card widths are stable before video
   metadata loads — keeps Draggable bounds true from first paint */
const REEL = [
  { type: 'video', src: '/media/editorial/ad1-web.mp4', poster: '/media/editorial/poster-ad1.jpg', tag: 'enter the darkness — the spot', ratio: '16 / 9' },
  { type: 'video', src: '/media/editorial/LTX_2.0_i2v_00019_-web.mp4', poster: '/media/editorial/poster-LTX_2.0_i2v_00019_.jpg', tag: 'the serpent tee', ratio: '1280 / 704' },
  { type: 'image', src: '/media/editorial/ig-hatstore.webp', tag: '@darkdivine.official', ratio: '1205 / 1597' },
  { type: 'video', src: '/media/editorial/ComfyUI_00018_-web.mp4', poster: '/media/editorial/poster-ComfyUI_00018_.jpg', tag: 'matching sets', ratio: '1 / 1' },
  { type: 'image', src: '/media/editorial/ig-jersey-fit.webp', tag: 'city of sins jersey', ratio: '560 / 790' },
  { type: 'video', src: '/media/editorial/dji-wall.mp4', poster: '/media/editorial/poster-dji-wall.jpg', tag: 'the wall — on set', ratio: '16 / 9' },
  { type: 'video', src: '/media/editorial/LTX_2.0_i2v_00065_-web.mp4', poster: '/media/editorial/poster-LTX_2.0_i2v_00065_.jpg', tag: 'worn, not staged', ratio: '1280 / 704' },
  { type: 'video', src: '/media/editorial/Wan22_00018-web.mp4', poster: '/media/editorial/poster-Wan22_00018.jpg', tag: 'illuminate within', ratio: '480 / 832' },
  { type: 'video', src: '/media/editorial/dji-location.mp4', poster: '/media/editorial/poster-dji.jpg', tag: 'on location — the bridge', ratio: '16 / 9' },
];

export default function FilmStrip() {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const barRef = useRef(null);

  /* videos play only while visible — battery + bandwidth */
  useEffect(() => {
    const vids = Array.from(wrapRef.current?.querySelectorAll('video') || []);
    if (!vids.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) { v.play().catch(() => {}); }
        else v.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  /* desktop: grab-and-throw physics */
  useGSAP(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;
    if (reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const bounds = () => ({ minX: Math.min(0, wrap.clientWidth - track.scrollWidth), maxX: 0 });
    const setBar = () => {
      const b = bounds();
      const p = b.minX ? gsap.getProperty(track, 'x') / b.minX : 0;
      if (barRef.current) gsap.set(barRef.current, { scaleX: Math.max(0.06, p) });
    };
    const [drag] = Draggable.create(track, {
      type: 'x',
      inertia: true,
      bounds: bounds(),
      edgeResistance: 0.82,
      cursor: 'grab',
      activeCursor: 'grabbing',
      onDrag: setBar,
      onThrowUpdate: setBar,
    });
    const onResize = () => drag.applyBounds(bounds());
    window.addEventListener('resize', onResize);
    setBar();
    return () => { window.removeEventListener('resize', onResize); drag.kill(); };
  }, { scope: wrapRef });

  return (
    <section className="filmstrip section" aria-label="Dark Divine in motion">
      <div className="wrap">
        <div className="section-head split">
          <div><span className="sec-index"><i>■</i>The Reel</span><h2>Dark Divine<br />In Motion</h2></div>
          <span className="fs-hint" aria-hidden="true">drag →</span>
        </div>
      </div>
      <div className="fs-wrap" ref={wrapRef} data-cursor="drag">
        <div className="fs-track" ref={trackRef}>
          {REEL.map((item) => (
            <figure className="fs-card" data-fx="liquid" key={item.src}>
              {item.type === 'video' ? (
                <video src={item.src} poster={item.poster} muted loop playsInline preload="none" style={{ aspectRatio: item.ratio }} />
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
