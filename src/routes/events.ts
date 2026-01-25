import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { sessionService } from '../services/session.js';
import { SSEClientImpl } from '../utils/sse.js';
import { logger } from '../utils/logger.js';

const router = Router();

let clientIdCounter = 0;

router.get('/events', (req, res) => {
  // Generate unique client ID
  const clientId = `client_${++clientIdCounter}_${Date.now()}`;

  // Create SSE client
  const client = new SSEClientImpl(clientId, res);

  // Send initial state
  const initialMessages = agentService.getMessages();
  const initialStatus = agentService.getStatus();
  sessionService.sendInitialState(client, initialMessages, initialStatus);

  logger.info(`SSE client ${clientId} connected`);

  // Subscribe client to session
  sessionService.subscribe(client);

  // Handle client disconnect
  req.on('close', () => {
    sessionService.unsubscribe(clientId);
    logger.info(`SSE client ${clientId} disconnected`);
  });
});

export default router;
