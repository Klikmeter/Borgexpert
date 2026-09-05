import { z } from 'zod';

const txt = (max) => z.string().trim().max(max).default('');
const keuze = (...v) => z.enum(v).or(z.literal('')).default('');
const jaNeeWeet = keuze('ja', 'nee', 'weet');

export const aanvraagSchema = z.object({
  rol: z.enum(['particulier', 'aannemer', 'anders']),
  naam: z.string().trim().min(2, 'Vul je naam in.').max(120),
  bedrijf: txt(160),
  telefoon: z.string().trim().max(40).refine((v) => v.replace(/\D/g, '').length >= 9, 'Vul een geldig telefoonnummer in.'),
  email: z.string().trim().toLowerCase().max(200).email('Vul een geldig e-mailadres in.'),
  adres: z.string().trim().min(3, 'Vul het adres van het project in.').max(240),
  stil: z.string().trim().max(6).regex(/^\d*$/, 'Ongeldig aantal.').default(''),
  korte: txt(300),
  dso: z.enum(['ja', 'nee', 'weet']),
  dsodatum: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Ongeldige datum.').default(''),
  vergunning: jaNeeWeet,
  borger: txt(160),
  borgeranders: txt(160),
  gemeente: keuze('ja', 'nee'),
  type: keuze('Nieuwbouw woning', 'Bedrijfsgebouw', 'Anders'),
  fase: z.string().regex(/^[0-8]$/, 'Tik de fase aan waar je nu staat.'),
  fundbeton: keuze('ja', 'nee'),
  verdbeton: keuze('ja', 'nee'),
  wanneer: keuze('Zo snel mogelijk', 'Binnen 2 weken', 'Later'),
  rapport: jaNeeWeet,
  plan: jaNeeWeet,
  toelichting: txt(4000),
  bron: txt(120),
  website: txt(500), // honeypot: moet leeg blijven
  turnstile: txt(4000),
}).strict();

/** Geeft {ok, data} of {ok:false, fout} met één leesbare Nederlandse melding. */
export function valideer(body) {
  const r = aanvraagSchema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  const eerste = r.error.issues[0];
  const fout = eerste && !/^(Invalid|Required|Expected|String must)/.test(eerste.message)
    ? eerste.message
    : 'Controleer je invoer: ' + (eerste?.path?.join('.') || 'onbekend veld') + '.';
  return { ok: false, fout };
}
