import 'dotenv/config';
import { createServer } from './server.js';
import { agentService } from './services/agent.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';

async function main() {
  try {
    logger.info('Starting agentapi-bedrock-server...');

    // Initialize agent service
    await agentService.initialize();

    // Create and start server
    const app = createServer();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Server listening on http://${HOST}:${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health          - Health check');
      logger.info('  GET  /status          - Agent status');
      logger.info('  GET  /messages        - Message history');
      logger.info('  POST /message         - Send message to agent');
      logger.info('  GET  /events          - SSE event stream');
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');

      server.close(() => {
        logger.info('HTTP server closed');
      });

      await agentService.cleanup();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
