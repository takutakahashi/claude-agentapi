import { Router } from 'express';
import { agentService } from '../services/agent.js';
import type { MessagesResponseBody } from '../types/api.js';

const router = Router();

router.get('/:sessionId/messages', (_req, res) => {
  const allMessages = agentService.getMessages();
  // Filter to only user and assistant messages (exclude tool execution info)
  const messages = allMessages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
  const response: MessagesResponseBody = {
    $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
    messages,
  };
  res.json(response);
});

export default router;
