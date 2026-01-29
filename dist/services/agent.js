import { query } from '@anthropic-ai/claude-agent-sdk';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';
import { resolveConfig } from '../utils/config.js';
import { getMetricsService } from './metrics.js';
const MAX_MESSAGE_HISTORY = parseInt(process.env.MAX_MESSAGE_HISTORY || '100000', 10);
// Helper class to manage streaming input
class InputStreamManager {
    resolveNext = null;
    queue = [];
    async *stream() {
        while (true) {
            if (this.queue.length > 0) {
                yield this.queue.shift();
            }
            else {
                yield await new Promise((resolve) => {
                    this.resolveNext = resolve;
                });
            }
        }
    }
    send(message) {
        if (this.resolveNext) {
            this.resolveNext(message);
            this.resolveNext = null;
        }
        else {
            this.queue.push(message);
        }
    }
}
export class AgentService {
    query = null;
    inputStreamManager = null;
    queryProcessorPromise = null;
    status = 'stable';
    messages = [];
    activeToolExecutions = [];
    messageIdCounter = 0;
    pendingQuestionToolUseId = null;
    async initialize() {
        try {
            logger.info('Initializing Claude Agent SDK with v1 API...');
            // Resolve configuration from .claude/config.json and environment variables
            const config = await resolveConfig();
            const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
            // Build query options with v1 API
            const queryOptions = {
                prompt: '', // Initial empty prompt - we'll use streaming input
                options: {
                    model,
                    cwd: config.workingDirectory,
                    permissionMode: config.permissionMode,
                },
            };
            // Add MCP servers if configured
            if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
                logger.info(`Configuring ${Object.keys(config.mcpServers).length} MCP server(s)...`);
                queryOptions.options.mcpServers = config.mcpServers;
            }
            // Add allowed tools if configured
            if (config.allowedTools && config.allowedTools.length > 0) {
                logger.info(`Configuring ${config.allowedTools.length} allowed tool(s)...`);
                queryOptions.options.allowedTools = config.allowedTools;
            }
            // Add environment variables if configured
            if (config.env && Object.keys(config.env).length > 0) {
                logger.info(`Configuring ${Object.keys(config.env).length} environment variable(s)...`);
                queryOptions.options.env = config.env;
            }
            // Add hooks if configured
            if (config.hooks && Object.keys(config.hooks).length > 0) {
                logger.info(`Configuring ${Object.keys(config.hooks).length} hook(s)...`);
                queryOptions.options.hooks = config.hooks;
            }
            // Add SDK plugins if resolved from settings.json
            if (config.sdkPlugins && config.sdkPlugins.length > 0) {
                logger.info(`Configuring ${config.sdkPlugins.length} plugin(s) from settings.json...`);
                queryOptions.options.plugins = config.sdkPlugins;
            }
            // Add setting sources for CLAUDE.md loading
            if (config.settingSources && config.settingSources.length > 0) {
                logger.info(`Configuring setting sources: ${config.settingSources.join(', ')}...`);
                queryOptions.options.settingSources = config.settingSources;
            }
            // Create input stream manager
            this.inputStreamManager = new InputStreamManager();
            // Create query with streaming input
            this.query = query({
                prompt: this.inputStreamManager.stream(),
                options: queryOptions.options,
            });
            // Start processing query responses in the background
            this.queryProcessorPromise = this.processQuery();
            // Record session start in metrics
            const metricsService = getMetricsService();
            if (metricsService) {
                metricsService.recordSessionStart();
            }
            logger.info('Claude Agent SDK initialized successfully with v1 API');
        }
        catch (error) {
            logger.error('Failed to initialize Claude Agent SDK:', error);
            throw error;
        }
    }
    async processQuery() {
        if (!this.query) {
            return;
        }
        try {
            for await (const msg of this.query) {
                await this.processSDKMessage(msg);
            }
        }
        catch (error) {
            logger.error('Error in query processor:', error);
            this.setStatus('stable');
        }
    }
    async sendMessage(content) {
        if (!this.inputStreamManager) {
            throw new Error('Agent not initialized');
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
            // Send message through input stream
            this.inputStreamManager.send({
                type: 'user',
                message: {
                    role: 'user',
                    content,
                },
                parent_tool_use_id: null,
                session_id: 'default',
            });
            // Wait a bit for processing to complete
            // Note: This is a simple implementation. A production version would
            // need better synchronization between sending and receiving.
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        catch (error) {
            logger.error('Error processing message:', error);
            this.setStatus('stable');
            throw error;
        }
    }
    async sendAction(answers) {
        if (!this.inputStreamManager) {
            throw new Error('Agent not initialized');
        }
        if (this.status !== 'running') {
            throw new Error('No active question to answer');
        }
        if (!this.pendingQuestionToolUseId) {
            throw new Error('No pending question to answer');
        }
        try {
            const toolUseId = this.pendingQuestionToolUseId;
            logger.info('Sending action response to agent...', { answers, tool_use_id: toolUseId });
            // Add user message to history for tracking
            const answerText = `Answers: ${JSON.stringify(answers, null, 2)}`;
            const userMessage = this.addMessage('user', answerText);
            sessionService.broadcastMessageUpdate(userMessage);
            // Send answer as tool_result through input stream
            this.inputStreamManager.send({
                type: 'user',
                message: {
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: toolUseId,
                            content: JSON.stringify({ answers }),
                        },
                    ],
                },
                parent_tool_use_id: null,
                session_id: 'default',
            });
            // Clear the pending question
            this.pendingQuestionToolUseId = null;
            // Wait a bit for processing to complete
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        catch (error) {
            logger.error('Error processing action:', error);
            throw error;
        }
    }
    async processSDKMessage(msg) {
        try {
            logger.debug('Processing SDK message:', JSON.stringify(msg, null, 2));
            // Record metrics for result messages
            if (msg.type === 'result') {
                this.recordResultMetrics(msg);
            }
            // Handle system messages (especially init messages for MCP server status)
            if (msg.type === 'system') {
                await this.handleSystemMessage(msg);
                return;
            }
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
                    const agentMessage = this.addMessage('agent', toolUseMessage, undefined, {
                        toolUseId: toolUse.id,
                    });
                    sessionService.broadcastMessageUpdate(agentMessage);
                    // Add to active tool executions
                    this.activeToolExecutions.push(agentMessage);
                    // Record tool metrics
                    this.recordToolMetrics(toolUse.name, toolUse.input);
                    // Handle special tool uses
                    await this.handleToolUse(toolUse);
                }
            }
            else if (msg.type === 'user') {
                // Process tool results from SDK
                const content = msg.message?.content || [];
                const toolResults = content.filter((block) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_result');
                for (const toolResult of toolResults) {
                    // Format tool result content
                    let resultContent = '';
                    if (typeof toolResult.content === 'string') {
                        resultContent = toolResult.content;
                    }
                    else if (Array.isArray(toolResult.content)) {
                        // Extract text from content blocks
                        const textBlocks = toolResult.content.filter((block) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'text');
                        resultContent = textBlocks.map((block) => block.text).join('\n');
                    }
                    else if (toolResult.content && typeof toolResult.content === 'object') {
                        resultContent = JSON.stringify(toolResult.content, null, 2);
                    }
                    // Record tool result as tool_result message
                    const toolResultMessage = this.addMessage('tool_result', resultContent, undefined, {
                        parentToolUseId: toolResult.tool_use_id,
                        status: toolResult.is_error ? 'error' : 'success',
                        error: toolResult.is_error ? resultContent : undefined,
                    });
                    sessionService.broadcastMessageUpdate(toolResultMessage);
                    logger.debug('Tool result recorded:', { tool_use_id: toolResult.tool_use_id, status: toolResultMessage.status });
                    // Remove corresponding agent message from active tool executions
                    this.activeToolExecutions = this.activeToolExecutions.filter(msg => msg.toolUseId !== toolResult.tool_use_id);
                }
                // Log other user messages
                if (toolResults.length === 0) {
                    logger.debug('User message from SDK (non-tool-result):', msg);
                }
            }
            else if (msg.type === 'result') {
                // Query completed
                if (msg.subtype === 'success') {
                    logger.info('Query completed successfully');
                }
                else {
                    logger.warn('Query completed with errors:', msg.errors);
                }
                this.setStatus('stable');
            }
        }
        catch (error) {
            logger.error('Error processing SDK message:', error);
        }
    }
    async handleSystemMessage(msg) {
        if (msg.subtype === 'init') {
            logger.info('System init message received');
            // Check MCP server connection status
            if ('mcp_servers' in msg && Array.isArray(msg.mcp_servers)) {
                const mcpServers = msg.mcp_servers;
                for (const server of mcpServers) {
                    if (server.status === 'connected') {
                        logger.info(`✓ MCP server '${server.name}' connected successfully`);
                    }
                    else if (server.status === 'failed') {
                        logger.error(`✗ MCP server '${server.name}' failed to connect${server.error ? `: ${server.error}` : ''}`);
                    }
                    else {
                        logger.warn(`⚠ MCP server '${server.name}' status: ${server.status}`);
                    }
                }
            }
        }
    }
    async handleToolUse(toolUse) {
        const { name, input, id } = toolUse;
        if (name === 'AskUserQuestion') {
            // Save the tool_use_id for later response
            this.pendingQuestionToolUseId = id || null;
            // Format as a question message
            const questionText = this.formatQuestion(input);
            const questionMessage = this.addMessage('assistant', questionText, 'question');
            sessionService.broadcastMessageUpdate(questionMessage);
            logger.info('AskUserQuestion detected and broadcasted', { tool_use_id: id });
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
    recordResultMetrics(msg) {
        const metricsService = getMetricsService();
        if (!metricsService)
            return;
        try {
            const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
            // Record cost if available
            if ('total_cost_usd' in msg && typeof msg.total_cost_usd === 'number') {
                metricsService.recordCost(msg.total_cost_usd, model);
            }
            // Record token usage if available
            if ('usage' in msg && typeof msg.usage === 'object' && msg.usage !== null) {
                const usage = msg.usage;
                metricsService.recordTokenUsage({
                    input: usage.input_tokens,
                    output: usage.output_tokens,
                    cacheRead: usage.cache_read_input_tokens,
                    cacheCreation: usage.cache_creation_input_tokens,
                }, model);
            }
            // Record model usage if available
            if ('modelUsage' in msg && typeof msg.modelUsage === 'object' && msg.modelUsage !== null) {
                const modelUsage = msg.modelUsage;
                for (const [modelName, usage] of Object.entries(modelUsage)) {
                    if (usage.costUSD) {
                        metricsService.recordCost(usage.costUSD, modelName);
                    }
                    metricsService.recordTokenUsage({
                        input: usage.inputTokens,
                        output: usage.outputTokens,
                        cacheRead: usage.cacheReadInputTokens,
                        cacheCreation: usage.cacheCreationInputTokens,
                    }, modelName);
                }
            }
        }
        catch (error) {
            logger.error('Error recording result metrics:', error);
        }
    }
    recordToolMetrics(toolName, input) {
        const metricsService = getMetricsService();
        if (!metricsService)
            return;
        try {
            // Record code edit tool usage
            if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
                // Extract language from file path if available
                let language = 'unknown';
                if (typeof input === 'object' && input !== null && 'file_path' in input) {
                    const filePath = input.file_path;
                    if (typeof filePath === 'string') {
                        const ext = filePath.split('.').pop()?.toLowerCase();
                        const languageMap = {
                            'ts': 'TypeScript',
                            'js': 'JavaScript',
                            'py': 'Python',
                            'md': 'Markdown',
                            'json': 'JSON',
                            'yaml': 'YAML',
                            'yml': 'YAML',
                        };
                        language = languageMap[ext || ''] || ext || 'unknown';
                    }
                }
                // For now, we assume tools are accepted
                // In a real implementation, this would track actual permission decisions
                metricsService.recordCodeEditToolDecision(toolName, 'accept', language);
            }
            // Record lines of code for Edit and Write tools
            if (toolName === 'Write' && typeof input === 'object' && input !== null && 'content' in input) {
                const content = input.content;
                if (typeof content === 'string') {
                    const lines = content.split('\n').length;
                    metricsService.recordLinesOfCode(lines, 0);
                }
            }
        }
        catch (error) {
            logger.error('Error recording tool metrics:', error);
        }
    }
    addMessage(role, content, type, options) {
        const message = {
            id: this.generateMessageId(),
            role,
            content,
            time: new Date().toISOString(),
            type: type || 'normal',
            ...options,
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
    getActiveToolExecutions() {
        return [...this.activeToolExecutions];
    }
    async cleanup() {
        logger.info('Cleaning up agent service...');
        // Interrupt the query if it's still running
        if (this.query) {
            try {
                await this.query.interrupt();
            }
            catch (error) {
                logger.error('Error interrupting query:', error);
            }
        }
        // Wait for query processor to finish
        if (this.queryProcessorPromise) {
            try {
                await this.queryProcessorPromise;
            }
            catch (error) {
                logger.error('Error waiting for query processor:', error);
            }
        }
        // Record session end metrics
        const metricsService = getMetricsService();
        if (metricsService) {
            metricsService.recordSessionEnd();
        }
    }
}
export const agentService = new AgentService();
//# sourceMappingURL=agent.js.map