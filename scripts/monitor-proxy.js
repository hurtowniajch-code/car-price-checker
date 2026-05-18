/**
 * Daily proxy health check.
 * Runs via cron, sends email alert if proxy is broken/out of traffic.
 */

const { ProxyAgent } = require('undici');
const nodemailer = require('nodemailer');

const PROXY_URL   = process.env.PROXY_URL;
const PROXY_USER  = process.env.PROXY_USER;
const PROXY_PASS  = process.env.PROXY_PASS;
const GMAIL_USER  = process.env.GMAIL_USER;
const GMAIL_PASS  = process.env.GMAIL_PASS;
const ALERT_EMAIL = 'hurtowniajch@gmail.com';

// Test URL — simple public page, not Otomoto (to avoid bot detection skewing the result)
const TEST_URL = 'https://httpbin.org/ip';

async function testProxy() {
  if (!PROXY_URL || !PROXY_USER || !PROXY_PASS) {
    return { ok: false, error: 'Proxy env vars missing (PROXY_URL / PROXY_USER / PROXY_PASS)' };
  }

  const bare = PROXY_URL.replace(/^https?:\/\//, '');
  const fullProxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${bare}`;

  try {
    const dispatcher = new ProxyAgent(fullProxyUrl);
    const res = await fetch(TEST_URL, {
      dispatcher,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} from test URL` };
    }

    const body = await res.json();
    return { ok: true, ip: body.origin };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sendAlert(error) {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.error('[Monitor] GMAIL_USER / GMAIL_PASS not set — cannot send email');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  await transporter.sendMail({
    from: GMAIL_USER,
    to: ALERT_EMAIL,
    subject: '⚠️ ileoto.pl — proxy nie działa',
    text: [
      'Codzienny test proxy zakończył się błędem.',
      '',
      `Błąd: ${error}`,
      '',
      `Proxy: ${PROXY_URL}`,
      `Użytkownik: ${PROXY_USER}`,
      '',
      'Sprawdź saldo w panelu IPRoyal: https://iproyal.com/dashboard',
      '',
      `Czas: ${new Date().toISOString()}`,
    ].join('\n'),
  });

  console.log('[Monitor] Alert email sent to', ALERT_EMAIL);
}

(async () => {
  console.log(`[Monitor] Testing proxy at ${new Date().toISOString()}`);
  const result = await testProxy();

  if (result.ok) {
    console.log(`[Monitor] Proxy OK — exit IP: ${result.ip}`);
  } else {
    console.error(`[Monitor] Proxy FAILED — ${result.error}`);
    await sendAlert(result.error);
    process.exit(1);
  }
})();
