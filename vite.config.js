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
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          gsap: ['gsap', '@gsap/react'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
