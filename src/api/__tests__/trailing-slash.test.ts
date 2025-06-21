import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

describe('Trailing Slash Handling', () => {
  let app: Hono;
  let originalEnv: string | undefined;

  beforeEach(() => {
    app = new Hono();
    originalEnv = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = 'test-key';

    // Set up test routes similar to the actual API - both with and without trailing slashes
    app.get('/v1/models', authMiddleware(), (c) => c.json({ models: [] }));
    app.get('/v1/models/', authMiddleware(), (c) => c.json({ models: [] }));
    app.post('/v1/chat/completions', authMiddleware(), (c) => c.json({ id: 'test' }));
    app.post('/v1/chat/completions/', authMiddleware(), (c) => c.json({ id: 'test' }));
    app.post('/v1/completions', authMiddleware(), (c) => c.json({ id: 'test' }));
    app.post('/v1/completions/', authMiddleware(), (c) => c.json({ id: 'test' }));
    app.get('/health', (c) => c.json({ status: 'ok' }));
    app.get('/health/', (c) => c.json({ status: 'ok' }));
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_API_KEY = originalEnv;
    } else {
      delete process.env.ADMIN_API_KEY;
    }
  });

  test('should handle /v1/models without trailing slash', async () => {
    const response = await app.request('/v1/models', {
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.models).toBeDefined();
  });

  test('should handle /v1/models with trailing slash', async () => {
    const response = await app.request('/v1/models/', {
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.models).toBeDefined();
  });

  test('should handle /v1/chat/completions without trailing slash', async () => {
    const response = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'x-api-key': 'test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test', messages: [] }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe('test');
  });

  test('should handle /v1/chat/completions with trailing slash', async () => {
    const response = await app.request('/v1/chat/completions/', {
      method: 'POST',
      headers: {
        'x-api-key': 'test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test', messages: [] }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe('test');
  });

  test('should handle /v1/completions without trailing slash', async () => {
    const response = await app.request('/v1/completions', {
      method: 'POST',
      headers: {
        'x-api-key': 'test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test', prompt: 'test' }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe('test');
  });

  test('should handle /v1/completions with trailing slash', async () => {
    const response = await app.request('/v1/completions/', {
      method: 'POST',
      headers: {
        'x-api-key': 'test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test', prompt: 'test' }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe('test');
  });

  test('should handle /health without trailing slash', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('ok');
  });

  test('should handle /health with trailing slash', async () => {
    const response = await app.request('/health/');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('ok');
  });
});
