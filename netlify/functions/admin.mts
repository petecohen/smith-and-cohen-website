import type { Config } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

const COOKIE = 'sc_admin';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode('smith-and-cohen-admin-session')
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

async function isAuthed(req: Request, password: string): Promise<boolean> {
  const cookie = getCookie(req, COOKIE);
  if (!cookie) return false;
  return cookie === (await sessionToken(password));
}

export default async (req: Request) => {
  const password = Netlify.env.get('ADMIN_PASSWORD');
  const databaseUrl = Netlify.env.get('DATABASE_URL');
  if (!password || !databaseUrl) return json({ error: 'Not configured' }, 500);

  const url = new URL(req.url);
  const route = url.pathname.replace(/\/$/, '');

  // Only mark the cookie Secure over real HTTPS — otherwise Safari drops it
  // on http://localhost during local dev, making login silently fail.
  const isHttps =
    req.headers.get('x-forwarded-proto') === 'https' || url.protocol === 'https:';
  const secureAttr = isHttps ? '; Secure' : '';

  if (route === '/api/admin/login' && req.method === 'POST') {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (typeof payload.password !== 'string' || payload.password !== password) {
      return json({ error: 'Wrong password' }, 401);
    }
    const token = await sessionToken(password);
    return json({ ok: true }, 200, {
      'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secureAttr}; Max-Age=${COOKIE_MAX_AGE}`,
    });
  }

  if (route === '/api/admin/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, {
      'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secureAttr}; Max-Age=0`,
    });
  }

  // Everything below requires a valid session
  if (!(await isAuthed(req, password))) {
    return json({ error: 'Not authorised' }, 401);
  }

  const sql = neon(databaseUrl);

  if (route === '/api/admin/messages' && req.method === 'GET') {
    const rows = await sql`
      select id, scope, name, body, created_at, hidden
      from messages
      order by created_at desc
      limit 500
    `;
    return json({ messages: rows });
  }

  if (route === '/api/admin/action' && req.method === 'POST') {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const id = Number(payload.id);
    const action = payload.action;
    if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid id' }, 400);

    if (action === 'hide') {
      await sql`update messages set hidden = true where id = ${id}`;
    } else if (action === 'unhide') {
      await sql`update messages set hidden = false where id = ${id}`;
    } else if (action === 'delete') {
      await sql`delete from messages where id = ${id}`;
    } else {
      return json({ error: 'Invalid action' }, 400);
    }
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
};

export const config: Config = {
  path: '/api/admin/*',
};
