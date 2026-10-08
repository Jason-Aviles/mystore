import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Split the big, rarely-changing vendors into their own cached
        // chunks so they load in parallel with app code and survive app
        // redeploys in the browser cache. (model-viewer is already a
        // dynamic import via Logo3D, so it stays its own lazy chunk.)
        // A function (not a name list) so the gsap/* plugin entry points
        // (ScrollTrigger, SplitText, Flip, …) land in the gsap chunk too —
        // otherwise they ride in the app chunk and re-download every deploy.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/]node_modules[\/](gsap|@gsap)[\/]/.test(id)) return 'gsap';
          if (/[\/]node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\/]/.test(id)) return 'react-vendor';
          if (/[\/]node_modules[\/]@supabase[\/]/.test(id)) return 'supabase';
          return undefined;
        },
      },
    },
  },
});
