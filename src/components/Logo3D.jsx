import { useEffect, useRef, useState } from 'react';

/* The model-viewer bundle loads only when the logo approaches the viewport.
   Both model and poster can be replaced through Homepage Content settings. */
export default function Logo3D({
  className = '',
  modelSrc = '/media/brand/logo.glb',
  posterSrc = '/media/brand/logo-3d.png',
  alt = 'Dark Divine serpent crown logo in 3D',
}) {
  const [ready, setReady] = useState(false);
  const holder = useRef(null);

  useEffect(() => {
    if (!modelSrc) return undefined;
    let alive = true;
    const element = holder.current;
    const load = () => import('@google/model-viewer').then(() => { if (alive) setReady(true); });
    if (!element || !('IntersectionObserver' in window)) {
      load();
      return () => { alive = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '600px' });
    observer.observe(element);
    return () => { alive = false; observer.disconnect(); };
  }, [modelSrc]);

  if (!modelSrc || !ready) {
    return posterSrc ? <img ref={holder} className={`logo3d ${className}`} src={posterSrc} alt={alt} style={{ objectFit: 'contain' }} /> : null;
  }
  return (
    <model-viewer
      class={`logo3d ${className}`}
      src={modelSrc}
      poster={posterSrc}
      alt={alt}
      auto-rotate
      camera-controls
      disable-zoom
      disable-pan
      interaction-prompt="none"
      rotation-per-second="24deg"
      shadow-intensity="0.5"
      exposure="1"
      camera-orbit="0deg 82deg 105%"
    />
  );
}
