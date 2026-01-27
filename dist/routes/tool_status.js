import { Router } from 'express';
import { agentService } from '../services/agent.js';
const router = Router();
router.get('/tool_status', (_req, res) => {
    const allMessages = agentService.getMessages();
    // Filter to only tool execution messages (agent role and tool_result role)
    const toolExecutions = allMessages.filter(msg => msg.role === 'agent' || msg.role === 'tool_result');
    const response = {
        $schema: 'https://10.42.2.198:9000/schemas/ToolStatusResponseBody.json',
        toolExecutions,
    };
    res.json(response);
});
export default router;
//# sourceMappingURL=tool_status.js.map