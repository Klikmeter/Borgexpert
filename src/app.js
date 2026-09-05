import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomBytes, randomInt } from 'node:crypto';
import { valideer } from './validate.js';
import { triage, faseLabel } from './triage.js';
import { naarRij } from './db.js';
import { interneMail, bevestigingsMail, esc } from './mail.js';
import { createRateLimiter } from './ratelimit.js';

const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // geen 0/O/1/I, prettig aan de telefoon

export function nieuweRef(now = new Date()) {
  const jm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  let s = '';
  for (let i = 0; i < 5; i++) s += ALFABET[randomInt(ALFABET.length)];
  return `BE-${jm}-${s}`;
}

export function clientIp(c, trustProxy) {
  const xff = trustProxy ? c.req.header('x-forwarded-for') : '';
  if (xff) return xff.split(',')[0].trim();
  return c.env?.incoming?.socket?.remoteAddress || '0.0.0.0';
}

/** Verstuurt beide mails voor een rij en werkt de status bij. Fouten worden geregistreerd, nooit gegooid. */
export async function verstuurMails(rij, { db, mailer, cfg, log }) {
  if (!rij.mail_verzonden_op) {
    try { await mailer.send(interneMail(rij, cfg)); await db.markeerMail(rij.id, { verzonden: true }); rij.mail_verzonden_op = new Date(); }
    catch (e) { log.error(`[mail] intern ${rij.ref} mislukt: ${e.message}`); await db.markeerMail(rij.id, { verzonden: false, fout: e.message }); }
  }
  if (cfg.confirmationEmail && !rij.bevestiging_verzonden_op) {
    try { await mailer.send(bevestigingsMail(rij, cfg)); await db.markeerBevestiging(rij.id, { verzonden: true }); rij.bevestiging_verzonden_op = new Date(); }
    catch (e) { log.error(`[mail] bevestiging ${rij.ref} mislukt: ${e.message}`); await db.markeerBevestiging(rij.id, { verzonden: false, fout: e.message }); }
  }
}

export function createApp({ cfg, db, mailer, verifyTurnstile, indexHtml, adres, log = console, now = () => new Date() }) {
  const app = new Hono();
  const limiter = createRateLimiter({ max: cfg.rateLimitMax, windowMs: cfg.rateLimitWindowMs });
  const adresLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

  // Beveiligingsheaders + canonieke host
  app.use('*', async (c, next) => {
    if (cfg.canonicalRedirect && cfg.canonicalHost && c.req.path !== '/health') {
      const host = (cfg.trustProxy && c.req.header('x-forwarded-host')) || c.req.header('host') || '';
      if (host && host !== cfg.canonicalHost) return c.redirect(cfg.appUrl + c.req.path, 301);
    }
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('X-Frame-Options', 'DENY');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (cfg.appUrl.startsWith('https://')) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  app.get('/health', async (c) => {
    try { await db.ping(); return c.json({ ok: true }); }
    catch (e) { log.error('[health] database onbereikbaar: ' + e.message); return c.json({ ok: false, fout: 'database' }, 503); }
  });

  app.use('/fonts/*', async (c, next) => { await next(); if (c.res.status === 200) c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable'); });
  app.use('/fonts/*', serveStatic({ root: './public' }));
  app.use('/img/*', async (c, next) => { await next(); if (c.res.status === 200) c.res.headers.set('Cache-Control', 'public, max-age=86400'); });
  app.use('/img/*', serveStatic({ root: './public' }));
  app.get('/favicon.svg', serveStatic({ path: './public/favicon.svg' }));
  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/', (c) => {
    const nonce = randomBytes(16).toString('base64');
    const ts = cfg.turnstileSiteKey;
    const html = indexHtml
      .replaceAll('__CSP_NONCE__', nonce)
      .replaceAll('__APP_URL__', cfg.appUrl)
      .replaceAll('__TURNSTILE_SCRIPT__', ts ? `<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '')
      .replaceAll('__TURNSTILE_WIDGET__', ts ? `<div class="cf-turnstile" data-sitekey="${esc(ts)}" data-language="nl" data-size="flexible"></div>` : '');
    c.header('Content-Security-Policy', [
      "default-src 'self'", `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`, 'frame-src https://challenges.cloudflare.com https://www.google.com',
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
    ].join('; '));
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });

  // Adressuggesties (PDOK via onze server, zodat de pagina alleen met zichzelf praat)
  app.get('/api/adres/suggest', async (c) => {
    if (!adres) return c.json({ ok: true, items: [] });
    if (!adresLimiter.allow(clientIp(c, cfg.trustProxy))) return c.json({ ok: false, items: [] }, 429);
    const q = (c.req.query('q') || '').trim().slice(0, 100);
    if (q.length < 3) return c.json({ ok: true, items: [] });
    c.header('Cache-Control', 'private, max-age=300');
    return c.json({ ok: true, items: await adres.suggest(q) });
  });
  app.get('/api/adres/lookup', async (c) => {
    if (!adres) return c.json({ ok: false }, 404);
    if (!adresLimiter.allow(clientIp(c, cfg.trustProxy))) return c.json({ ok: false }, 429);
    const id = c.req.query('id') || '';
    if (!/^adr-[a-z0-9]{1,40}$/.test(id)) return c.json({ ok: false }, 400);
    const a = await adres.lookup(id);
    return a ? c.json({ ok: true, adres: a }) : c.json({ ok: false }, 404);
  });

  app.post('/api/aanvraag', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ ok: false, fout: 'De aanvraag is te groot.' }, 413) }), async (c) => {
    // Alleen vanaf de eigen pagina
    const origin = c.req.header('origin');
    if (cfg.appUrl && origin && origin !== cfg.appUrl) return c.json({ ok: false, fout: 'Ongeldige herkomst.' }, 403);

    const ip = clientIp(c, cfg.trustProxy);
    if (!limiter.allow(ip)) return c.json({ ok: false, fout: 'Te veel aanvragen achter elkaar. Probeer het over een kwartier nog eens, of bel ons direct.' }, 429);

    let body;
    try { body = await c.req.json(); } catch { return c.json({ ok: false, fout: 'Ongeldige aanvraag.' }, 400); }
    const v = valideer(body);
    if (!v.ok) return c.json({ ok: false, fout: v.fout }, 400);
    const d = v.data;

    // Honeypot: bots vullen het verborgen veld in. Doe alsof het gelukt is, sla niets op.
    if (d.website) { log.warn(`[spam] honeypot gevuld vanaf ${ip}`); return c.json({ ok: true, ref: nieuweRef(now()) }); }

    if (cfg.turnstileSecretKey) {
      const goed = await verifyTurnstile(d.turnstile, ip).catch((e) => { log.error('[turnstile] ' + e.message); return false; });
      if (!goed) return c.json({ ok: false, fout: 'De beveiligingscontrole is niet gelukt. Vernieuw de pagina en probeer het opnieuw.' }, 400);
    }

    const { website, turnstile: _t, ...ruw } = d;
    const t = triage(d);
    let rij;
    for (let poging = 0; ; poging++) {
      const ref = nieuweRef(now());
      try {
        rij = await db.insert(naarRij(d, { ref, triage: t, faseLabel: faseLabel(d), ip, userAgent: (c.req.header('user-agent') || '').slice(0, 300), ruw }));
        break;
      } catch (e) {
        if (e.code === '23505' && poging < 3) continue; // ref al in gebruik, nieuwe proberen
        log.error('[db] opslaan mislukt: ' + e.message);
        return c.json({ ok: false, fout: 'We konden je aanvraag niet opslaan. Bel ons direct op (085) 760 72 78, dan helpen we je meteen.' }, 500);
      }
    }
    log.info(`[aanvraag] ${rij.ref} ${t} ${d.rol} ${d.adres}`);

    // Mail wordt na het antwoord verstuurd; mislukt dat, dan pakt de retry-lus het op.
    void verstuurMails(rij, { db, mailer, cfg, log });
    return c.json({ ok: true, ref: rij.ref });
  });

  app.notFound((c) => c.text('Niet gevonden', 404));
  app.onError((e, c) => { log.error('[app] ' + (e.stack || e.message)); return c.json({ ok: false, fout: 'Er ging iets mis. Probeer het opnieuw of bel ons direct.' }, 500); });
  return app;
}

/** Cloudflare Turnstile server-side check. */
export function createTurnstileVerifier(secret, fetchImpl = fetch) {
  return async (token, ip) => {
    if (!token) return false;
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
    const j = await r.json();
    return j.success === true;
  };
}
