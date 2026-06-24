// Regex to match ANSI escape sequences (control codes, color formatting, etc.)
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Sanitizes input strings by stripping out all ANSI escape sequences to prevent terminal XSS.
 * @param {string} str
 * @returns {string}
 */
function sanitizeAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(ansiRegex, '');
}

/**
 * Periodically polls the D1 database for new messages and writes them to the SSE stream.
 * This ensures multi-isolate reliability since Cloudflare Workers are stateless.
 * @param {WritableStreamDefaultWriter} writer
 * @param {Object} env
 * @param {Request} request
 */
async function pollAndStream(writer, env, request) {
  const encoder = new TextEncoder();
  try {
    const initialResult = await env.DB.prepare('SELECT MAX(id) as maxId FROM messages').first();
    let lastSeenId = initialResult?.maxId || 0;

    // Send initial handshake
    await writer.write(encoder.encode(': ok\n\n'));

    while (!request.signal.aborted) {
      const { results } = await env.DB.prepare(
        'SELECT id, username, content, created_at FROM messages WHERE id > ? ORDER BY id ASC'
      )
        .bind(lastSeenId)
        .all();

      if (results && results.length > 0) {
        for (const msg of results) {
          const payload = JSON.stringify({
            username: msg.username,
            content: msg.content,
            created_at: msg.created_at,
          });
          await writer.write(encoder.encode(`data: ${payload}\n\n`));
          lastSeenId = msg.id;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error('SSE Stream error:', err);
  } finally {
    try {
      await writer.close();
    } catch (_) {}
  }
}

async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

const SESSION_SECRET_FALLBACK = 'hacker-lobby-secret-key-change-me';

async function generateToken(alias, secret) {
  const keySecret = secret || SESSION_SECRET_FALLBACK;
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const message = `${alias}:${expiry}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keySecret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );
  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${message}:${sigHex}`;
}

async function verifyToken(token, secret) {
  if (!token) return null;
  const keySecret = secret || SESSION_SECRET_FALLBACK;
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [alias, expiryStr, sigHex] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (expiry < Date.now()) return null; // Expired

    const message = `${alias}:${expiryStr}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keySecret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Convert hex signature back to bytes
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(message)
    );
    return isValid ? alias : null;
  } catch (e) {
    return null;
  }
}

const BUCKET_CAPACITY = 5.0;
const REFILL_RATE_PER_MS = 1.0 / 1500.0; // 1 token every 1.5 seconds

async function isRateLimited(ip, env) {
  if (!env.DB) return false;
  const now = Date.now();
  try {
    const record = await env.DB.prepare(
      'SELECT last_request_time, tokens FROM rate_limits WHERE ip = ?'
    )
      .bind(ip)
      .first();

    if (!record) {
      const initialTokens = BUCKET_CAPACITY - 1.0;
      await env.DB.prepare(
        'INSERT INTO rate_limits (ip, last_request_time, tokens) VALUES (?, ?, ?)'
      )
        .bind(ip, now, initialTokens)
        .run();
      return false;
    }

    const lastRequestTime = record.last_request_time;
    const oldTokens = record.tokens;
    const elapsed = now - lastRequestTime;
    let tokens = oldTokens + elapsed * REFILL_RATE_PER_MS;
    if (tokens > BUCKET_CAPACITY) {
      tokens = BUCKET_CAPACITY;
    }

    if (tokens >= 1.0) {
      const nextTokens = tokens - 1.0;
      await env.DB.prepare(
        'UPDATE rate_limits SET last_request_time = ?, tokens = ? WHERE ip = ?'
      )
        .bind(now, nextTokens, ip)
        .run();
      return false;
    } else {
      return true;
    }
  } catch (err) {
    console.error('Rate limit error:', err);
    return false;
  }
}

export default {
  /**
   * Fetch handler for Cloudflare Worker.
   * @param {Request} request
   * @param {Object} env
   * @param {Object} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Helper for structured JSON responses
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    };

    // Handle OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Routing for GET /listen
    if (url.pathname === '/listen') {
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // Start the D1 polling loop in the background, keeping it alive with ctx.waitUntil
      ctx.waitUntil(pollAndStream(writer, env, request));

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      });
    }

    // Routing for POST /alias/check
    if (url.pathname === '/alias/check') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }
      try {
        const body = await request.json();
        const { alias } = body || {};
        if (!alias || typeof alias !== 'string' || !alias.trim()) {
          return jsonResponse({ error: 'Missing or invalid "alias" parameter' }, 400);
        }
        const cleanAlias = sanitizeAnsi(alias.trim());
        
        // Ensure database binding exists
        if (!env.DB) {
          return jsonResponse({ error: 'Database binding "DB" is not configured' }, 500);
        }

        const existing = await env.DB.prepare(
          'SELECT alias FROM aliases WHERE alias = ?'
        )
          .bind(cleanAlias)
          .first();
          
        return jsonResponse({ locked: !!existing });
      } catch (err) {
        return jsonResponse({ error: `Bad Request: ${err.message}` }, 400);
      }
    }

    // Routing for POST /alias/register
    if (url.pathname === '/alias/register') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }
      try {
        const body = await request.json();
        const { alias, password } = body || {};
        if (!alias || typeof alias !== 'string' || !alias.trim()) {
          return jsonResponse({ error: 'Missing or invalid "alias" parameter' }, 400);
        }
        if (!password || typeof password !== 'string' || !password.trim()) {
          return jsonResponse({ error: 'Missing or invalid "password" parameter' }, 400);
        }
        const cleanAlias = sanitizeAnsi(alias.trim());
        
        // Ensure database binding exists
        if (!env.DB) {
          return jsonResponse({ error: 'Database binding "DB" is not configured' }, 500);
        }

        // Check if already registered
        const existing = await env.DB.prepare(
          'SELECT alias FROM aliases WHERE alias = ?'
        )
          .bind(cleanAlias)
          .first();
          
        if (existing) {
          return jsonResponse({ error: 'Alias is already locked' }, 400);
        }
        
        const passwordHash = await hashPassword(password);
        
        await env.DB.prepare(
          'INSERT INTO aliases (alias, password_hash) VALUES (?, ?)'
        )
          .bind(cleanAlias, passwordHash)
          .run();
          
        const secret = env.SESSION_SECRET || env.JWT_SECRET;
        const token = await generateToken(cleanAlias, secret);
        
        return jsonResponse({ success: true, token }, 201);
      } catch (err) {
        return jsonResponse({ error: `Bad Request: ${err.message}` }, 400);
      }
    }

    // Routing for POST /alias/verify
    if (url.pathname === '/alias/verify') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }
      try {
        const body = await request.json();
        const { alias, password } = body || {};
        if (!alias || typeof alias !== 'string' || !alias.trim()) {
          return jsonResponse({ error: 'Missing or invalid "alias" parameter' }, 400);
        }
        if (!password || typeof password !== 'string' || !password.trim()) {
          return jsonResponse({ error: 'Missing or invalid "password" parameter' }, 400);
        }
        const cleanAlias = sanitizeAnsi(alias.trim());
        
        // Ensure database binding exists
        if (!env.DB) {
          return jsonResponse({ error: 'Database binding "DB" is not configured' }, 500);
        }

        const record = await env.DB.prepare(
          'SELECT password_hash FROM aliases WHERE alias = ?'
        )
          .bind(cleanAlias)
          .first();
          
        if (!record) {
          return jsonResponse({ error: 'Alias is not locked/registered' }, 404);
        }
        
        const passwordHash = await hashPassword(password);
        if (record.password_hash !== passwordHash) {
          return jsonResponse({ error: 'Invalid password' }, 401);
        }
        
        const secret = env.SESSION_SECRET || env.JWT_SECRET;
        const token = await generateToken(cleanAlias, secret);
        
        return jsonResponse({ success: true, token });
      } catch (err) {
        return jsonResponse({ error: `Bad Request: ${err.message}` }, 400);
      }
    }

    // Routing for POST /say
    if (url.pathname === '/say') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      try {
        const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
        const isLimited = await isRateLimited(ip, env);
        if (isLimited) {
          return jsonResponse({ error: 'Rate limit exceeded. Please wait before sending more messages.' }, 429);
        }

        const body = await request.json();
        const { user, text, token } = body || {};

        // Validation: parameters must exist, be strings, and not be empty
        if (!user || typeof user !== 'string' || !user.trim()) {
          return jsonResponse({ error: 'Missing or invalid "user" parameter' }, 400);
        }

        if (!text || typeof text !== 'string' || !text.trim()) {
          return jsonResponse({ error: 'Missing or invalid "text" parameter' }, 400);
        }

        // Sanitize username and content of ANSI escape sequences to prevent terminal XSS
        const sanitizedUser = sanitizeAnsi(user);
        const sanitizedText = sanitizeAnsi(text);

        // Ensure database binding exists
        if (!env.DB) {
          return jsonResponse({ error: 'Database binding "DB" is not configured' }, 500);
        }

        // Authentication check: if alias is locked, verify token
        const record = await env.DB.prepare(
          'SELECT alias FROM aliases WHERE alias = ?'
        )
          .bind(sanitizedUser)
          .first();

        if (record) {
          const secret = env.SESSION_SECRET || env.JWT_SECRET;
          const verifiedAlias = await verifyToken(token, secret);
          if (!verifiedAlias || verifiedAlias !== sanitizedUser) {
            return jsonResponse({ error: 'Unauthorized: This alias is locked and requires a valid session token' }, 401);
          }
        }

        // Insert into D1 messages table safely using parameterized bindings
        await env.DB.prepare(
          'INSERT INTO messages (username, content) VALUES (?, ?)'
        )
          .bind(sanitizedUser, sanitizedText)
          .run();

        return jsonResponse({
          success: true,
          message: 'Message sent successfully',
          data: {
            username: sanitizedUser,
            content: sanitizedText,
          },
        }, 201);

      } catch (err) {
        return jsonResponse({ error: `Bad Request: ${err.message}` }, 400);
      }
    }

    // Default route
    return jsonResponse({ error: 'Not Found' }, 404);
  },

  /**
   * Cron Trigger handler for database cleanup.
   * Runs at the top of every hour.
   * Deletes messages older than 6 hours.
   * @param {Object} event
   * @param {Object} env
   * @param {Object} ctx
   */
  async scheduled(event, env, ctx) {
    if (!env.DB) {
      console.error('[Cron Trigger] Database binding "DB" is not configured');
      return;
    }

    try {
      const result = await env.DB.prepare(
        "DELETE FROM messages WHERE created_at < datetime('now', '-6 hours')"
      ).run();
      console.log(`[Cron Trigger] Cleanup complete. Deleted rows: ${result.meta.changes || 0}`);
    } catch (err) {
      console.error('[Cron Trigger] Failed to delete old messages:', err);
    }
  },
};
