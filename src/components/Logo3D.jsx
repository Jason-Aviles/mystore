import { useEffect, useRef, useState } from 'react';

/* Interactive 3D serpent-crown logo (the real GLB, not a render).
   model-viewer (~1MB of JS) only downloads once this section nears the
   viewport — the poster (3D still) stands in until then, so the
   storefront's first load never pays for it. */
export default function Logo3D({ className = '' }) {
  const [ready, setReady] = useState(false);
  const holder = useRef(null);

  useEffect(() => {
    let alive = true;
    const el = holder.current;
    if (!el || !('IntersectionObserver' in window)) {
      import('@google/model-viewer').then(() => { if (alive) setReady(true); });
      return () => { alive = false; };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        import('@google/model-viewer').then(() => { if (alive) setReady(true); });
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, []);

  if (!ready) {
    return <img ref={holder} className={`logo3d ${className}`} src="/brand/logo-3d.png" alt="" style={{ objectFit: 'contain' }} />;
  }
  return (
    <model-viewer
      class={`logo3d ${className}`}
      src="/brand/logo.glb"
      poster="/brand/logo-3d.png"
      alt="Dark Divine serpent crown logo in 3D"
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
