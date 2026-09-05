import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakApp, geldig, post, wacht, fakeMailer, fakeDb, stilleLog } from './helpers.js';
import { verstuurMails, nieuweRef } from '../src/app.js';

test('pagina: nonce in CSP en script, fonts lokaal, geen Turnstile zonder sitekey', async () => {
  const { app } = maakApp();
  const r = await app.request('https://www.borgexpert.online/');
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  const nonce = csp.match(/nonce-([^']+)/)[1];
  const html = await r.text();
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(!html.includes('__CSP_NONCE__') && !html.includes('__TURNSTILE'));
  assert.ok(!html.includes('challenges.cloudflare.com'));
  assert.ok(!html.includes('fonts.googleapis.com'));
  assert.ok(html.includes('/fonts/fonts.css'));
  assert.ok(html.includes('name="website"'), 'honeypot aanwezig');
  assert.ok(html.includes('wa.me/31686800095'));
  assert.ok(!html.includes('wa.me/31857607278'));
  assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
});

test('pagina: met sitekey wordt Turnstile ingeladen', async () => {
  const { app } = maakApp({ env: { TURNSTILE_SITE_KEY: '1x000' } });
  const html = await (await app.request('https://www.borgexpert.online/')).text();
  assert.ok(html.includes('challenges.cloudflare.com/turnstile/v0/api.js'));
  assert.ok(html.includes('class="cf-turnstile" data-sitekey="1x000"'));
});

test('fonts worden geserveerd met lange cache', async () => {
  const { app } = maakApp();
  const r = await app.request('https://www.borgexpert.online/fonts/fonts.css');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
});

test('geldige aanvraag: opgeslagen, twee mails, referentie terug', async () => {
  const { app, db, mailer } = maakApp();
  const r = await post(app, geldig());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.match(j.ref, /^BE-\d{4}-[A-Z2-9]{5}$/);
  assert.equal(db.rows.length, 1);
  const rij = db.rows[0];
  assert.equal(rij.ref, j.ref);
  assert.equal(rij.triage, 'warn');
  assert.equal(rij.email, 'jan@example.com');
  assert.equal(rij.ip, '10.0.0.1');
  assert.equal(rij.fase_label, 'Fundering aangelegd, beton gestort');
  assert.ok(!JSON.parse(rij.ruw).turnstile && !('website' in JSON.parse(rij.ruw)));
  await wacht();
  assert.equal(mailer.sent.length, 2);
  assert.deepEqual(mailer.sent[0].to, ['info@borgexpert.nl']);
  assert.deepEqual(mailer.sent[1].to, ['jan@example.com']);
  assert.ok(rij.mail_verzonden_op && rij.bevestiging_verzonden_op);
});

test('mail mislukt: aanvraag blijft bewaard, fout geregistreerd, retry verstuurt alsnog', async () => {
  const mailer = fakeMailer({ fail: true });
  const { app, db, cfg } = maakApp({ mailer });
  const r = await post(app, geldig());
  assert.equal(r.status, 200);
  await wacht();
  const rij = db.rows[0];
  assert.equal(rij.mail_verzonden_op, null);
  assert.match(rij.mail_fout, /Resend 500/);
  assert.equal(rij.mail_pogingen, 1);
  mailer.fail = false;
  for (const x of await db.onverzonden()) await verstuurMails(x, { db, mailer, cfg, log: stilleLog });
  assert.ok(rij.mail_verzonden_op && rij.bevestiging_verzonden_op);
  assert.equal(mailer.sent.length, 2);
});

test('bevestigingsmail uit te zetten', async () => {
  const { app, mailer } = maakApp({ env: { CONFIRMATION_EMAIL: 'false' } });
  await post(app, geldig());
  await wacht();
  assert.equal(mailer.sent.length, 1);
});

test('honeypot: doet alsof, slaat niets op', async () => {
  const { app, db, mailer } = maakApp();
  const r = await post(app, { ...geldig(), website: 'http://spam' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  await wacht();
  assert.equal(db.rows.length, 0);
  assert.equal(mailer.sent.length, 0);
});

test('turnstile mislukt: 400, niets opgeslagen', async () => {
  const { app, db } = maakApp({ env: { TURNSTILE_SECRET_KEY: 's' }, verifyTurnstile: async () => false });
  const r = await post(app, geldig());
  assert.equal(r.status, 400);
  assert.match((await r.json()).fout, /beveiligingscontrole/);
  assert.equal(db.rows.length, 0);
});

test('ongeldige invoer: 400 met leesbare fout', async () => {
  const { app, db } = maakApp();
  const r = await post(app, { ...geldig(), email: 'nope' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).fout, /e-mailadres/);
  assert.equal((await post(app, '{niet json')).status, 400);
  assert.equal(db.rows.length, 0);
});

test('verkeerde origin: 403', async () => {
  const { app } = maakApp();
  const r = await post(app, geldig(), { Origin: 'https://kwaadaardig.example' });
  assert.equal(r.status, 403);
});

test('rate limit per IP: 429 na het maximum', async () => {
  const { app } = maakApp();
  for (let i = 0; i < 3; i++) assert.equal((await post(app, geldig())).status, 200);
  assert.equal((await post(app, geldig())).status, 429);
  assert.equal((await post(app, geldig(), { ip: '10.0.0.2' })).status, 200);
});

test('database kapot: 500 met telefoonnummer, geen crash', async () => {
  const db = fakeDb(); db.insert = async () => { throw new Error('connection refused'); };
  const { app } = maakApp({ db });
  const r = await post(app, geldig());
  assert.equal(r.status, 500);
  assert.match((await r.json()).fout, /760 72 78/);
});

test('dubbele referentie wordt opnieuw geprobeerd', async () => {
  const db = fakeDb(); let n = 0; const orig = db.insert.bind(db);
  db.insert = async (rij) => { if (n++ === 0) { const e = new Error('dup'); e.code = '23505'; throw e; } return orig(rij); };
  const { app } = maakApp({ db });
  assert.equal((await post(app, geldig())).status, 200);
  assert.equal(db.rows.length, 1);
});

test('canonieke redirect alleen als ingeschakeld, nooit voor /health', async () => {
  const { app } = maakApp({ env: { CANONICAL_REDIRECT: 'true' } });
  const r = await app.request('https://x.up.railway.app/?bron=test', { headers: { host: 'x.up.railway.app' } });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://www.borgexpert.online/');
  const h = await app.request('https://x.up.railway.app/health', { headers: { host: 'x.up.railway.app' } });
  assert.equal(h.status, 200);
});

test('te grote body: 413', async () => {
  const { app } = maakApp();
  const r = await post(app, { ...geldig(), toelichting: 'a'.repeat(70_000) });
  assert.equal(r.status, 413);
});

test('referentie: formaat en geen verwarrende tekens', () => {
  for (let i = 0; i < 200; i++) assert.match(nieuweRef(new Date('2026-09-05')), /^BE-2609-[A-HJ-NP-Z2-9]{5}$/);
});
