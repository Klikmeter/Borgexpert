// Lokale preview zonder database of Resend: `npm run preview`, dan http://localhost:8088
import { serve } from '@hono/node-server';
import { maakApp } from '../test/helpers.js';
const { app } = maakApp({ env: { ...process.env, APP_URL: 'http://localhost:8088' } });
serve({ fetch: app.fetch, port: 8088, hostname: '127.0.0.1' }, () => console.log('preview op http://localhost:8088 (aanvragen worden niet opgeslagen)'));
