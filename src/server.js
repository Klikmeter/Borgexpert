import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createPool, createDb } from './db.js';
import { createResendMailer } from './mail.js';
import { createApp, createTurnstileVerifier, verstuurMails } from './app.js';

const cfg = loadConfig();
const log = console;

if (!cfg.databaseUrl) { log.error('DATABASE_URL ontbreekt. Koppel de Postgres-service in Railway (Variables > Add reference).'); process.exit(1); }
if (!cfg.resendApiKey) log.warn('RESEND_API_KEY ontbreekt: aanvragen worden opgeslagen maar nog niet gemaild. Ze gaan alsnog weg zodra de key is gezet.');
if (!cfg.turnstileSecretKey) log.warn('TURNSTILE_SECRET_KEY ontbreekt: alleen honeypot en rate limit beschermen tegen bots.');

const db = createDb(createPool(cfg.databaseUrl));
await db.init();
log.info('[db] schema gecontroleerd');

const mailer = createResendMailer({ apiKey: cfg.resendApiKey, apiUrl: cfg.resendApiUrl, log });
const verifyTurnstile = createTurnstileVerifier(cfg.turnstileSecretKey);
const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = createApp({ cfg, db, mailer, verifyTurnstile, indexHtml, log });

// Retry-lus: mails die niet weg konden (Resend down, key ontbrak) alsnog versturen.
async function verwerkOnverzonden() {
  if (!cfg.resendApiKey) return;
  try {
    const rijen = await db.onverzonden();
    for (const rij of rijen) {
      if (!cfg.confirmationEmail && rij.mail_verzonden_op) continue;
      await verstuurMails(rij, { db, mailer, cfg, log });
    }
  } catch (e) { log.error('[retry] ' + e.message); }
}
setTimeout(verwerkOnverzonden, 10_000);
setInterval(verwerkOnverzonden, cfg.retryIntervalMs).unref();

const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (info) => {
  log.info(`[server] luistert op ${info.address}:${info.port} (${cfg.appUrl || 'geen APP_URL'})`);
});

const stop = async () => { log.info('[server] stoppen'); server.close(); await db.close().catch(() => {}); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
