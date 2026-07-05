import type { Context, Config } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

const SCOPE_RE = /^[a-z0-9-]{1,80}$/;
const NAME_MAX = 40;
const BODY_MAX = 1000;
const LIST_LIMIT = 200;
// Sliding-window rate limits per hashed IP
const LIMIT_PER_MINUTE = 5;
const LIMIT_PER_HOUR = 30;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Fire-and-forget Telegram notification to Pete; must never fail the post
async function notifyTelegram(scope: string, name: string, body: string, origin: string) {
  const token = Netlify.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Netlify.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;
  const where = scope === 'general' ? 'General board' : `Stream: ${scope}`;
  const text = `💬 ${where}\n${name}: ${body.slice(0, 500)}\n\nModerate: ${origin}/admin`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* notification failure is deliberately swallowed */
  }
}

async function hashIp(ip: string): Promise<string> {
  const salt = Netlify.env.get('IP_HASH_SALT') ?? 'smith-and-cohen-board';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default async (req: Request, context: Context) => {
  const databaseUrl = Netlify.env.get('DATABASE_URL');
  if (!databaseUrl) return json({ error: 'Database not configured' }, 500);
  const sql = neon(databaseUrl);

  const url = new URL(req.url);
  const scope = (url.searchParams.get('scope') ?? 'general').trim();
  if (!SCOPE_RE.test(scope)) return json({ error: 'Invalid scope' }, 400);

  if (req.method === 'GET') {
    const rows = await sql`
      select id, name, body, created_at
      from messages
      where scope = ${scope} and not hidden
      order by created_at desc
      limit ${LIST_LIMIT}
    `;
    return json({ scope, messages: rows.reverse() });
  }

  if (req.method === 'POST') {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    // Honeypot: real visitors never see or fill this field
    if (typeof payload.website === 'string' && payload.website.trim() !== '') {
      return json({ error: 'Rejected' }, 400);
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) {
      return json({ error: `Name must be 1–${NAME_MAX} characters` }, 400);
    }
    if (body.length < 1 || body.length > BODY_MAX) {
      return json({ error: `Message must be 1–${BODY_MAX} characters` }, 400);
    }

    const ip =
      context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    const ipHash = await hashIp(ip);

    const [counts] = await sql`
      select
        count(*) filter (where created_at > now() - interval '1 minute') as last_minute,
        count(*) filter (where created_at > now() - interval '1 hour') as last_hour
      from messages
      where ip_hash = ${ipHash}
    `;
    if (
      Number(counts.last_minute) >= LIMIT_PER_MINUTE ||
      Number(counts.last_hour) >= LIMIT_PER_HOUR
    ) {
      return json({ error: 'Too many messages — slow down a little' }, 429);
    }

    const [message] = await sql`
      insert into messages (scope, name, body, ip_hash)
      values (${scope}, ${name}, ${body}, ${ipHash})
      returning id, name, body, created_at
    `;
    await notifyTelegram(scope, name, body, url.origin);
    return json({ scope, message }, 201);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config: Config = {
  path: '/api/messages',
};
