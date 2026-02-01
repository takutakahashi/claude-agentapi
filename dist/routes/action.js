import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { PostActionRequestSchema } from '../types/api.js';
import { logger } from '../utils/logger.js';
const router = Router();
router.get('/action', async (_req, res) => {
    try {
        const pendingActions = agentService.getPendingActions();
        const response = {
            pending_actions: pendingActions,
        };
        return res.json(response);
    }
    catch (error) {
        logger.error('Error getting pending actions:', error);
        const problemJson = {
            type: 'about:blank',
            title: 'Internal server error',
            status: 500,
            detail: error instanceof Error ? error.message : 'Unknown error occurred',
        };
        return res.status(500).json(problemJson);
    }
});
router.post('/action', async (req, res) => {
    try {
        // Log request body for debugging
        logger.info('POST /action request body:', JSON.stringify(req.body));
        // Validate request body
        const validation = PostActionRequestSchema.safeParse(req.body);
        if (!validation.success) {
            logger.error('POST /action validation failed:', validation.error.message);
            logger.error('Validation errors:', JSON.stringify(validation.error.issues));
            const error = {
                type: 'about:blank',
                title: 'Invalid request',
                status: 400,
                detail: validation.error.message,
            };
            return res.status(400).json(error);
        }
        const action = validation.data;
        // Handle different action types
        switch (action.type) {
            case 'answer_question': {
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
                await agentService.sendAction(action.answers);
                break;
            }
            case 'approve_plan': {
                // Check if agent is running (has an active plan)
                if (agentService.getStatus() !== 'running') {
                    const error = {
                        type: 'about:blank',
                        title: 'No active plan',
                        status: 409,
                        detail: 'There is no active plan to approve. The agent must be running and waiting for plan approval.',
                    };
                    return res.status(409).json(error);
                }
                // Send plan approval to agent
                await agentService.approvePlan(action.approved);
                break;
            }
            case 'stop_agent': {
                // Stop the agent
                await agentService.stopAgent();
                break;
            }
            default: {
                // TypeScript should ensure this is unreachable
                const error = {
                    type: 'about:blank',
                    title: 'Unknown action type',
                    status: 400,
                    detail: 'Unknown action type',
                };
                return res.status(400).json(error);
            }
        }
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