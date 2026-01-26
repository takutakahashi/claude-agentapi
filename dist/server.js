import express from 'express';
import statusRouter from './routes/status.js';
import messagesRouter from './routes/messages.js';
import messageRouter from './routes/message.js';
import eventsRouter from './routes/events.js';
import { logger } from './utils/logger.js';
export function createServer() {
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
    // 404 handler
    app.use((_req, res) => {
        res.status(404).json({
            type: 'about:blank',
            title: 'Not found',
            status: 404,
        });
    });
    // Error handler
    app.use((err, _req, res, _next) => {
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
//# sourceMappingURL=server.js.map