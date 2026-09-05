// Uploads: alleen PDF, JPG en PNG, gecontroleerd op de eerste bytes en niet alleen op de extensie.
export const MAX_PER_BESTAND = 10 * 1024 * 1024;
export const MAX_TOTAAL = 15 * 1024 * 1024;
export const SOORTEN = { bouwmelding_doc: 'bouwmelding', vergunning_doc: 'omgevingsvergunning' };

function mimeVanInhoud(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  return null;
}

export function veiligeNaam(naam, mime) {
  const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mime];
  let n = String(naam || '').split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100);
  n = n.replace(/\.(pdf|jpe?g|png)$/i, '');
  return (n || 'bijlage') + ext;
}

/**
 * Leest de bestanden uit een multipart-body. Geeft {ok, bijlagen:[{soort, bestandsnaam, mime, grootte, inhoud}]} of {ok:false, fout}.
 * `body` is het resultaat van c.req.parseBody(): tekstvelden als string, bestanden als File.
 */
export async function leesBijlagen(body) {
  const bijlagen = [];
  let totaal = 0;
  for (const [veld, soort] of Object.entries(SOORTEN)) {
    const f = body[veld];
    if (f === undefined || f === '' || f === null) continue;
    if (typeof f === 'string' || typeof f.arrayBuffer !== 'function') return { ok: false, fout: 'Ongeldige bijlage.' };
    if (f.size === 0) continue;
    if (f.size > MAX_PER_BESTAND) return { ok: false, fout: `Het bestand "${f.name}" is groter dan 10 MB. Verklein het of stuur het later na.` };
    totaal += f.size;
    if (totaal > MAX_TOTAAL) return { ok: false, fout: 'De bijlagen zijn samen groter dan 15 MB. Verklein ze of stuur er één later na.' };
    const inhoud = Buffer.from(await f.arrayBuffer());
    const mime = mimeVanInhoud(inhoud);
    if (!mime) return { ok: false, fout: `Het bestand "${f.name}" is geen PDF, JPG of PNG.` };
    bijlagen.push({ soort, bestandsnaam: veiligeNaam(f.name, mime), mime, grootte: inhoud.length, inhoud });
  }
  return { ok: true, bijlagen };
}
