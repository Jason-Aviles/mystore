import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function ProductStory({ product, soldOut, priceLabel, onAdd }) {
  const storyRef = useRef(null);

  useGSAP(() => {
    const story = storyRef.current;
    if (!story) return undefined;

    if (import.meta.env.DEV) {
      window.__ddProductStoryTriggerCount = () => ScrollTrigger.getAll()
        .filter((trigger) => String(trigger.vars.id || '').startsWith('product-story-'))
        .length;
    }

    const media = gsap.matchMedia();
    media.add('(min-width: 1200px) and (prefers-reduced-motion: no-preference)', () => {
      const frames = gsap.utils.toArray('.ps-frame', story);
      const lines = gsap.utils.toArray('.ps-line', story);
      if (frames.length < 3 || lines.length < 3) return undefined;

      // Establish a complete first act before enhanced positioning turns on.
      // A failed enhancement therefore stays readable instead of overlapping.
      gsap.set(frames, { autoAlpha: 0, clipPath: 'none', scale: 1 });
      gsap.set(frames[0], { autoAlpha: 1, clipPath: 'inset(16% 22% 16% 22%)' });
      gsap.set(lines, { autoAlpha: 0, y: 24, pointerEvents: 'none' });
      gsap.set(lines[0], { autoAlpha: 1, y: 0, pointerEvents: 'auto' });
      story.classList.add('is-enhanced');

      const timeline = gsap.timeline({
        scrollTrigger: {
          id: `product-story-${product.handle}`,
          trigger: story,
          start: 'top top',
          end: '+=250%',
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });

      timeline
        .to(frames[0], { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.18, ease: 'none' }, 0)
        .fromTo(frames[1],
          { autoAlpha: 0, clipPath: 'inset(0 0 100% 0)', scale: 1.12 },
          { autoAlpha: 1, clipPath: 'inset(0 0 0% 0)', scale: 1, duration: 0.2, ease: 'none' }, 0.28)
        .set(lines[0], { autoAlpha: 0, y: -20, pointerEvents: 'none' }, 0.34)
        .set(lines[1], { autoAlpha: 1, y: 0, pointerEvents: 'auto' }, 0.34)
        .set(frames[0], { autoAlpha: 0 }, 0.48)
        .fromTo(frames[2],
          { autoAlpha: 0, clipPath: 'circle(0% at 68% 42%)', scale: 1.08 },
          { autoAlpha: 1, clipPath: 'circle(120% at 68% 42%)', scale: 1, duration: 0.2, ease: 'none' }, 0.6)
        .set(lines[1], { autoAlpha: 0, y: -20, pointerEvents: 'none' }, 0.68)
        .set(lines[2], { autoAlpha: 1, y: 0, pointerEvents: 'auto' }, 0.68)
        .set(frames[1], { autoAlpha: 0 }, 0.8)
        .to(frames[2].querySelector('img'), { scale: 1.08, duration: 0.22, ease: 'none' }, 0.78);

      let active = true;
      const refresh = () => { if (active) ScrollTrigger.refresh(); };
      const frameImages = frames.map((frame) => frame.querySelector('img')).filter(Boolean);
      frameImages.forEach((image) => {
        if (!image.complete) image.addEventListener('load', refresh, { once: true });
      });
      document.fonts?.ready.then(refresh);
      const refreshFrame = window.requestAnimationFrame(refresh);

      return () => {
        active = false;
        window.cancelAnimationFrame(refreshFrame);
        frameImages.forEach((image) => image.removeEventListener('load', refresh));
        timeline.scrollTrigger?.kill();
        timeline.kill();
        story.classList.remove('is-enhanced');
      };
    });

    return () => media.revert();
  }, { scope: storyRef, dependencies: [product.handle], revertOnUpdate: true });

  return (
    <section className="pstory" aria-label={`${product.title} up close`} ref={storyRef}>
      <div className="ps-stage">
        {product.images.slice(0, 3).map((src, index) => (
          <div className={`ps-frame ps-${index}`} key={src}>
            <img src={src} alt="" loading="lazy" />
          </div>
        ))}
        <div className="ps-copy">
          <div className="ps-line" data-ps="0">
            <span className="eyebrow">The Piece</span>
            <h2>{product.title}</h2>
          </div>
          <div className="ps-line" data-ps="1">
            <span className="eyebrow">The Cut</span>
            <p>{product.fit}</p>
          </div>
          <div className="ps-line" data-ps="2">
            <span className="eyebrow">The Run</span>
            <p>One production run. Never reprinted.</p>
            {!soldOut && (
              <div className="ps-action-row">
                <button type="button" className="btn ps-action" onClick={onAdd}>
                  Add to Cart {'\u2014'} {priceLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
