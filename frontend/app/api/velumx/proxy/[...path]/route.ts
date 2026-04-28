import { NextRequest, NextResponse } from 'next/server';

const getRelayerConfig = () => ({
  relayerUrl: process.env.VELUMX_RELAYER_URL || 'https://api.velumx.xyz',
  apiKey: process.env.VELUMX_API_KEY,
});

/** Safely parse response — returns text as error if not JSON */
async function safeJson(response: Response): Promise<{ data: any; ok: boolean }> {
  const text = await response.text();
  try {
    return { data: JSON.parse(text), ok: response.ok };
  } catch {
    // Upstream returned non-JSON (e.g. "upstream connect error")
    console.error('VelumX Proxy: upstream returned non-JSON:', text.slice(0, 200));
    return {
      data: { error: `Relayer unavailable: ${text.slice(0, 100)}` },
      ok: false
    };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const { relayerUrl, apiKey } = getRelayerConfig();

  if (!apiKey) {
    return NextResponse.json({ error: 'Relayer configuration error: VELUMX_API_KEY not set' }, { status: 500 });
  }

  const targetUrl = `${relayerUrl}/api/v1/${path}`;

  try {
    const body = await req.json();
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const { data, ok } = await safeJson(response);
    return NextResponse.json(data, { status: ok ? response.status : 503 });
  } catch (error: any) {
    console.error(`VelumX Proxy POST Error (${path}):`, error);
    return NextResponse.json(
      { error: `Relayer unreachable: ${error?.message || 'unknown error'}` },
      { status: 503 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const { relayerUrl, apiKey } = getRelayerConfig();

  if (!apiKey) {
    return NextResponse.json({ error: 'Relayer configuration error: VELUMX_API_KEY not set' }, { status: 500 });
  }

  const targetUrl = `${relayerUrl}/api/v1/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
      cache: 'no-store', // never cache — policy changes must reflect immediately
    });

    const { data, ok } = await safeJson(response);
    return NextResponse.json(data, { status: ok ? response.status : 503 });
  } catch (error: any) {
    console.error(`VelumX Proxy GET Error (${path}):`, error);
    return NextResponse.json(
      { error: `Relayer unreachable: ${error?.message || 'unknown error'}` },
      { status: 503 }
    );
  }
}
