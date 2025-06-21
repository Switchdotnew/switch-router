import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';

describe('Authentication Middleware', () => {
  let app: Hono;
  let originalEnv: string | undefined;

  beforeEach(() => {
    app = new Hono();
    originalEnv = process.env.ADMIN_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_API_KEY = originalEnv;
    } else {
      delete process.env.ADMIN_API_KEY;
    }
  });

  test('should allow valid API key', async () => {
    process.env.ADMIN_API_KEY = 'valid-key-1,valid-key-2';

    app.get('/test', authMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: { 'x-api-key': 'valid-key-1' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('should allow second valid API key', async () => {
    process.env.ADMIN_API_KEY = 'valid-key-1,valid-key-2';

    app.get('/test', authMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: { 'x-api-key': 'valid-key-2' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('should reject missing API key', async () => {
    process.env.ADMIN_API_KEY = 'valid-key-1,valid-key-2';

    app.get('/test', authMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test');

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error.code).toBe('missing_api_key');
  });

  test('should reject invalid API key', async () => {
    process.env.ADMIN_API_KEY = 'valid-key-1,valid-key-2';

    app.get('/test', authMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: { 'x-api-key': 'invalid-key' },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error.code).toBe('invalid_api_key');
  });

  test('should handle comma-separated keys with spaces', async () => {
    process.env.ADMIN_API_KEY = ' key1 , key2 , key3 ';

    app.get('/test', authMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: { 'x-api-key': 'key2' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('optionalAuthMiddleware should skip auth when no keys configured', async () => {
    delete process.env.ADMIN_API_KEY;

    app.get('/test', optionalAuthMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('optionalAuthMiddleware should enforce auth when keys configured', async () => {
    process.env.ADMIN_API_KEY = 'test-key';

    app.get('/test', optionalAuthMiddleware(), (c) => c.json({ success: true }));

    const response = await app.request('/test');

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error.code).toBe('missing_api_key');
  });
});
