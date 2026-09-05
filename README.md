# Borg Expert Bouwstop, aanvraagpagina

Tijdelijke landingspagina op **www.borgexpert.online** waar mensen een bouwstop-aanvraag indienen. Elke aanvraag wordt
opgeslagen in Postgres en gemaild naar info@borgexpert.nl. De aanvrager krijgt een bevestiging met referentie en WhatsApp-knop.
Staat los van de bestaande site op borgexpert.nl.

```
public/index.html   de pagina (wizard in drie stappen, plan van aanpak na indienen)
public/fonts/       Raleway en Roboto Slab, lokaal (geen Google Fonts)
src/server.js       start: schema aanmaken, HTTP-server, retry-lus voor mails
src/app.js          routes: GET /, POST /api/aanvraag, /health, statische bestanden
src/validate.js     server-side validatie (zod), zelfde regels als de pagina
src/triage.js       triage en fase-label, zelfde logica als de pagina
src/db.js           schema + queries (tabel aanvragen)
src/mail.js         interne mail, bevestigingsmail, Resend-client
test/               node:test, draait zonder database (`npm test`)
```

## Hoe een aanvraag verloopt

1. De pagina valideert en stuurt JSON naar `POST /api/aanvraag`.
2. De server controleert herkomst (Origin), rate limit per IP, honeypot, Turnstile en de invoer.
3. De aanvraag wordt eerst in Postgres opgeslagen, met een referentie als `BE-2609-K7X2P`.
4. Daarna gaan twee mails via Resend: naar de inbox (Reply-To is de aanvrager) en de bevestiging naar de aanvrager.
5. Mislukt een mail, dan staat de aanvraag er toch. Een retry-lus probeert het elke vijf minuten opnieuw (max. acht keer).

## Live zetten op Railway

**1. Service aanmaken**
- New Project > Deploy from GitHub repo > `Klikmeter/borgexpert`, branch `main`. Railway pakt de Dockerfile en `railway.json` uit de root.

**2. Postgres**
- In hetzelfde project: New > Database > PostgreSQL.
- Op de web-service: Variables > New Variable > Add Reference > `DATABASE_URL` van de Postgres-service.
- De tabel `aanvragen` wordt bij de eerste start automatisch aangemaakt.

**3. Variabelen** (zie `.env.example`)

| Variabele | Waarde |
|---|---|
| `DATABASE_URL` | reference naar Postgres |
| `RESEND_API_KEY` | uit resend.com > API Keys (permission "Sending access") |
| `EMAIL_FROM` | `Borg Expert <aanvraag@borgexpert.online>` |
| `EMAIL_TO` | `info@borgexpert.nl` |
| `APP_URL` | `https://www.borgexpert.online` |
| `CANONICAL_REDIRECT` | `false` tot het domein werkt, daarna `true` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | uit Cloudflare Turnstile, zie stap 5 |

Zonder `RESEND_API_KEY` draait alles, maar blijven de mails in de wachtrij tot de key er is.

**4. Resend**
- resend.com > Domains > Add Domain > `borgexpert.online`.
- Zet de DNS-records die Resend toont (DKIM TXT, plus MX en TXT voor SPF op het `send`-subdomein) bij de registrar van borgexpert.online. Verificatie duurt meestal enkele minuten.
- Maak een API key aan en zet die als `RESEND_API_KEY`.
- Stuur een testaanvraag en markeer de afzender in de mailbox van info@borgexpert.nl als veilig. Een nieuw domein belandt de eerste keren soms in spam.

**5. Turnstile (botcontrole, gratis)**
- dash.cloudflare.com > Turnstile > Add widget. Hostname `www.borgexpert.online` (en het `*.up.railway.app`-adres als je daar wilt testen). Widget mode: Managed.
- Zet site key en secret key als variabelen. De widget verschijnt onder de toelichting in stap 3.

**6. Domein**
- Service > Settings > Networking > Custom Domain > `www.borgexpert.online`. Railway toont een CNAME; zet die bij de registrar.
- Voor het kale `borgexpert.online`: ook als custom domain toevoegen (Railway geeft dan een record voor de apex) of bij de registrar een redirect naar www instellen.
- Zodra het werkt: `CANONICAL_REDIRECT=true`, dan gaat het Railway-adres door naar het echte domein.

**7. Controleren**
- `https://www.borgexpert.online/health` geeft `{"ok":true}` als de database bereikbaar is.
- Dien een aanvraag in, kijk in Railway > Postgres > Data > `aanvragen`, en in de inbox.

## Leads bekijken

Railway > Postgres-service > Data > tabel `aanvragen`. Handige query in de Query-tab:

```sql
SELECT ref, aangemaakt_op, triage, naam, telefoon, email, adres, fase_label, wanneer,
       mail_verzonden_op IS NOT NULL AS gemaild, mail_fout
FROM aanvragen ORDER BY aangemaakt_op DESC;
```

Kolom `status` staat standaard op `nieuw` en is vrij te gebruiken (bijv. `gebeld`, `klant`, `afgewezen`).

## Lokaal draaien

```bash
npm install
npm test
DATABASE_URL=postgres://... RESEND_API_KEY= APP_URL=http://localhost:8080 node src/server.js
```

Zonder Resend-key worden mails niet verstuurd maar wel gelogd als openstaand; de aanvraag staat gewoon in de database.

## Nog aan te vullen op de pagina

- TloKB-registratienummer en de naam van het instrument en de aanbieder (blauw gemarkeerd in "Hoe weet je dat wij niet de volgende zijn?").
- De link "Privacyverklaring" onder het formulier wijst nu naar de homepage van borgexpert.nl.
- `<meta name="robots" content="noindex">` staat aan. Weghalen als de pagina gevonden moet worden via Google.
