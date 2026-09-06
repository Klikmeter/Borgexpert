// Alle instellingen komen uit environment variables (Railway: service variables).
const bool = (v, def) => (v === undefined || v === '' ? def : /^(1|true|yes|ja)$/i.test(v));

export function loadConfig(env = process.env) {
  const appUrl = (env.APP_URL || '').replace(/\/+$/, '');
  return {
    port: Number(env.PORT || 8080),
    host: env.HOST || '::',
    appUrl,
    canonicalHost: appUrl ? new URL(appUrl).host : '',
    canonicalRedirect: bool(env.CANONICAL_REDIRECT, false),
    trustProxy: bool(env.TRUST_PROXY, true),
    databaseUrl: env.DATABASE_URL || '',
    resendApiKey: env.RESEND_API_KEY || '',
    resendApiUrl: env.RESEND_API_URL || 'https://api.resend.com/emails', // alleen voor tests

    emailFrom: env.EMAIL_FROM || 'Borg Expert <aanvraag@borgexpert.online>',
    emailTo: env.EMAIL_TO || 'info@borgexpert.nl',
    // Optioneel: extra ontvangers van de aanvraagmail als blinde kopie, kommagescheiden (bijv. voor controle).
    emailBcc: (env.EMAIL_BCC || '').split(',').map((x) => x.trim()).filter(Boolean),
    confirmationEmail: bool(env.CONFIRMATION_EMAIL, true),
    // Google Analytics 4 (G-XXXX). Leeg = geen Google-tag en geen cookiebalk.
    gaMeasurementId: /^G-[A-Z0-9]{4,20}$/.test((env.GA_MEASUREMENT_ID || '').trim()) ? env.GA_MEASUREMENT_ID.trim() : '',
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY || '',
    // Alleen actief als beide sleutels er zijn; met één sleutel zou elke aanvraag geweigerd worden.
    turnstileEnabled: !!((env.TURNSTILE_SITE_KEY || '').trim() && (env.TURNSTILE_SECRET_KEY || '').trim()),
    rateLimitMax: Number(env.RATE_LIMIT_MAX || 5),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60_000,
    retryIntervalMs: Number(env.MAIL_RETRY_INTERVAL_MINUTES || 5) * 60_000,
    phone: '(085) 760 72 78',
    phoneHref: 'tel:+31857607278',
    whatsapp: '06 86 80 00 95',
    whatsappHref: 'https://wa.me/31686800095',
  };
}
