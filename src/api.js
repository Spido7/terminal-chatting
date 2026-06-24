const API_URL = process.env.API_URL || 'https://hacker-lobby-backend.spidozx.workers.dev';

/**
 * Connects to the SSE stream at /listen and parses incoming messages in real-time.
 * @param {Function} onMessageCallback - Invoked with parsed message JSON payload.
 * @param {AbortSignal} [signal] - Optional signal to abort/disconnect the connection.
 */
export async function connectToStream(onMessageCallback, signal) {
  const url = `${API_URL}/listen`;

  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to connect to stream: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported or empty body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');

      // The last line may be incomplete, hold it in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            onMessageCallback(data);
          } catch (e) {
            // Ignore malformed JSON or SSE control lines
          }
        }
      }
    }
  } catch (err) {
    // Suppress error if aborted intentionally
    if (err.name === 'AbortError' || (signal && signal.aborted)) {
      return;
    }
    throw err;
  }
}

/**
 * Sends a message to the edge server POST /say endpoint.
 * @param {string} user - Username of the sender.
 * @param {string} text - Message text content.
 * @returns {Promise<Object>} Response JSON.
 */
export async function sendMessage(user, text) {
  const url = `${API_URL}/say`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user, text }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
  }

  return response.json();
}
