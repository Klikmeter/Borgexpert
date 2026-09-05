import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdresClient } from '../src/adres.js';

const pdok = (docs) => async (url) => ({ ok: true, json: async () => ({ response: { docs } }), url });

test('suggest: vraagt PDOK om adressen en geeft id + label terug', async () => {
  const calls = [];
  const c = createAdresClient({ log: {}, fetchImpl: async (url, init) => { calls.push(url); return pdok([{ id: 'adr-1', weergavenaam: 'Lindelaan 8, 7314AB Apeldoorn', type: 'adres' }, { id: '', weergavenaam: 'kapot' }])(url, init); } });
  const r = await c.suggest('Lindelaan 8');
  assert.deepEqual(r, [{ id: 'adr-1', label: 'Lindelaan 8, 7314AB Apeldoorn' }]);
  assert.match(calls[0], /locatieserver\/search\/v3_1\/suggest\?q=Lindelaan\+8&fq=type%3Aadres&rows=6/);
  await c.suggest('Lindelaan 8');
  assert.equal(calls.length, 1, 'tweede keer uit de cache');
});

test('lookup: zet PDOK-velden om naar ons formaat, huisletter en toevoeging samengevoegd', async () => {
  const c = createAdresClient({ log: {}, fetchImpl: pdok([{ id: 'adr-2', weergavenaam: 'Kerkstraat 12a-2, 8011AB Zwolle', straatnaam: 'Kerkstraat', huisnummer: 12, huisletter: 'a', huisnummertoevoeging: '2', postcode: '8011AB', woonplaatsnaam: 'Zwolle', gemeentenaam: 'Zwolle' }]) });
  const a = await c.lookup('adr-2');
  assert.equal(a.huisnummer, '12a2');
  assert.equal(a.straat, 'Kerkstraat');
  assert.equal(a.gemeente, 'Zwolle');
  const geen = createAdresClient({ log: {}, fetchImpl: pdok([]) });
  assert.equal(await geen.lookup('adr-x'), null);
});

test('PDOK onbereikbaar: lege lijst, geen fout naar de bezoeker', async () => {
  const c = createAdresClient({ log: {}, fetchImpl: async () => { throw new Error('timeout'); } });
  assert.deepEqual(await c.suggest('Lindelaan'), []);
  assert.equal(await c.lookup('adr-1'), null);
});
