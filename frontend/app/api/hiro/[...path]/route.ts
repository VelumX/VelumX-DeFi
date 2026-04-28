/**
 * Hiro API proxy — injects HIRO_API_KEY server-side.
 * Gives us 900 RPM instead of the anonymous ~50 RPM limit.
 *
 * Usage from the browser: /api/hiro/v2/contracts/interface/ADDR/NAME
 * Proxies to:             https://api.mainnet.hiro.so/v2/contracts/interface/ADDR/NAME
 */

const HIRO_BASE = 'https://api.mainnet.hiro.so';
const HIRO_API_KEY = process.env.HIRO_API_KEY;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = new URL(req.url);
  const hiroUrl = `${HIRO_BASE}/${path.join('/')}${url.search}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (HIRO_API_KEY) headers['x-api-key'] = HIRO_API_KEY;

  const res = await fetch(hiroUrl, { headers, next: { revalidate: 0 } });
  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = new URL(req.url);
  const hiroUrl = `${HIRO_BASE}/${path.join('/')}${url.search}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (HIRO_API_KEY) headers['x-api-key'] = HIRO_API_KEY;

  const body = await req.text();
  const res = await fetch(hiroUrl, { method: 'POST', headers, body, next: { revalidate: 0 } });
  const resBody = await res.text();

  return new Response(resBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
