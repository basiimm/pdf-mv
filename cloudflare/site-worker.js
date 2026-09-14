import manifest from './engine-manifest.json';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const entry = manifest[url.pathname];
    if (!entry) return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
      ETag: entry.etag,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.headers.get('If-None-Match') === entry.etag)
      return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers });
    // Pull one chunk at a time with backpressure. Never buffer the full engine.
    let part = 0;
    let reader;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            if (!reader) {
              if (part === entry.parts.length) {
                controller.close();
                return;
              }
              const response = await env.ASSETS.fetch(
                new URL(entry.parts[part++], url)
              );
              if (!response.ok || !response.body)
                throw new Error('Engine chunk unavailable');
              reader = response.body.getReader();
            }
            const next = await reader.read();
            if (next.done) {
              reader.releaseLock();
              reader = undefined;
              continue;
            }
            controller.enqueue(next.value);
            return;
          }
        } catch (error) {
          console.error('Engine streaming failed', error);
          controller.error(error);
        }
      },
      async cancel() {
        await reader?.cancel();
      },
    });
    return new Response(body, { headers });
  },
};
