import { Router } from 'express';
import { agentService } from '../services/agent.js';
const router = Router();
router.get('/messages', (_req, res) => {
    const allMessages = agentService.getMessages();
    // Filter to only user and assistant messages (exclude tool execution info)
    const messages = allMessages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    const response = {
        $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
        messages,
    };
    res.json(response);
});
export default router;
//# sourceMappingURL=messages.js.map