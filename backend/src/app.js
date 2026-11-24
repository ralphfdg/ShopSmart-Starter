import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { prisma } from './lib/prisma.js';
import productsRouter from './routes/products.js';
import { createAuthRouter } from './routes/auth.js';
import { createOrdersRouter } from './routes/orders.js';
import assistantRouter from './routes/assistant.js';

// `db` can be replaced in tests so account and order rules run without PostgreSQL.
export function createApp({ db = prisma } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting proxy, set TRUST_PROXY to the number of proxies (usually 1) so rate limits see real client IPs.
  const proxyHops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(proxyHops) && proxyHops > 0) app.set('trust proxy', proxyHops);
  app.use(helmet());
  // credentials: true lets the browser send the sign-in cookie, but only from FRONTEND_URL.
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use((request, response, next) => { request.id = crypto.randomUUID(); response.setHeader('X-Request-ID', request.id); next(); });
  app.use(morgan(':method :url :status :response-time ms'));

  // Liveness: the API process answers.
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  // Readiness: the API can also reach PostgreSQL.
  app.get('/api/health/ready', async (request, response) => {
    try {
      await db.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      console.error(`[${request.id}] Database check failed: ${error.code ?? error.name}`);
      response.status(503).json({ status: 'error', database: 'unavailable', traceId: request.id });
    }
  });
  app.use('/api/products', productsRouter);
  // Private, per-customer responses: browsers, proxies and CDNs must never store them.
  const noStore = (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); };
  app.use('/api/auth', noStore, createAuthRouter(db));
  app.use('/api/orders', noStore, createOrdersRouter(db));
  app.use('/api/assistant', assistantRouter);
  app.use((_request, response) => response.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'API route could not be found.' } }));
  app.use((error, request, response, _next) => {
    console.error(`[${request.id}]`, error);
    response.status(error.status || 500).json({ error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'The server could not complete the request.', traceId: request.id } });
  });
  return app;
}
