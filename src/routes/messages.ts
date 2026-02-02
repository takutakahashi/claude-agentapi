import { Router } from 'express';
import { agentService } from '../services/agent.js';
import type { MessagesResponseBody } from '../types/api.js';

const router = Router();

router.get('/messages', (_req, res) => {
  // Get all messages including tool execution history (agent and tool_result roles)
  const messages = agentService.getMessages();
  const response: MessagesResponseBody = {
    $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
    messages,
  };
  res.json(response);
});

export default router;
