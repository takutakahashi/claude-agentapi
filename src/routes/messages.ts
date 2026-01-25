import { Router } from 'express';
import { agentService } from '../services/agent.js';

const router = Router();

router.get('/messages', (_req, res) => {
  const messages = agentService.getMessages();
  res.json(messages);
});

export default router;
