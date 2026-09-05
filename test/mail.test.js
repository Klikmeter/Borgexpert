import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interneMail, bevestigingsMail, createResendMailer } from '../src/mail.js';
import { loadConfig } from '../src/config.js';
import { naarRij } from '../src/db.js';
import { valideer } from '../src/validate.js';
import { geldig } from './helpers.js';

const cfg = loadConfig({ APP_URL: 'https://www.borgexpert.online', EMAIL_TO: 'info@borgexpert.nl', EMAIL_FROM: 'Borg Expert <aanvraag@borgexpert.online>' });
const rij = () => ({ id: 1, aangemaakt_op: new Date('2026-09-05T08:00:00Z'), ...naarRij(valideer(geldig()).data, { ref: 'BE-2609-ABCDE', triage: 'warn', faseLabel: 'Fundering aangelegd, beton gestort', ruw: {} }) });

test('interne mail: naar de inbox, reply-to aanvrager, HTML ge-escaped', () => {
  const m = interneMail(rij(), cfg);
  assert.deepEqual(m.to, ['info@borgexpert.nl']);
  assert.equal(m.reply_to, 'jan@example.com');
  assert.match(m.subject, /BE-2609-ABCDE/);
  assert.match(m.subject, /Overname met dossiercheck/);
  assert.match(m.subject, /Dorpsstraat 1, Ede/);
  assert.ok(!m.html.includes('<b>volgende week</b>'), 'html uit de toelichting mag niet in de mail terechtkomen');
  assert.ok(m.html.includes('&lt;b&gt;volgende week&lt;/b&gt;'));
  assert.match(m.text, /Bouwmelding DSO: Ja \(2026-08-01\)/);
  assert.match(m.text, /Bouwfase: Fundering aangelegd, beton gestort/);
  assert.match(m.text, /Bron: belactie/);
  assert.equal(m.idempotencyKey, 'intern-BE-2609-ABCDE');
});

test('bevestigingsmail: naar de aanvrager, met referentie, telefoon en WhatsApp-knop', () => {
  const m = bevestigingsMail(rij(), cfg);
  assert.deepEqual(m.to, ['jan@example.com']);
  assert.equal(m.reply_to, 'info@borgexpert.nl');
  assert.match(m.subject, /uw aanvraag ontvangen/);
  assert.match(m.text, /nemen zo snel mogelijk contact met u op/);
  assert.match(m.text, /Spoed\? Neem dan telefonisch contact/);
  assert.match(m.text, /\(085\) 760 72 78/);
  assert.match(m.html, /https:\/\/wa\.me\/31686800095\?text=/);
  assert.match(m.html, /WhatsApp-bericht<\/a>\./);
  assert.ok(!m.html.includes('06 86 80 00 95') && !m.text.includes('06 86 80 00 95'), 'nummer niet zichtbaar');
  assert.ok(!m.html.includes('#25D366'), 'geen groene knop meer');
  assert.match(m.html, /BE-2609-ABCDE/);
  assert.match(m.html, /<a href="https:\/\/borgexpert.nl\/projecten\/"[^>]*>Klik hier<\/a>/);
});

test('Resend-mailer stuurt het juiste verzoek en meldt fouten leesbaar', async () => {
  const calls = [];
  const ok = createResendMailer({ apiKey: 're_test', log: {}, fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'abc' }) }; } });
  const r = await ok.send(bevestigingsMail(rij(), cfg));
  assert.equal(r.id, 'abc');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'bevestiging-BE-2609-ABCDE');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.idempotencyKey, undefined);
  assert.equal(body.from, 'Borg Expert <aanvraag@borgexpert.online>');

  const kapot = createResendMailer({ apiKey: 're_test', log: {}, fetchImpl: async () => ({ ok: false, status: 422, text: async () => '{"message":"domain not verified"}' }) });
  await assert.rejects(kapot.send(bevestigingsMail(rij(), cfg)), /Resend 422: .*domain not verified/);

  const zonderKey = createResendMailer({ apiKey: '', log: {} });
  await assert.rejects(zonderKey.send(bevestigingsMail(rij(), cfg)), /RESEND_API_KEY ontbreekt/);
});
