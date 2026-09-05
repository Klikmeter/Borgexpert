// Adressuggesties via de PDOK Locatieserver (BAG, gratis, geen sleutel). De pagina praat met onze server, de server met PDOK.
const BASIS = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const VELDEN = 'id,weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,gemeentenaam';

export function createAdresClient({ fetchImpl = fetch, log = console, cacheTtlMs = 10 * 60_000 } = {}) {
  const cache = new Map();
  const get = async (url) => {
    const hit = cache.get(url);
    if (hit && hit.t > Date.now() - cacheTtlMs) return hit.v;
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(5_000), headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`PDOK ${r.status}`);
    const j = await r.json();
    const v = j?.response?.docs || [];
    if (cache.size > 2000) cache.clear();
    cache.set(url, { t: Date.now(), v });
    return v;
  };
  return {
    /** Suggesties bij een (deel van een) adres. Geeft [{id, label}]. */
    async suggest(q) {
      const p = new URLSearchParams({ q, fq: 'type:adres', rows: '6', fl: 'id,weergavenaam' });
      try {
        const docs = await get(`${BASIS}/suggest?${p}`);
        return docs.filter((d) => d.id && d.weergavenaam).map((d) => ({ id: d.id, label: d.weergavenaam }));
      } catch (e) { log.warn?.('[adres] suggest mislukt: ' + e.message); return []; }
    },
    /** Details van één gekozen adres. Geeft null als het niet gevonden is. */
    async lookup(id) {
      const p = new URLSearchParams({ id, fl: VELDEN });
      try {
        const [d] = await get(`${BASIS}/lookup?${p}`);
        if (!d) return null;
        return {
          id: d.id, label: d.weergavenaam || '', straat: d.straatnaam || '',
          huisnummer: [d.huisnummer, d.huisletter, d.huisnummertoevoeging].filter(Boolean).join(''),
          postcode: d.postcode || '', plaats: d.woonplaatsnaam || '', gemeente: d.gemeentenaam || '',
        };
      } catch (e) { log.warn?.('[adres] lookup mislukt: ' + e.message); return null; }
    },
  };
}
