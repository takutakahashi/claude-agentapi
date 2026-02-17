import { Router } from 'express';
import type { Request, Response } from 'express';
import { getAvailableResources } from '../services/resources.js';
import { resolveConfig } from '../utils/config.js';
import type { ResourcesResponse } from '../types/api.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /resources
 * Get available resources (skills, commands, subagents)
 */
router.get('/resources', async (_req: Request, res: Response) => {
  try {
    // Get current configuration
    const config = await resolveConfig();

    // Get available resources
    const resources = await getAvailableResources(config);

    const response: ResourcesResponse = {
      resources,
    };

    logger.debug(`Returning ${resources.length} resources`);
    res.json(response);
  } catch (error) {
    logger.error('Error fetching resources:', error);
    res.status(500).json({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
