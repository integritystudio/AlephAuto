/**
 * Cloudflare Worker: n0ai-proxy
 *
 * Secure proxy for n0ai.app content to populate SideQuest UI
 * Fetches full HTML content and API data from the AlephAuto dashboard
 */

import type { ExecutionContext } from '@cloudflare/workers-types';

export interface Env {
  TARGET_URL: string;
  ALLOWED_ORIGINS: string;
}

// Cache settings
const HTML_CACHE_TTL = 60; // 1 minute for HTML
const API_CACHE_TTL = 30; // 30 seconds for API data

interface ProxyResponse {
  content: string;
  contentType: string;
  statusCode: number;
  cached: boolean;
  fetchedAt: string;
  targetUrl: string;
}

interface ApiStatusResponse {
  status: string;
  pipelines: Array<{
    name: string;
    status: string;
    lastRun?: string;
  }>;
  uptime?: number;
  version?: string;
}

function getCorsHeaders(origin: string, allowedOrigins: string[]): Headers {
  const headers = new Headers();

  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  headers.set('Access-Control-Max-Age', '86400');

  return headers;
}

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

async function fetchContent(url: string, acceptType: string = 'text/html'): Promise<{
  content: string;
  contentType: string;
  status: number;
}> {
  const response = await fetch(url, {
    headers: {
      'Accept': acceptType,
      'User-Agent': 'n0ai-proxy/1.0 (Cloudflare Worker)',
    },
  });

  const content = await response.text();
  const contentType = response.headers.get('Content-Type') || 'text/html';

  return {
    content,
    contentType,
    status: response.status,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    const corsHeaders = getCorsHeaders(origin, allowedOrigins);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headersToObject(corsHeaders), 'Content-Type': 'application/json' },
      });
    }

    const path = url.pathname;

    try {
      // Health check
      if (path === '/health') {
        return new Response(
          JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            targetUrl: env.TARGET_URL,
          }),
          {
            headers: { ...headersToObject(corsHeaders), 'Content-Type': 'application/json' },
          }
        );
      }

      // Root path - fetch full HTML from n0ai.app
      if (path === '/' || path === '/html') {
        const cache = await (caches as any).open('default');
        const cacheKey = new Request(`${env.TARGET_URL}/html`, request);
        let cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          const cachedData = (await cachedResponse.json()) as ProxyResponse;
          cachedData.cached = true;

          return new Response(JSON.stringify(cachedData), {
            headers: {
              ...headersToObject(corsHeaders),
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${HTML_CACHE_TTL}`,
              'X-Cache': 'HIT',
            },
          });
        }

        // Fetch fresh HTML
        const result = await fetchContent(env.TARGET_URL, 'text/html');

        const responseData: ProxyResponse = {
          content: result.content,
          contentType: result.contentType,
          statusCode: result.status,
          cached: false,
          fetchedAt: new Date().toISOString(),
          targetUrl: env.TARGET_URL,
        };

        const response = new Response(JSON.stringify(responseData), {
          headers: {
            ...headersToObject(corsHeaders),
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${HTML_CACHE_TTL}`,
            'X-Cache': 'MISS',
          },
        });

        // Store in cache
        ctx.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
      }

      // API status endpoint - proxy to n0ai.app/api/status
      if (path === '/api/status' || path === '/status') {
        const cache = await (caches as any).open('default');
        const apiUrl = `${env.TARGET_URL}/api/status`;
        const cacheKey = new Request(apiUrl, request);
        let cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          const cachedData = await cachedResponse.json();
          return new Response(JSON.stringify({ ...cachedData, cached: true }), {
            headers: {
              ...headersToObject(corsHeaders),
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
              'X-Cache': 'HIT',
            },
          });
        }

        const result = await fetchContent(apiUrl, 'application/json');

        let data: ApiStatusResponse;
        try {
          data = JSON.parse(result.content);
        } catch {
          data = { status: 'unknown', pipelines: [] };
        }

        const responseData = {
          ...data,
          cached: false,
          fetchedAt: new Date().toISOString(),
        };

        const response = new Response(JSON.stringify(responseData), {
          headers: {
            ...headersToObject(corsHeaders),
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
            'X-Cache': 'MISS',
          },
        });

        ctx.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
      }

      // Health endpoint proxy
      if (path === '/api/health' || path === '/target-health') {
        const healthUrl = `${env.TARGET_URL}/health`;
        const result = await fetchContent(healthUrl, 'application/json');

        return new Response(result.content, {
          status: result.status,
          headers: {
            ...headersToObject(corsHeaders),
            'Content-Type': 'application/json',
          },
        });
      }

      // Proxy any other path to n0ai.app
      if (path.startsWith('/proxy')) {
        const targetPath = path.replace('/proxy', '') || '/';
        const targetUrl = `${env.TARGET_URL}${targetPath}`;

        const result = await fetchContent(targetUrl);

        const responseData: ProxyResponse = {
          content: result.content,
          contentType: result.contentType,
          statusCode: result.status,
          cached: false,
          fetchedAt: new Date().toISOString(),
          targetUrl,
        };

        return new Response(JSON.stringify(responseData), {
          headers: {
            ...headersToObject(corsHeaders),
            'Content-Type': 'application/json',
          },
        });
      }

      // 404 for unknown routes
      return new Response(
        JSON.stringify({
          error: 'Not found',
          path,
          availableEndpoints: ['/', '/html', '/status', '/api/status', '/health', '/target-health', '/proxy/*'],
        }),
        {
          status: 404,
          headers: { ...headersToObject(corsHeaders), 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Worker error:', message);

      return new Response(
        JSON.stringify({
          error: 'Failed to fetch content',
          message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { ...headersToObject(corsHeaders), 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
