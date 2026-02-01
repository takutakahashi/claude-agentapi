import { Router } from 'express';
import { agentService } from '../services/agent.js';
import type { StatusResponse } from '../types/api.js';

const router = Router();

router.get('/:sessionId/status', (_req, res) => {
  const response: StatusResponse = {
    agent_type: 'claude',
    status: agentService.getStatus(),
  };

  res.json(response);
});

export default router;
