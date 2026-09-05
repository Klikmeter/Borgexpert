import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valideer } from '../src/validate.js';
import { triage, faseLabel } from '../src/triage.js';
import { geldig } from './helpers.js';

test('geldige aanvraag wordt geaccepteerd en genormaliseerd', () => {
  const r = valideer(geldig());
  assert.equal(r.ok, true);
  assert.equal(r.data.email, 'jan@example.com');
});

test('verplichte velden en formaten', () => {
  assert.match(valideer({ ...geldig(), naam: 'J' }).fout, /naam/i);
  assert.match(valideer({ ...geldig(), telefoon: '12' }).fout, /telefoon/i);
  assert.match(valideer({ ...geldig(), email: 'geen-mail' }).fout, /e-mail/i);
  assert.match(valideer({ ...geldig(), fase: '9' }).fout, /fase/i);
  assert.equal(valideer({ ...geldig(), rol: 'hacker' }).ok, false);
  assert.equal(valideer({ ...geldig(), dso: '' }).ok, false);
  assert.equal(valideer({ ...geldig(), dsodatum: 'gisteren' }).ok, false);
});

test('onbekende velden en te lange invoer worden geweigerd', () => {
  assert.equal(valideer({ ...geldig(), extra: 'x' }).ok, false);
  assert.equal(valideer({ ...geldig(), toelichting: 'a'.repeat(4001) }).ok, false);
  assert.equal(valideer({ ...geldig(), adres: 'a'.repeat(241) }).ok, false);
});

test('ontbrekende optionele velden zijn prima', () => {
  const r = valideer({ rol: 'aannemer', naam: 'Piet', telefoon: '0612345678', email: 'p@x.nl', adres: 'Straat 2', dso: 'weet', fase: '0' });
  assert.equal(r.ok, true);
  assert.equal(r.data.bedrijf, '');
});

test('triage volgt de paginalogica', () => {
  assert.equal(triage({ fase: '0' }), 'ok');
  assert.equal(triage({ fase: '2', fundbeton: 'nee' }), 'ok');
  assert.equal(triage({ fase: '2', fundbeton: 'ja', rapport: 'ja' }), 'warn');
  assert.equal(triage({ fase: '2', fundbeton: 'ja', rapport: 'nee' }), 'crit');
  assert.equal(triage({ fase: '4', verdbeton: 'nee', rapport: 'nee' }), 'crit'); // vanaf fase 3 is er altijd verborgen werk
  assert.equal(triage({ fase: '4', verdbeton: '' , rapport: 'weet'}), 'crit');
  assert.equal(triage({ fase: '7', rapport: 'ja' }), 'warn');
  assert.equal(faseLabel({ fase: '2', fundbeton: 'ja' }), 'Fundering aangelegd, beton gestort');
  assert.equal(faseLabel({ fase: '6' }), 'Wind- en waterdicht');
});
