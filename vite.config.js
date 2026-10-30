import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { appConfig, normalizeBase } from './app.config.js';

const base = normalizeBase(process.env.BASE_PATH || '/');
export default defineConfig({
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      scope: base,
      manifest: {
        id: base,
        name: appConfig.name,
        short_name: appConfig.shortName,
        description: appConfig.description,
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: appConfig.themeColor,
        background_color: appConfig.backgroundColor,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}', 'vm/**'],
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});
