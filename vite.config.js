import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Root-relative assets keep SPA deep links (for example /catalogo-qr/:id) loading chunks from /assets.
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons';
          if (id.includes('/node_modules/@capacitor/')) return 'vendor-capacitor';
          return undefined;
        },
      },
    },
  },
})
