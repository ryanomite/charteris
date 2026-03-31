import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

function basicAuthPlugin(): Plugin {
  return {
    name: 'basic-auth',
    configureServer(server) {
      const password = process.env.CHARTERIS_UI_PASSWORD;
      if (!password) return; // Skip auth if no password configured

      server.middlewares.use((req, res, next) => {
        const auth = req.headers.authorization;
        if (auth) {
          const [scheme, encoded] = auth.split(' ');
          if (scheme === 'Basic' && encoded) {
            const decoded = Buffer.from(encoded, 'base64').toString();
            const [, pwd] = decoded.split(':');
            if (pwd === password) {
              next();
              return;
            }
          }
        }
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="Charteris"');
        res.end('Unauthorized');
      });
    },
  };
}

export default defineConfig({
  plugins: [
    basicAuthPlugin(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['charteris-white-icon.svg'],
      manifest: {
        name: 'Charteris',
        short_name: 'Charteris',
        description: 'Personal task management dashboard',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
