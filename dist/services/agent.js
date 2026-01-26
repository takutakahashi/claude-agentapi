import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';
const MAX_MESSAGE_HISTORY = parseInt(process.env.MAX_MESSAGE_HISTORY || '100', 10);
export class AgentService {
    session = null;
    status = 'stable';
    messages = [];
    messageIdCounter = 0;
    async initialize() {
        try {
            logger.info('Initializing Claude Agent SDK session...');
            const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
            this.session = await unstable_v2_createSession({
                model,
                // Bedrock support is controlled via CLAUDE_CODE_USE_BEDROCK environment variable
                // Additional configuration can be added here as needed
            });
            logger.info('Claude Agent SDK session initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Claude Agent SDK session:', error);
            throw error;
        }
    }
    async sendMessage(content) {
        if (!this.session) {
            throw new Error('Agent session not initialized');
        }
        if (this.status !== 'stable') {
            throw new Error('Agent is busy');
        }
        try {
            this.setStatus('running');
            // Add user message to history
            const userMessage = this.addMessage('user', content);
            sessionService.broadcastMessageUpdate(userMessage);
            logger.info('Sending message to agent...');
            await this.session.send(content);
            // Process agent response
            logger.info('Receiving agent response...');
            for await (const msg of this.session.stream()) {
                await this.processSDKMessage(msg);
            }
            this.setStatus('stable');
            logger.info('Agent processing complete');
        }
        catch (error) {
            logger.error('Error processing message:', error);
            this.setStatus('stable');
            throw error;
        }
    }
    async processSDKMessage(msg) {
        try {
            logger.debug('Processing SDK message:', JSON.stringify(msg, null, 2));
            // Handle different message types
            if (msg.type === 'assistant') {
                // Extract text content
                const content = msg.message?.content || [];
                const textBlocks = content.filter((block) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'text');
                if (textBlocks.length > 0) {
                    const text = textBlocks.map((block) => block.text).join('\n');
                    if (text.trim()) {
                        const assistantMessage = this.addMessage('assistant', text);
                        sessionService.broadcastMessageUpdate(assistantMessage);
                    }
                }
                // Check for tool uses
                const toolUses = content.filter((block) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_use');
                for (const toolUse of toolUses) {
                    // Record tool use as agent message
                    const toolUseMessage = this.formatToolUse(toolUse);
                    const agentMessage = this.addMessage('agent', toolUseMessage);
                    sessionService.broadcastMessageUpdate(agentMessage);
                    // Handle special tool uses
                    await this.handleToolUse(toolUse);
                }
            }
            else if (msg.type === 'user') {
                // This might be tool results or other user messages
                logger.debug('User message from SDK:', msg);
            }
        }
        catch (error) {
            logger.error('Error processing SDK message:', error);
        }
    }
    async handleToolUse(toolUse) {
        const { name, input } = toolUse;
        if (name === 'AskUserQuestion') {
            // Format as a question message
            const questionText = this.formatQuestion(input);
            const questionMessage = this.addMessage('assistant', questionText, 'question');
            sessionService.broadcastMessageUpdate(questionMessage);
            logger.info('AskUserQuestion detected and broadcasted');
        }
        else if (name === 'ExitPlanMode') {
            // Format as a plan message
            const planText = this.formatPlan(input);
            const planMessage = this.addMessage('assistant', planText, 'plan');
            sessionService.broadcastMessageUpdate(planMessage);
            logger.info('ExitPlanMode detected and broadcasted');
        }
    }
    formatToolUse(toolUse) {
        return JSON.stringify({
            type: 'tool_use',
            name: toolUse.name,
            id: toolUse.id,
            input: toolUse.input,
        }, null, 2);
    }
    formatQuestion(input) {
        // Format AskUserQuestion input as readable text
        if (typeof input === 'string') {
            return `❓ Question: ${input}`;
        }
        if (typeof input === 'object' && input !== null && 'questions' in input) {
            const { questions } = input;
            if (Array.isArray(questions)) {
                const formatted = questions.map((q, idx) => {
                    if (typeof q === 'object' && q !== null && 'question' in q) {
                        const question = q;
                        let text = `\n**Question ${idx + 1}**: ${question.question}\n`;
                        if (question.options && Array.isArray(question.options)) {
                            text += question.options.map((opt, optIdx) => {
                                if (typeof opt === 'object' && opt !== null && 'label' in opt) {
                                    const option = opt;
                                    return `  ${optIdx + 1}. ${option.label}${option.description ? ` - ${option.description}` : ''}`;
                                }
                                return '';
                            }).join('\n');
                        }
                        return text;
                    }
                    return '';
                }).join('\n');
                return `❓ Questions:\n${formatted}`;
            }
        }
        return `❓ Question: ${JSON.stringify(input, null, 2)}`;
    }
    formatPlan(input) {
        // Format ExitPlanMode input as readable text
        if (typeof input === 'string') {
            return `📋 Plan ready for approval:\n${input}`;
        }
        return `📋 Plan ready for approval:\n${JSON.stringify(input, null, 2)}`;
    }
    addMessage(role, content, type) {
        const message = {
            id: this.generateMessageId(),
            role,
            content,
            time: new Date().toISOString(),
            type: type || 'normal',
        };
        this.messages.push(message);
        // Trim message history if it exceeds the limit
        if (this.messages.length > MAX_MESSAGE_HISTORY) {
            this.messages = this.messages.slice(-MAX_MESSAGE_HISTORY);
            logger.debug(`Message history trimmed to ${MAX_MESSAGE_HISTORY} messages`);
        }
        return message;
    }
    generateMessageId() {
        return this.messageIdCounter++;
    }
    setStatus(status) {
        if (this.status !== status) {
            this.status = status;
            sessionService.broadcastStatusChange(status);
            logger.info(`Agent status changed to: ${status}`);
        }
    }
    getStatus() {
        return this.status;
    }
    getMessages() {
        return [...this.messages];
    }
    async cleanup() {
        logger.info('Cleaning up agent service...');
        // Add any cleanup logic if needed
    }
}
export const agentService = new AgentService();
//# sourceMappingURL=agent.js.map