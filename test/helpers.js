import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

export const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

export function fakeDb() {
  const rows = [];
  return {
    rows,
    async init() {}, async ping() {},
    async insert(rij) { if (rows.some((r) => r.ref === rij.ref)) { const e = new Error('dup'); e.code = '23505'; throw e; } const r = { id: rows.length + 1, aangemaakt_op: new Date(), mail_verzonden_op: null, bevestiging_verzonden_op: null, ...rij }; rows.push(r); return r; },
    async markeerMail(id, { verzonden, fout }) { const r = rows.find((x) => x.id === id); r.mail_pogingen = (r.mail_pogingen || 0) + 1; if (verzonden) r.mail_verzonden_op = new Date(); r.mail_fout = fout || null; },
    async markeerBevestiging(id, { verzonden, fout }) { const r = rows.find((x) => x.id === id); r.bevestiging_pogingen = (r.bevestiging_pogingen || 0) + 1; if (verzonden) r.bevestiging_verzonden_op = new Date(); r.bevestiging_fout = fout || null; },
    async onverzonden() { return rows.filter((r) => !r.mail_verzonden_op || !r.bevestiging_verzonden_op); },
  };
}

export function fakeMailer({ fail = false } = {}) {
  const sent = [];
  return { sent, fail, async send(m) { if (this.fail) throw new Error('Resend 500: kapot'); sent.push(m); return { id: 'm' + sent.length }; } };
}

export const stilleLog = { info() {}, warn() {}, error() {} };

export function maakApp(over = {}) {
  const cfg = loadConfig({ APP_URL: 'https://www.borgexpert.online', RATE_LIMIT_MAX: '3', ...over.env });
  const db = over.db || fakeDb();
  const mailer = over.mailer || fakeMailer();
  const verifyTurnstile = over.verifyTurnstile || (async () => true);
  const app = createApp({ cfg, db, mailer, verifyTurnstile, indexHtml, log: stilleLog });
  return { app, db, mailer, cfg };
}

export const geldig = () => ({
  rol: 'particulier', naam: 'Jan de Vries', bedrijf: '', telefoon: '06 12345678', email: 'Jan@Example.com', adres: 'Dorpsstraat 1, Ede',
  stil: '', korte: '', dso: 'ja', dsodatum: '2026-08-01', vergunning: 'ja', borger: 'Bureau Kwaliteitsborging (Amersfoort)', borgeranders: '',
  gemeente: 'nee', type: 'Nieuwbouw woning', fase: '2', fundbeton: 'ja', verdbeton: '', wanneer: 'Zo snel mogelijk', rapport: 'ja', plan: 'nee',
  toelichting: 'Aannemer kan <b>volgende week</b> verder.', bron: 'belactie', website: '', turnstile: 'tok',
});

export const post = (app, body, headers = {}) => app.request('https://www.borgexpert.online/api/aanvraag', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.borgexpert.online', 'X-Forwarded-For': headers.ip || '10.0.0.1', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

export const wacht = (ms = 20) => new Promise((r) => setTimeout(r, ms));
