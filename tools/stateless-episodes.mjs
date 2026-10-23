const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}

async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function episodeId(url, secret) {
  const payload = encode(encoder.encode(url));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`lb1.${payload}`));
  return `lb1.${payload}.${encode(new Uint8Array(signature))}`;
}

async function episodeUrl(id, secret) {
  if (id.length > 12000) throw new Error('ID too long');
  const [version, payload, signature, extra] = id.split('.');
  if (version !== 'lb1' || !payload || !signature || extra !== undefined) throw new Error('Invalid ID');
  const valid = await crypto.subtle.verify('HMAC', await key(secret), decode(signature), encoder.encode(`lb1.${payload}`));
  if (!valid) throw new Error('Invalid signature');
  return decoder.decode(decode(payload));
}

// The upstream's incrementing IDs live in memory. Workers can serve search and
// comments in different isolates, so carry the signed source URL in the ID.
// This deliberately needs no Redis account or persistent Cloudflare binding.
export function withStatelessEpisodes(upstream, resolveUrl = () => null) {
  return {
    ...upstream,
    async fetch(request, env, ctx) {
      const secret = env.TOKEN;
      if (!secret) return new Response('Missing service access token', { status: 503 });
      const url = new URL(request.url);
      const comment = url.pathname.match(/\/api\/v2\/comment\/(lb1\.[^/]+)$/);
      if (request.method === 'GET' && comment) {
        try {
          const source = await episodeUrl(comment[1], secret);
          url.pathname = url.pathname.slice(0, -comment[1].length - 1);
          url.searchParams.set('url', source);
          request = new Request(url, request);
        } catch {
          return Response.json({ success: false, errorCode: 404, errorMessage: 'Invalid episode ID', comments: [] }, { status: 404 });
        }
      }
      const response = await upstream.fetch(request, env, ctx);
      if (!response.ok || !/\/api\/v2\/(?:search\/episodes|bangumi(?:\/|$)|match$)/.test(url.pathname) ||
          !response.headers.get('content-type')?.includes('json')) return response;
      const data = await response.json();
      async function rewrite(value) {
        if (!value || typeof value !== 'object') return;
        if (value.episodeId !== undefined) {
          const source = value.url || resolveUrl(value.episodeId);
          if (typeof source === 'string' && source.length > 0 && source.length < 8000) {
            value.episodeId = await episodeId(source, secret);
          }
        }
        await Promise.all(Object.values(value).filter(v => v && typeof v === 'object').map(rewrite));
      }
      await rewrite(data);
      const headers = new Headers(response.headers);
      for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
      return new Response(JSON.stringify(data), { status: response.status, headers });
    },
  };
}
