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
      const steps = gsap.utils.toArray('.ps-step', story);
      const progressFill = story.querySelector('.ps-progress-fill');
      if (frames.length < 3 || lines.length < 3 || steps.length < 3 || !progressFill) return undefined;

      const setActiveAct = (activeIndex) => {
        steps.forEach((step, index) => {
          const active = index === activeIndex;
          step.classList.toggle('is-active', active);
          if (active) step.setAttribute('aria-current', 'step');
          else step.removeAttribute('aria-current');
        });
      };

      // Establish a complete first act before enhanced positioning turns on.
      // A failed enhancement therefore stays readable instead of overlapping.
      gsap.set(frames, { autoAlpha: 0, clipPath: 'none', scale: 1, xPercent: 0 });
      gsap.set(frames[0], {
        autoAlpha: 1,
        clipPath: 'polygon(18% 8%, 84% 8%, 84% 92%, 14% 92%)',
      });
      gsap.set(lines, { autoAlpha: 0, y: 20, pointerEvents: 'none' });
      gsap.set(lines[0], { autoAlpha: 1, y: 0, pointerEvents: 'auto' });
      gsap.set(progressFill, { scaleX: 0, transformOrigin: 'left center' });
      setActiveAct(0);
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
          onUpdate: ({ progress }) => {
            if (progress < 0.48) setActiveAct(0);
            else if (progress < 0.8) setActiveAct(1);
            else setActiveAct(2);
          },
        },
      });

      timeline
        .to(progressFill, { scaleX: 1, duration: 1, ease: 'none' }, 0)
        .to(frames[0], {
          clipPath: 'polygon(4% 0%, 100% 0%, 100% 100%, 0% 100%)',
          duration: 0.2,
          ease: 'none',
        }, 0)
        .fromTo(frames[1],
          {
            autoAlpha: 0,
            clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)',
            scale: 1.08,
            xPercent: 3,
          },
          {
            autoAlpha: 1,
            clipPath: 'polygon(4% 0%, 100% 0%, 100% 100%, 0% 100%)',
            scale: 1,
            xPercent: 0,
            duration: 0.2,
            ease: 'none',
          }, 0.28)
        .set(frames[0], { autoAlpha: 0 }, 0.48)
        .set(lines[0], { autoAlpha: 0, y: -20, pointerEvents: 'none' }, 0.48)
        .set(lines[1], { autoAlpha: 1, y: 18, pointerEvents: 'auto' }, 0.48)
        .to(lines[1], { y: 0, duration: 0.08, ease: 'none' }, 0.48)
        .fromTo(frames[2],
          {
            autoAlpha: 0,
            clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)',
            scale: 1.08,
            xPercent: 3,
          },
          {
            autoAlpha: 1,
            clipPath: 'polygon(4% 0%, 100% 0%, 100% 100%, 0% 100%)',
            scale: 1,
            xPercent: 0,
            duration: 0.2,
            ease: 'none',
          }, 0.6)
        .set(frames[1], { autoAlpha: 0 }, 0.8)
        .set(lines[1], { autoAlpha: 0, y: -20, pointerEvents: 'none' }, 0.8)
        .set(lines[2], { autoAlpha: 1, y: 18, pointerEvents: 'auto' }, 0.8)
        .to(lines[2], { y: 0, duration: 0.08, ease: 'none' }, 0.8)
        .to(frames[2].querySelector('img'), { scale: 1.045, duration: 0.22, ease: 'none' }, 0.78);

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
        setActiveAct(-1);
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
            <img src={src} alt="" loading="lazy" width="1200" height="1200" />
          </div>
        ))}
        <div className="ps-rail">
          <div className="ps-progress" aria-label="Product story progress">
            <div className="ps-progress-track" aria-hidden="true">
              <span className="ps-progress-fill" />
            </div>
            <ol>
              {['Piece', 'Cut', 'Run'].map((label, index) => (
                <li className="ps-step" key={label}>
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <div className="ps-copy">
            <div className="ps-line" data-ps="0">
              <span className="eyebrow">The Piece</span>
              <h2>{product.title}</h2>
              <p className="ps-deck">Built as the signature set of the City of Sins run.</p>
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
                    <span className="ps-action-part">Add to Cart</span>
                    <span className="ps-action-part"><span aria-hidden="true">{'\u2014'}</span> {priceLabel}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
