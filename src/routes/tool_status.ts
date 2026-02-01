import { Router } from 'express';
import { agentService } from '../services/agent.js';
import type { ToolStatusResponseBody } from '../types/api.js';

const router = Router();

router.get('/tool_status', (_req, res) => {
  // Get only currently active tool executions
  const messages = agentService.getActiveToolExecutions();
  const response: ToolStatusResponseBody = {
    $schema: 'https://10.42.2.198:9000/schemas/ToolStatusResponseBody.json',
    messages,
  };
  res.json(response);
});

export default router;
