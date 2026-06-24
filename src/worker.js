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

    // Routing for POST /say
    if (url.pathname === '/say') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      try {
        const body = await request.json();
        const { user, text } = body || {};

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
