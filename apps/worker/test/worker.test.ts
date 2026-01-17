import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/index';

describe('worker api', () => {
  const env = { ALLOWLIST_EXTRA: 'example.com' };
  const originalFetch = globalThis.fetch;
  const originalHtmlRewriter = (globalThis as typeof globalThis & { HTMLRewriter?: typeof HTMLRewriter })
    .HTMLRewriter;
  const fixtureHtml = readFileSync(new URL('./fixtures/html-image.html', import.meta.url), 'utf8');

  beforeAll(() => {
    class TestHTMLRewriter {
      private selector?: string;
      private handler?: { element: (el: { getAttribute: (name: string) => string | null }) => void };

      on(
        selector: string,
        handler: { element: (el: { getAttribute: (name: string) => string | null }) => void }
      ) {
        this.selector = selector;
        this.handler = handler;
        return this;
      }

      transform(res: Response) {
        return {
          text: async () => {
            const html = await res.text();
            if (!this.selector || !this.handler) {
              return html;
            }

            const selector = this.selector.trim();
            const classMatch = selector.startsWith('img.') ? selector.slice(4) : null;
            const idMatch = selector.startsWith('img#') ? selector.slice(4) : null;

            const imgRegex = /<img\b([^>]*?)>/gi;
            let match: RegExpExecArray | null;
            while ((match = imgRegex.exec(html))) {
              const attrs = match[1] ?? '';
              const srcMatch = attrs.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i);
              if (!srcMatch) continue;

              if (classMatch) {
                const classAttr = attrs.match(/\bclass\s*=\s*['"]([^'"]+)['"]/i);
                const classes = classAttr ? classAttr[1].split(/\s+/) : [];
                if (!classes.includes(classMatch)) continue;
              }

              if (idMatch) {
                const idAttr = attrs.match(/\bid\s*=\s*['"]([^'"]+)['"]/i);
                if (!idAttr || idAttr[1] !== idMatch) continue;
              }

              this.handler.element({
                getAttribute: (name: string) => (name === 'src' ? srcMatch[1] : null)
              });
              break;
            }

            return html;
          }
        };
      }
    }

    (globalThis as typeof globalThis & { HTMLRewriter?: typeof HTMLRewriter }).HTMLRewriter =
      TestHTMLRewriter as unknown as typeof HTMLRewriter;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { HTMLRewriter?: typeof HTMLRewriter }).HTMLRewriter =
      originalHtmlRewriter;
  });

  it('returns missing param error for /api/image', async () => {
    const res = await app.request('http://localhost/api/image');

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_MISSING_PARAM'
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns invalid url error for /api/image', async () => {
    const res = await app.request('http://localhost/api/image?url=not-a-url');

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_INVALID_URL'
    });
  });

  it('returns forbidden host error for /api/image', async () => {
    const res = await app.request(
      'http://localhost/api/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg'
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_FORBIDDEN_HOST'
    });
  });

  it('proxies image responses for allowlisted hosts', async () => {
    globalThis.fetch = async () =>
      new Response('fake-image-bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } });

    const target = encodeURIComponent('https://example.com/image.jpg');
    const res = await app.request(`http://localhost/api/image?url=${target}`, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    await expect(res.text()).resolves.toBe('fake-image-bytes');
  });

  it('returns missing param error for /api/html-image', async () => {
    const res = await app.request('http://localhost/api/html-image');

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_MISSING_PARAM'
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns invalid url error for /api/html-image', async () => {
    const res = await app.request('http://localhost/api/html-image?page=not-a-url');

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_INVALID_URL'
    });
  });

  it('returns forbidden host error for /api/html-image', async () => {
    const res = await app.request(
      'http://localhost/api/html-image?page=https%3A%2F%2Fexample.com%2Fpage.html'
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_FORBIDDEN_HOST'
    });
  });

  it('returns no image found for /api/html-image when selector has no match', async () => {
    globalThis.fetch = async () => new Response('<html><body>No images</body></html>', { status: 200 });

    const res = await app.request(
      'http://localhost/api/html-image?page=https%3A%2F%2Fexample.com%2Fpage.html&selector=img',
      {},
      env
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: 'E_NO_IMAGE_FOUND'
    });
  });

  it('redirects to /api/image for /api/html-image when a match is found', async () => {
    globalThis.fetch = async () => new Response(fixtureHtml, { status: 200 });

    const res = await app.request(
      'http://localhost/api/html-image?page=https%3A%2F%2Fexample.com%2Fpage.html&selector=img.hero',
      {},
      env
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/api/image?url=https%3A%2F%2Fexample.com%2Fimages%2Ffirst.jpg'
    );
  });
});
