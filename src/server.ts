import express from 'express';
import type { Express } from 'express';
import statusRouter from './routes/status.js';
import messagesRouter from './routes/messages.js';
import messageRouter from './routes/message.js';
import eventsRouter from './routes/events.js';
import toolStatusRouter from './routes/tool_status.js';
import actionRouter from './routes/action.js';
import { logger } from './utils/logger.js';

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // API Routes
  app.use(statusRouter);
  app.use(messagesRouter);
  app.use(messageRouter);
  app.use(eventsRouter);
  app.use(toolStatusRouter);
  app.use(actionRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
    });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: err.message,
    });
  });

  return app;
}
