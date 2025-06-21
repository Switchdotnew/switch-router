import log from '../../utils/logging.js';
import type { MiddlewareHandler } from 'hono';

export const loggingMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  const userAgent = c.req.header('User-Agent') || '';

  log.info(`${method} ${url} - Started`);

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  log.info(`${method} ${url} - ${status} ${duration}ms - ${userAgent}`);
};
