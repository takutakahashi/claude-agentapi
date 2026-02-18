import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { PostMessageRequestSchema } from '../types/api.js';
import type { PostMessageResponse, ProblemJson } from '../types/api.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/message', async (req, res) => {
  try {
    // Validate request body
    const validation = PostMessageRequestSchema.safeParse(req.body);

    if (!validation.success) {
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: validation.error.message,
      };
      return res.status(400).json(error);
    }

    const { content, type } = validation.data;

    if (type === 'user') {
      // Check if agent is stable
      if (agentService.getStatus() !== 'stable') {
        const error: ProblemJson = {
          type: 'about:blank',
          title: 'Agent is busy',
          status: 409,
          detail: 'The agent is currently processing another request. Please wait until it becomes stable.',
        };
        return res.status(409).json(error);
      }

      // Send message to agent
      await agentService.sendMessage(content);

      const response: PostMessageResponse = { ok: true };
      return res.json(response);
    } else if (type === 'raw') {
      // Raw messages (direct terminal input) are not yet implemented
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Not implemented',
        status: 501,
        detail: 'Raw message type is not yet implemented.',
      };
      return res.status(501).json(error);
    } else {
      // This should never happen due to schema validation
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Invalid message type',
        status: 400,
        detail: `Invalid message type: ${type}`,
      };
      return res.status(400).json(error);
    }
  } catch (error) {
    logger.error('Error processing message:', error);

    const problemJson: ProblemJson = {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return res.status(500).json(problemJson);
  }
});

export default router;
