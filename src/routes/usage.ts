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
 * Returns token usage and cost statistics for the last API call.
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
router.get('/usage', (_req, res) => {
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

    // Get usage statistics from metrics service
    const usageStats = metricsService.getUsageStats();

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

/**
 * GET /usage/cumulative
 *
 * Returns cumulative token usage and cost statistics for the entire session.
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
router.get('/usage/cumulative', (_req, res) => {
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

    // Get cumulative usage statistics from metrics service
    const cumulativeStats = metricsService.getCumulativeUsageStats();

    const stats: UsageStats = {
      tokens: {
        input: cumulativeStats.tokens.input,
        output: cumulativeStats.tokens.output,
        cacheRead: cumulativeStats.tokens.cacheRead,
        cacheCreation: cumulativeStats.tokens.cacheCreation,
        total: cumulativeStats.tokens.total,
      },
      cost: {
        totalUsd: cumulativeStats.cost.totalUsd,
      },
      session: {
        id: cumulativeStats.sessionId,
        status: agentService.getStatus(),
        messageCount: agentService.getMessages().length,
      },
    };

    logger.debug('Cumulative usage stats requested', stats);
    return res.json(stats);
  } catch (error) {
    logger.error('Error getting cumulative usage stats:', error);
    return res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /usage/budget
 *
 * Returns token budget status and limits.
 *
 * Response format:
 * {
 *   "budget": {
 *     "maxTokens": number | undefined,
 *     "maxCostUsd": number | undefined,
 *     "maxTurns": number | undefined,
 *     "maxMessageHistory": number | undefined,
 *     "warningThresholdPercent": number | undefined
 *   },
 *   "current": {
 *     "tokens": number,
 *     "costUsd": number,
 *     "turns": number
 *   },
 *   "limits": {
 *     "tokensExceeded": boolean,
 *     "costExceeded": boolean,
 *     "turnsExceeded": boolean
 *   }
 * }
 */
router.get('/usage/budget', (_req, res) => {
  try {
    const metricsService = getMetricsService();

    if (!metricsService) {
      // Metrics not enabled, return empty budget status
      return res.json({
        budget: null,
        current: {
          tokens: 0,
          costUsd: 0,
          turns: 0,
        },
        limits: {
          tokensExceeded: false,
          costExceeded: false,
          turnsExceeded: false,
        },
      });
    }

    const budgetStatus = metricsService.getBudgetStatus();
    logger.debug('Budget status requested', budgetStatus);
    return res.json(budgetStatus);
  } catch (error) {
    logger.error('Error getting budget status:', error);
    return res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
