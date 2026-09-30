import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appDir,
  envDir: path.resolve(appDir, '..'),
  plugins: [react()],
  server: { fs: { allow: [path.resolve(appDir, '..')] } },
  build: {
    outDir: path.resolve(appDir, 'dist'),
    emptyOutDir: true,
  },
});
