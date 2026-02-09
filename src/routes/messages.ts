import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { MessagesQueryParamsSchema, type MessagesResponseBody } from '../types/api.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/messages', (req, res) => {
  try {
    // Parse and validate query parameters
    const parseResult = MessagesQueryParamsSchema.safeParse(req.query);

    if (!parseResult.success) {
      logger.warn('Invalid query parameters for /messages', {
        errors: parseResult.error.errors,
        query: req.query,
      });
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const params = parseResult.data;

    // Validate parameter combinations
    // Check cursor-based pagination first (before checking context)
    if (params.after !== undefined && params.before !== undefined) {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'Parameters "after" and "before" cannot be used together',
      });
    }

    if (
      (params.after !== undefined || params.before !== undefined) &&
      (params.around !== undefined || params.context !== undefined)
    ) {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'Parameters "after"/"before" cannot be used with "around"/"context"',
      });
    }

    if ((params.after !== undefined || params.before !== undefined) && params.direction !== undefined) {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'Parameters "after"/"before" cannot be used with "direction"',
      });
    }

    // Check around/context parameters
    if (params.context !== undefined && params.around === undefined) {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'Parameter "context" requires "around" to be specified',
      });
    }

    if (params.around !== undefined && (params.limit !== undefined || params.direction !== undefined)) {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'Parameter "around" cannot be used with "limit" or "direction"',
      });
    }

    // Get messages with pagination
    const result = agentService.getMessagesWithPagination({
      limit: params.limit,
      direction: params.direction,
      around: params.around,
      context: params.context,
      after: params.after,
      before: params.before,
    });

    const response: MessagesResponseBody = {
      $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
      messages: result.messages,
      total: result.total,
      hasMore: result.hasMore,
    };

    return res.json(response);
  } catch (error) {
    logger.error('Error handling /messages request', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: 'Failed to retrieve messages',
    });
  }
});

export default router;
