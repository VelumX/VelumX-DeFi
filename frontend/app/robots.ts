import { MetadataRoute } from 'next';

const APP_URL = 'https://app.velumx.xyz';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/swap', '/bridge', '/earn'],
        disallow: ['/history', '/api/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
