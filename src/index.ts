import 'dotenv/config';
import { createServer } from './server.js';
import { agentService } from './services/agent.js';
import { logger } from './utils/logger.js';
import { initializeTelemetry, shutdownTelemetry } from './utils/telemetry.js';
import { initializeMetricsService } from './services/metrics.js';
import { randomUUID } from 'crypto';

// Parse command line arguments
if (process.argv.includes('--dangerously-skip-permissions')) {
  process.env.DANGEROUSLY_SKIP_PERMISSIONS = 'true';
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';
const TELEMETRY_ENABLED = process.env.CLAUDE_CODE_ENABLE_TELEMETRY === '1';
const PROMETHEUS_PORT = parseInt(process.env.PROMETHEUS_PORT || '9464', 10);

async function main() {
  try {
    logger.info('Starting agentapi-bedrock-server...');

    // Initialize telemetry
    if (TELEMETRY_ENABLED) {
      logger.info('Initializing telemetry...');
      initializeTelemetry(true, PROMETHEUS_PORT);

      // Initialize metrics service with a session ID
      const sessionId = randomUUID();
      initializeMetricsService(sessionId);
      logger.info(`Telemetry initialized with session ID: ${sessionId}`);
    }

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
      logger.info('  GET  /tool_status     - Tool execution status');
      logger.info('  GET  /action          - Get pending actions');
      logger.info('  POST /action          - Send action response (answer_question, approve_plan, stop_agent)');

      if (TELEMETRY_ENABLED) {
        logger.info(`\nPrometheus metrics:`);
        logger.info(`  GET  http://${HOST}:${PROMETHEUS_PORT}/metrics`);
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');

      server.close(() => {
        logger.info('HTTP server closed');
      });

      await agentService.cleanup();

      if (TELEMETRY_ENABLED) {
        await shutdownTelemetry();
      }

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
