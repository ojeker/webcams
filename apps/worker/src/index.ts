import { Hono } from 'hono';
import { AppError, toJsonError } from './errors';
import allowlist from '../allowlist.json';

type Env = {
  ALLOWLIST_EXTRA?: string;
};

const BASE_ALLOWLIST = new Set(allowlist);

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  await next();
});

function requireParam(c: Parameters<typeof app.get>[1], name: string) {
  const value = c.req.query(name);
  if (!value) {
    throw new AppError('E_MISSING_PARAM', 400, `Missing ${name}`, `Provide '${name}' as a query param.`);
  }
  return value;
}

function parseUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    throw new AppError('E_INVALID_URL', 400, 'Invalid url', 'Provide a valid absolute https URL.');
  }
}

function parseAllowlistExtra(input?: string) {
  if (!input) return [];
  return input
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function ensureAllowedHost(url: URL, extra?: string) {
  const extras = parseAllowlistExtra(extra);
  const allowed = BASE_ALLOWLIST.has(url.hostname) || extras.includes(url.hostname);
  if (!allowed) {
    throw new AppError('E_FORBIDDEN_HOST', 403, 'Forbidden host', 'Host is not allowlisted.');
  }
}

function jsonError(c: Parameters<typeof app.get>[1], error: AppError) {
  return c.json(toJsonError(error), error.status, {
    'Content-Type': 'application/json'
  });
}

function createHtmlRewriter() {
  const HTMLRewriterCtor = (globalThis as typeof globalThis & { HTMLRewriter?: typeof HTMLRewriter })
    .HTMLRewriter;
  if (!HTMLRewriterCtor) {
    throw new AppError('E_UPSTREAM_FAILED', 502, 'HTML parser unavailable', 'Try again later.');
  }
  return new HTMLRewriterCtor();
}

app.get('/api/image', async c => {
  try {
    const target = requireParam(c, 'url');
    const url = parseUrl(target);
    ensureAllowedHost(url, c.env?.ALLOWLIST_EXTRA);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        cf: { cacheTtl: 30, cacheEverything: true },
        headers: {
          'User-Agent': 'WebcamSun/1.0',
          Referer: `${url.origin}/`
        }
      });
    } catch (error) {
      throw new AppError('E_UPSTREAM_FAILED', 502, 'Upstream fetch failed', 'Try again or check provider availability.');
    }

    const headers = new Headers(response.headers);
    headers.delete('Set-Cookie');

    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(c, error);
    }
    return jsonError(
      c,
      new AppError('E_UPSTREAM_FAILED', 502, 'Upstream fetch failed', 'Try again or check provider availability.')
    );
  }
});

app.get('/api/html-image', async c => {
  try {
    const page = requireParam(c, 'page');
    const selector = c.req.query('selector') || 'img';
    const pageUrl = parseUrl(page);
    ensureAllowedHost(pageUrl, c.env?.ALLOWLIST_EXTRA);

    let response: Response;
    try {
      response = await fetch(pageUrl.toString(), {
        cf: { cacheTtl: 60, cacheEverything: true },
        headers: {
          'User-Agent': 'WebcamSun/1.0',
          Referer: `${pageUrl.origin}/`
        }
      });
    } catch {
      throw new AppError('E_UPSTREAM_FAILED', 502, 'Upstream fetch failed', 'Try again or check provider availability.');
    }

    if (!response.ok) {
      throw new AppError('E_UPSTREAM_FAILED', 502, 'Upstream fetch failed', 'Try again or check provider availability.');
    }

    let found: string | undefined;
    const rewriter = createHtmlRewriter().on(selector, {
      element(el) {
        if (found) return;
        const src = el.getAttribute('src');
        if (src) {
          found = new URL(src, pageUrl).toString();
        }
      }
    });

    await rewriter.transform(response).text();

    if (!found) {
      throw new AppError('E_NO_IMAGE_FOUND', 404, 'No image found', 'Check selector or upstream page.');
    }

    return c.redirect(`/api/image?url=${encodeURIComponent(found)}`, 302);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(c, error);
    }
    return jsonError(
      c,
      new AppError('E_UPSTREAM_FAILED', 502, 'Upstream fetch failed', 'Try again or check provider availability.')
    );
  }
});

export default app;
