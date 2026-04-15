import { NextRequest, NextResponse } from 'next/server';

/**
 * Image proxy to bypass CORS restrictions on external token icon CDNs
 * Usage: /api/image-proxy?url=<encoded_image_url>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Only allow known safe image domains
  const allowedDomains = [
    'contentful-proxy.alexgo.io',
    'images.ctfassets.net',
    'assets.coingecko.com',
    'cryptologos.cc',
    'raw.githubusercontent.com',
  ];

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!allowedDomains.some(d => parsedUrl.hostname.endsWith(d))) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'VelumX/1.0' },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}
