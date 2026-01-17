import { afterEach, describe, expect, it } from 'vitest';
import app from '../src/index';

describe('worker api', () => {
  const env = { ALLOWLIST_EXTRA: 'example.com' };
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    globalThis.fetch = originalFetch;
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

});
