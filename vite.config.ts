import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Served at opensource.unisim.co.uk/invoices/ behind the portal Worker, so
// production assets live under /invoices/. Everything — your companies,
// clients, catalogue and documents, and the PDF itself — is made in the
// browser, so the PWA shell is the whole app and it works offline.
export default defineConfig(({ mode }) => {
  const BASE_PATH = mode === 'production' ? '/invoices/' : '/';
  return {
    base: BASE_PATH,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: {
      exclude: ['@unisim/sdk'],
      // ⚠️ Dev only, and REQUIRED — see Universal_PalsPayIn's vite.config.ts.
      // The SDK's QR component reaches qr-code-styling (UMD, no ESM build)
      // through a dynamic import; with the SDK excluded above, Vite serves it
      // raw and the plate silently never draws.
      include: ['qr-code-styling'],
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'unisim-icon.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Universal Invoices',
          short_name: 'Invoices',
          description: 'Quotes, pro formas, invoices and delivery notes as clean PDFs. No account, nothing uploaded.',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: BASE_PATH,
          scope: BASE_PATH,
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'unisim-icon.png', sizes: '128x128', type: 'image/png' },
          ],
        },
        workbox: {
          navigateFallback: `${BASE_PATH}index.html`,
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
