import { Router } from 'express';
import { agentService } from '../services/agent.js';
const router = Router();
router.get('/status', (_req, res) => {
    const response = {
        agent_type: 'claude',
        status: agentService.getStatus(),
    };
    res.json(response);
});
export default router;
//# sourceMappingURL=status.js.map