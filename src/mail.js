import { TRIAGE_LABEL } from './triage.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const JNW = { ja: 'Ja', nee: 'Nee', weet: 'Weet ik niet' };
const ROL = { particulier: 'Particulier', aannemer: 'Aannemer of bouwbedrijf', anders: 'Anders (architect, ontwikkelaar)' };
const of = (v, map) => (v ? (map ? map[v] || v : v) : '-');

function datumNl(d) {
  return new Date(d).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'full', timeStyle: 'short' });
}

/** De velden van een aanvraag als [label, waarde]-paren, in leesvolgorde. */
export function velden(rij) {
  const r = [];
  r.push(['Referentie', rij.ref]);
  r.push(['Ingediend', datumNl(rij.aangemaakt_op || Date.now())]);
  r.push(['Triage', TRIAGE_LABEL[rij.triage] || rij.triage]);
  r.push(['Ik ben', of(rij.rol, ROL)]);
  r.push(['Naam', rij.naam]);
  if (rij.bedrijf) r.push(['Bedrijf', rij.bedrijf]);
  r.push(['Telefoon', rij.telefoon]);
  r.push(['E-mail', rij.email]);
  r.push(['Adres project', rij.adres]);
  if (rij.adres_gemeente) r.push(['Gemeente', rij.adres_gemeente]);
  if (rij.projecten_stil != null) r.push(['Projecten stil', String(rij.projecten_stil)]);
  if (rij.korte_termijn) r.push(['Korte termijn nodig', rij.korte_termijn]);
  r.push(['Bouwmelding DSO', of(rij.dso, JNW) + (rij.dso_datum ? ' (' + String(rij.dso_datum).slice(0, 10) + ')' : '')]);
  r.push(['Omgevingsvergunning', of(rij.vergunning, JNW)]);
  r.push(['Vorige borger', rij.vorige_borger === 'anders' ? (rij.vorige_borger_anders || 'Andere partij') : of(rij.vorige_borger, { weet: 'Weet ik niet' })]);
  r.push(['Gemeente contact / stillegging', of(rij.gemeente_contact, JNW)]);
  r.push(['Bouwwerk', of(rij.bouwwerk_type)]);
  r.push(['Bouwfase', rij.fase_label]);
  r.push(['Weer verder', of(rij.wanneer)]);
  r.push(['Rapportages vorige borger', of(rij.rapportages, JNW)]);
  r.push(['Borgingsplan in bezit', of(rij.borgingsplan, JNW)]);
  r.push(['Toelichting', rij.toelichting || '-']);
  r.push(['Bron', rij.bron || '-']);
  return r;
}

/** Mail naar de inbox van Borg Expert. */
export function interneMail(rij, cfg) {
  const v = velden(rij);
  const subject = `Bouwstop-aanvraag ${rij.ref} · ${TRIAGE_LABEL[rij.triage] || rij.triage} · ${rij.adres}`;
  const text = `Nieuwe aanvraag via ${cfg.appUrl || 'de bouwstop-pagina'}\n\n` + v.map(([k, w]) => `${k}: ${w}`).join('\n') + `\n\nBeantwoord deze mail om de aanvrager direct te bereiken.`;
  const rows = v.map(([k, w]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${esc(w).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#333;line-height:1.5"><p>Nieuwe aanvraag via ${esc(cfg.appUrl || 'de bouwstop-pagina')}.</p><table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table><p style="color:#666;font-size:13px">Beantwoord deze mail om de aanvrager direct te bereiken.</p></div>`;
  const m = { from: cfg.emailFrom, to: cfg.emailTo.split(',').map((x) => x.trim()).filter(Boolean), reply_to: rij.email, subject, text, html, idempotencyKey: `intern-${rij.ref}` };
  if (cfg.emailBcc?.length) m.bcc = cfg.emailBcc;
  return m;
}

/** Bevestiging aan de aanvrager. */
export function bevestigingsMail(rij, cfg) {
  const subject = `We hebben uw aanvraag ontvangen (referentie ${rij.ref})`;
  const wa = `${cfg.whatsappHref}?text=${encodeURIComponent(`Hallo, ik heb een bouwstop-aanvraag gedaan met referentie ${rij.ref}.`)}`;
  const text = `Beste ${rij.naam},

We hebben uw aanvraag voor ${rij.adres} ontvangen en nemen zo snel mogelijk contact met u op.

Uw referentie: ${rij.ref}

Spoed? Neem dan telefonisch contact met ons op via ${cfg.phone}, of stuur een WhatsApp-bericht: ${wa}

Benieuwd welke projecten wij al hebben gedaan? Kijk op https://borgexpert.nl/projecten/

Met vriendelijke groet,
Borg Expert
${cfg.phone} · www.borgexpert.nl`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#333;line-height:1.55;max-width:560px">
<p>Beste ${esc(rij.naam)},</p>
<p>We hebben uw aanvraag voor <strong>${esc(rij.adres)}</strong> ontvangen en nemen zo snel mogelijk contact met u op.</p>
<p>Uw referentie: <strong>${esc(rij.ref)}</strong></p>
<p><strong>Spoed?</strong> Neem dan telefonisch contact met ons op via <a href="${cfg.phoneHref}" style="color:#1D54E9">${esc(cfg.phone)}</a>, of stuur ons een <a href="${esc(wa)}" style="color:#1D54E9">WhatsApp-bericht</a>.</p>
<p>Benieuwd welke projecten wij al hebben gedaan? <a href="https://borgexpert.nl/projecten/" style="color:#1D54E9">Klik hier</a>.</p>
<p>Met vriendelijke groet,<br>Borg Expert<br><span style="color:#666;font-size:13px">${esc(cfg.phone)} · <a href="https://www.borgexpert.nl" style="color:#1D54E9">www.borgexpert.nl</a></span></p>
</div>`;
  return { from: cfg.emailFrom, to: [rij.email], reply_to: cfg.emailTo, subject, text, html, idempotencyKey: `bevestiging-${rij.ref}` };
}

/** Verstuurt via de Resend REST API. Gooit een Error met leesbare boodschap bij mislukking. */
export function createResendMailer({ apiKey, apiUrl = 'https://api.resend.com/emails', fetchImpl = fetch, log = console }) {
  return {
    async send(m) {
      if (!apiKey) throw new Error('RESEND_API_KEY ontbreekt');
      const { idempotencyKey, ...body } = m;
      const r = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Resend ${r.status}: ${t.slice(0, 300)}`);
      }
      const j = await r.json().catch(() => ({}));
      log.info?.(`[mail] verzonden ${idempotencyKey} id=${j.id || '?'}`);
      return j;
    },
  };
}
