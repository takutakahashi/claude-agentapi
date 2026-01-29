import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { PostActionRequestSchema } from '../types/api.js';
import { logger } from '../utils/logger.js';
const router = Router();
router.post('/action', async (req, res) => {
    try {
        // Validate request body
        const validation = PostActionRequestSchema.safeParse(req.body);
        if (!validation.success) {
            const error = {
                type: 'about:blank',
                title: 'Invalid request',
                status: 400,
                detail: validation.error.message,
            };
            return res.status(400).json(error);
        }
        const { answers } = validation.data;
        // Check if agent is running (has an active question)
        if (agentService.getStatus() !== 'running') {
            const error = {
                type: 'about:blank',
                title: 'No active question',
                status: 409,
                detail: 'There is no active question to answer. The agent must be running and waiting for user input.',
            };
            return res.status(409).json(error);
        }
        // Send action response to agent
        await agentService.sendAction(answers);
        const response = { ok: true };
        return res.json(response);
    }
    catch (error) {
        logger.error('Error processing action:', error);
        const problemJson = {
            type: 'about:blank',
            title: 'Internal server error',
            status: 500,
            detail: error instanceof Error ? error.message : 'Unknown error occurred',
        };
        return res.status(500).json(problemJson);
    }
});
export default router;
//# sourceMappingURL=action.js.map