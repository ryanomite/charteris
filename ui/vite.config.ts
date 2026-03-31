import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
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
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
