// Cloudflare Pages Function: GET /api/page?url=<product page>
// Fetches a public product page for "Add from link" in the Parts Library (a browser page can't read other sites itself).
// Only http(s) pages, text only, size and time limited, and only for requests from HangarLab's own pages.
const MAX = 3 * 1024 * 1024;

export async function onRequestGet({ request }) {
  const self = new URL(request.url);
  const from = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (from && new URL(from).host !== self.host) return new Response('Forbidden', { status: 403 });
  let target;
  try { target = new URL(self.searchParams.get('url') || ''); } catch (e) { return new Response('Bad url', { status: 400 }); }
  if (!/^https?:$/.test(target.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(target.hostname)) return new Response('Bad url', { status: 400 });
  let res;
  try {
    res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HangarLab parts lookup)', Accept: 'text/html,application/xhtml+xml,text/plain' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { return new Response('Could not reach that page', { status: 502 }); }
  if (!res.ok) return new Response(`The shop answered ${res.status}`, { status: 502 });
  if (!/text|html|xml/i.test(res.headers.get('Content-Type') || '')) return new Response('Not a web page', { status: 415 });
  const body = await res.text();
  return new Response(body.slice(0, MAX), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=600' } });
}
