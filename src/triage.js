// Zelfde logica als op de pagina, zodat de mail en de database de uitkomst niet van de browser hoeven te vertrouwen.
export const FASE = [
  'Nog niet begonnen', 'Grondwerk gereed', 'Fundering aangelegd', 'Begane grondvloer gelegd', 'Verdiepingsvloer',
  'Ruwbouw en dak staan', 'Wind- en waterdicht', 'Afbouw en installaties', 'Gereed, wacht op gereedmelding',
];

export const TRIAGE_LABEL = { ok: 'Direct overneembaar', warn: 'Overname met dossiercheck', crit: 'Eerst beoordeling nodig' };

export function triage(d) {
  const f = Number(d.fase);
  const hidden = (f === 2 && d.fundbeton === 'ja') || (f === 4 && d.verdbeton !== 'nee') || f >= 3;
  if (!hidden) return 'ok';
  if (d.rapport === 'ja') return 'warn';
  return 'crit';
}

export function faseLabel(d) {
  const f = Number(d.fase);
  let s = FASE[f] || String(d.fase);
  if (f === 2) s += d.fundbeton === 'ja' ? ', beton gestort' : ', beton nog niet gestort';
  if (f === 4) s += d.verdbeton === 'nee' ? ', nog niet gestort' : ', gestort';
  return s;
}
