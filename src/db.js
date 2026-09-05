import pg from 'pg';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS aanvragen (
  id                      bigserial PRIMARY KEY,
  ref                     text UNIQUE NOT NULL,
  aangemaakt_op           timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'nieuw',
  triage                  text NOT NULL,
  rol                     text NOT NULL,
  naam                    text NOT NULL,
  bedrijf                 text,
  telefoon                text NOT NULL,
  email                   text NOT NULL,
  adres                   text NOT NULL,
  adres_bag_id            text,
  adres_straat            text,
  adres_huisnummer        text,
  adres_postcode          text,
  adres_plaats            text,
  adres_gemeente          text,
  projecten_stil          integer,
  korte_termijn           text,
  dso                     text NOT NULL,
  dso_datum               date,
  vergunning              text,
  vorige_borger           text,
  vorige_borger_anders    text,
  gemeente_contact        text,
  bouwwerk_type           text,
  fase                    smallint NOT NULL,
  fase_label              text NOT NULL,
  fundering_beton         text,
  verdieping_beton        text,
  wanneer                 text,
  rapportages             text,
  borgingsplan            text,
  toelichting             text,
  bron                    text,
  ip                      text,
  user_agent              text,
  ruw                     jsonb NOT NULL,
  mail_verzonden_op       timestamptz,
  mail_pogingen           integer NOT NULL DEFAULT 0,
  mail_fout               text,
  bevestiging_verzonden_op timestamptz,
  bevestiging_pogingen    integer NOT NULL DEFAULT 0,
  bevestiging_fout        text
);
ALTER TABLE aanvragen
  ADD COLUMN IF NOT EXISTS adres_bag_id text,
  ADD COLUMN IF NOT EXISTS adres_straat text,
  ADD COLUMN IF NOT EXISTS adres_huisnummer text,
  ADD COLUMN IF NOT EXISTS adres_postcode text,
  ADD COLUMN IF NOT EXISTS adres_plaats text,
  ADD COLUMN IF NOT EXISTS adres_gemeente text;
CREATE INDEX IF NOT EXISTS aanvragen_aangemaakt_idx ON aanvragen (aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS aanvragen_mail_open_idx ON aanvragen (id) WHERE mail_verzonden_op IS NULL OR bevestiging_verzonden_op IS NULL;
`;

const KOLOMMEN = [
  'ref', 'triage', 'rol', 'naam', 'bedrijf', 'telefoon', 'email', 'adres', 'adres_bag_id', 'adres_straat', 'adres_huisnummer', 'adres_postcode', 'adres_plaats', 'adres_gemeente', 'projecten_stil', 'korte_termijn', 'dso', 'dso_datum',
  'vergunning', 'vorige_borger', 'vorige_borger_anders', 'gemeente_contact', 'bouwwerk_type', 'fase', 'fase_label', 'fundering_beton',
  'verdieping_beton', 'wanneer', 'rapportages', 'borgingsplan', 'toelichting', 'bron', 'ip', 'user_agent', 'ruw',
];

const leeg = (v) => (v === '' || v === undefined ? null : v);

/** Vertaalt de gevalideerde formulierdata naar een rij. */
export function naarRij(d, extra) {
  return {
    ref: extra.ref, triage: extra.triage, rol: d.rol, naam: d.naam, bedrijf: leeg(d.bedrijf), telefoon: d.telefoon, email: d.email, adres: d.adres,
    adres_bag_id: leeg(d.adres_id), adres_straat: leeg(d.adres_straat), adres_huisnummer: leeg(d.adres_huisnummer), adres_postcode: leeg(d.adres_postcode), adres_plaats: leeg(d.adres_plaats), adres_gemeente: leeg(d.adres_gemeente),
    projecten_stil: d.stil ? Number(d.stil) : null, korte_termijn: leeg(d.korte), dso: d.dso, dso_datum: leeg(d.dsodatum), vergunning: leeg(d.vergunning),
    vorige_borger: leeg(d.borger), vorige_borger_anders: leeg(d.borgeranders), gemeente_contact: leeg(d.gemeente), bouwwerk_type: leeg(d.type),
    fase: Number(d.fase), fase_label: extra.faseLabel, fundering_beton: leeg(d.fundbeton), verdieping_beton: leeg(d.verdbeton), wanneer: leeg(d.wanneer),
    rapportages: leeg(d.rapport), borgingsplan: leeg(d.plan), toelichting: leeg(d.toelichting), bron: leeg(d.bron), ip: extra.ip || null,
    user_agent: extra.userAgent || null, ruw: JSON.stringify(extra.ruw),
  };
}

export function createDb(pool) {
  return {
    async init() { await pool.query(SCHEMA); },
    /** Slaat een aanvraag op. Geeft de rij (met id) terug. */
    async insert(rij) {
      const cols = KOLOMMEN.filter((k) => k in rij);
      const sql = `INSERT INTO aanvragen (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`;
      const r = await pool.query(sql, cols.map((k) => rij[k]));
      return r.rows[0];
    },
    async refBestaat(ref) { const r = await pool.query('SELECT 1 FROM aanvragen WHERE ref = $1', [ref]); return r.rowCount > 0; },
    async markeerMail(id, { verzonden, fout }) {
      await pool.query(
        'UPDATE aanvragen SET mail_pogingen = mail_pogingen + 1, mail_verzonden_op = CASE WHEN $2 THEN now() ELSE mail_verzonden_op END, mail_fout = $3 WHERE id = $1',
        [id, !!verzonden, fout || null]);
    },
    async markeerBevestiging(id, { verzonden, fout }) {
      await pool.query(
        'UPDATE aanvragen SET bevestiging_pogingen = bevestiging_pogingen + 1, bevestiging_verzonden_op = CASE WHEN $2 THEN now() ELSE bevestiging_verzonden_op END, bevestiging_fout = $3 WHERE id = $1',
        [id, !!verzonden, fout || null]);
    },
    /** Aanvragen waarvan een mail nog niet (of niet succesvol) is verstuurd. */
    async onverzonden(maxPogingen = 8, limiet = 25) {
      const r = await pool.query(
        `SELECT * FROM aanvragen WHERE (mail_verzonden_op IS NULL AND mail_pogingen < $1) OR (bevestiging_verzonden_op IS NULL AND bevestiging_pogingen < $1) ORDER BY id LIMIT $2`,
        [maxPogingen, limiet]);
      return r.rows;
    },
    async ping() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
  };
}

export function createPool(databaseUrl) {
  // Railway's interne Postgres-URL heeft geen TLS nodig; een externe/proxy-URL wel.
  const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false };
  return new pg.Pool({ connectionString: databaseUrl, ssl, max: 5, idleTimeoutMillis: 30_000 });
}
