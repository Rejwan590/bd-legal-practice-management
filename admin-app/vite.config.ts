import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/admin/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-admin-assets-for-vercel',
      closeBundle() {
        const srcAssets = path.resolve(rootDir, 'dist', 'assets');
        const destAssets = path.resolve(rootDir, 'dist', 'admin', 'assets');
        if (fs.existsSync(srcAssets)) {
          fs.mkdirSync(path.dirname(destAssets), { recursive: true });
          fs.cpSync(srcAssets, destAssets, { recursive: true });
        }
      },
    },
  ],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
