import { Router } from 'express';
import { getMetricsService } from '../services/metrics.js';
import { agentService } from '../services/agent.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface UsageStats {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    total: number;
  };
  cost: {
    totalUsd: number;
  };
  session: {
    id: string;
    status: string;
    messageCount: number;
  };
}

/**
 * GET /usage
 *
 * Returns token usage and cost statistics for the current session.
 *
 * Response format:
 * {
 *   "tokens": {
 *     "input": number,
 *     "output": number,
 *     "cacheRead": number,
 *     "cacheCreation": number,
 *     "total": number
 *   },
 *   "cost": {
 *     "totalUsd": number
 *   },
 *   "session": {
 *     "id": string,
 *     "status": string,
 *     "messageCount": number
 *   }
 * }
 */
router.get('/usage', async (_req, res) => {
  try {
    const metricsService = getMetricsService();

    if (!metricsService) {
      // Metrics not enabled, return zero stats
      const stats: UsageStats = {
        tokens: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheCreation: 0,
          total: 0,
        },
        cost: {
          totalUsd: 0,
        },
        session: {
          id: process.env.SESSION_ID || 'default',
          status: agentService.getStatus(),
          messageCount: agentService.getMessages().length,
        },
      };

      return res.json(stats);
    }

    // Get usage statistics from metrics service (now async)
    const usageStats = await metricsService.getUsageStats();

    const stats: UsageStats = {
      tokens: {
        input: usageStats.tokens.input,
        output: usageStats.tokens.output,
        cacheRead: usageStats.tokens.cacheRead,
        cacheCreation: usageStats.tokens.cacheCreation,
        total: usageStats.tokens.total,
      },
      cost: {
        totalUsd: usageStats.cost.totalUsd,
      },
      session: {
        id: usageStats.sessionId,
        status: agentService.getStatus(),
        messageCount: agentService.getMessages().length,
      },
    };

    logger.debug('Usage stats requested', stats);
    return res.json(stats);
  } catch (error) {
    logger.error('Error getting usage stats:', error);
    return res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
