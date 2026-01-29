import { query, type SDKMessage, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';
import { resolveConfig } from '../utils/config.js';
import { getMetricsService } from './metrics.js';

const MAX_MESSAGE_HISTORY = parseInt(process.env.MAX_MESSAGE_HISTORY || '100000', 10);

// Helper class to manage streaming input
class InputStreamManager {
  private resolveNext: ((value: SDKUserMessage) => void) | null = null;
  private queue: SDKUserMessage[] = [];

  async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        yield await new Promise<SDKUserMessage>((resolve) => {
          this.resolveNext = resolve;
        });
      }
    }
  }

  send(message: SDKUserMessage): void {
    if (this.resolveNext) {
      this.resolveNext(message);
      this.resolveNext = null;
    } else {
      this.queue.push(message);
    }
  }
}

export class AgentService {
  private query: Query | null = null;
  private inputStreamManager: InputStreamManager | null = null;
  private queryProcessorPromise: Promise<void> | null = null;
  private status: AgentStatus = 'stable';
  private messages: Message[] = [];
  private activeToolExecutions: Message[] = [];
  private messageIdCounter = 0;

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Claude Agent SDK with v1 API...');

      // Resolve configuration from .claude/config.json and environment variables
      const config = await resolveConfig();

      const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

      // Build query options with v1 API
      const queryOptions: Parameters<typeof query>[0] = {
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
        queryOptions.options!.mcpServers = config.mcpServers;
      }

      // Add allowed tools if configured
      if (config.allowedTools && config.allowedTools.length > 0) {
        logger.info(`Configuring ${config.allowedTools.length} allowed tool(s)...`);
        queryOptions.options!.allowedTools = config.allowedTools;
      }

      // Add environment variables if configured
      if (config.env && Object.keys(config.env).length > 0) {
        logger.info(`Configuring ${Object.keys(config.env).length} environment variable(s)...`);
        queryOptions.options!.env = config.env;
      }

      // Add hooks if configured
      if (config.hooks && Object.keys(config.hooks).length > 0) {
        logger.info(`Configuring ${Object.keys(config.hooks).length} hook(s)...`);
        queryOptions.options!.hooks = config.hooks;
      }

      // Add SDK plugins if resolved from settings.json
      if (config.sdkPlugins && config.sdkPlugins.length > 0) {
        logger.info(`Configuring ${config.sdkPlugins.length} plugin(s) from settings.json...`);
        queryOptions.options!.plugins = config.sdkPlugins;
      }

      // Add setting sources for CLAUDE.md loading
      if (config.settingSources && config.settingSources.length > 0) {
        logger.info(`Configuring setting sources: ${config.settingSources.join(', ')}...`);
        queryOptions.options!.settingSources = config.settingSources;
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
    } catch (error) {
      logger.error('Failed to initialize Claude Agent SDK:', error);
      throw error;
    }
  }

  private async processQuery(): Promise<void> {
    if (!this.query) {
      return;
    }

    try {
      for await (const msg of this.query) {
        await this.processSDKMessage(msg);
      }
    } catch (error) {
      logger.error('Error in query processor:', error);
      this.setStatus('stable');
    }
  }

  async sendMessage(content: string): Promise<void> {
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

    } catch (error) {
      logger.error('Error processing message:', error);
      this.setStatus('stable');
      throw error;
    }
  }

  async sendAction(answers: Record<string, string>): Promise<void> {
    if (!this.inputStreamManager) {
      throw new Error('Agent not initialized');
    }

    if (this.status !== 'running') {
      throw new Error('No active question to answer');
    }

    try {
      logger.info('Sending action response to agent...', { answers });

      // Add user message to history for tracking
      const answerText = `Answers: ${JSON.stringify(answers, null, 2)}`;
      const userMessage = this.addMessage('user', answerText);
      sessionService.broadcastMessageUpdate(userMessage);

      // Send answer through input stream
      // The SDK expects answers to be passed via the AskUserQuestion tool's response mechanism
      this.inputStreamManager.send({
        type: 'user',
        message: {
          role: 'user',
          content: answerText,
        },
        parent_tool_use_id: null,
        session_id: 'default',
      });

      // Wait a bit for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      logger.error('Error processing action:', error);
      throw error;
    }
  }

  private async processSDKMessage(msg: SDKMessage): Promise<void> {
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
        const textBlocks = content.filter((block: unknown): block is { type: 'text'; text: string } =>
          typeof block === 'object' && block !== null && 'type' in block && block.type === 'text'
        );

        if (textBlocks.length > 0) {
          const text = textBlocks.map((block: { type: 'text'; text: string }) => block.text).join('\n');
          if (text.trim()) {
            const assistantMessage = this.addMessage('assistant', text);
            sessionService.broadcastMessageUpdate(assistantMessage);
          }
        }

        // Check for tool uses
        const toolUses = content.filter((block: unknown): block is { type: 'tool_use'; name: string; input: unknown; id?: string } =>
          typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_use'
        );

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
      } else if (msg.type === 'user') {
        // Process tool results from SDK
        const content = msg.message?.content || [];
        const toolResults = content.filter((block: unknown): block is {
          type: 'tool_result';
          tool_use_id: string;
          content: unknown;
          is_error?: boolean;
        } =>
          typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_result'
        );

        for (const toolResult of toolResults) {
          // Format tool result content
          let resultContent = '';
          if (typeof toolResult.content === 'string') {
            resultContent = toolResult.content;
          } else if (Array.isArray(toolResult.content)) {
            // Extract text from content blocks
            const textBlocks = toolResult.content.filter((block: unknown): block is { type: 'text'; text: string } =>
              typeof block === 'object' && block !== null && 'type' in block && block.type === 'text'
            );
            resultContent = textBlocks.map((block: { type: 'text'; text: string }) => block.text).join('\n');
          } else if (toolResult.content && typeof toolResult.content === 'object') {
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
          this.activeToolExecutions = this.activeToolExecutions.filter(
            msg => msg.toolUseId !== toolResult.tool_use_id
          );
        }

        // Log other user messages
        if (toolResults.length === 0) {
          logger.debug('User message from SDK (non-tool-result):', msg);
        }
      } else if (msg.type === 'result') {
        // Query completed
        if (msg.subtype === 'success') {
          logger.info('Query completed successfully');
        } else {
          logger.warn('Query completed with errors:', msg.errors);
        }
        this.setStatus('stable');
      }
    } catch (error) {
      logger.error('Error processing SDK message:', error);
    }
  }

  private async handleSystemMessage(msg: { type: 'system'; subtype?: string; [key: string]: unknown }): Promise<void> {
    if (msg.subtype === 'init') {
      logger.info('System init message received');

      // Check MCP server connection status
      if ('mcp_servers' in msg && Array.isArray(msg.mcp_servers)) {
        const mcpServers = msg.mcp_servers as Array<{
          name: string;
          status: string;
          error?: string;
        }>;

        for (const server of mcpServers) {
          if (server.status === 'connected') {
            logger.info(`✓ MCP server '${server.name}' connected successfully`);
          } else if (server.status === 'failed') {
            logger.error(`✗ MCP server '${server.name}' failed to connect${server.error ? `: ${server.error}` : ''}`);
          } else {
            logger.warn(`⚠ MCP server '${server.name}' status: ${server.status}`);
          }
        }
      }
    }
  }

  private async handleToolUse(toolUse: { name: string; input: unknown }): Promise<void> {
    const { name, input } = toolUse;

    if (name === 'AskUserQuestion') {
      // Format as a question message
      const questionText = this.formatQuestion(input);
      const questionMessage = this.addMessage('assistant', questionText, 'question');
      sessionService.broadcastMessageUpdate(questionMessage);
      logger.info('AskUserQuestion detected and broadcasted');
    } else if (name === 'ExitPlanMode') {
      // Format as a plan message
      const planText = this.formatPlan(input);
      const planMessage = this.addMessage('assistant', planText, 'plan');
      sessionService.broadcastMessageUpdate(planMessage);
      logger.info('ExitPlanMode detected and broadcasted');
    }
  }

  private formatToolUse(toolUse: { name: string; input: unknown; id?: string }): string {
    return JSON.stringify({
      type: 'tool_use',
      name: toolUse.name,
      id: toolUse.id,
      input: toolUse.input,
    }, null, 2);
  }

  private formatQuestion(input: unknown): string {
    // Format AskUserQuestion input as readable text
    if (typeof input === 'string') {
      return `❓ Question: ${input}`;
    }

    if (typeof input === 'object' && input !== null && 'questions' in input) {
      const { questions } = input as { questions: unknown };
      if (Array.isArray(questions)) {
        const formatted = questions.map((q: unknown, idx: number) => {
          if (typeof q === 'object' && q !== null && 'question' in q) {
            const question = q as { question: string; options?: unknown[] };
            let text = `\n**Question ${idx + 1}**: ${question.question}\n`;
            if (question.options && Array.isArray(question.options)) {
              text += question.options.map((opt: unknown, optIdx: number) => {
                if (typeof opt === 'object' && opt !== null && 'label' in opt) {
                  const option = opt as { label: string; description?: string };
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

  private formatPlan(input: unknown): string {
    // Format ExitPlanMode input as readable text
    if (typeof input === 'string') {
      return `📋 Plan ready for approval:\n${input}`;
    }

    return `📋 Plan ready for approval:\n${JSON.stringify(input, null, 2)}`;
  }

  private recordResultMetrics(msg: { type: 'result'; [key: string]: unknown }): void {
    const metricsService = getMetricsService();
    if (!metricsService) return;

    try {
      const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

      // Record cost if available
      if ('total_cost_usd' in msg && typeof msg.total_cost_usd === 'number') {
        metricsService.recordCost(msg.total_cost_usd, model);
      }

      // Record token usage if available
      if ('usage' in msg && typeof msg.usage === 'object' && msg.usage !== null) {
        const usage = msg.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };

        metricsService.recordTokenUsage(
          {
            input: usage.input_tokens,
            output: usage.output_tokens,
            cacheRead: usage.cache_read_input_tokens,
            cacheCreation: usage.cache_creation_input_tokens,
          },
          model
        );
      }

      // Record model usage if available
      if ('modelUsage' in msg && typeof msg.modelUsage === 'object' && msg.modelUsage !== null) {
        const modelUsage = msg.modelUsage as Record<string, {
          inputTokens?: number;
          outputTokens?: number;
          cacheReadInputTokens?: number;
          cacheCreationInputTokens?: number;
          costUSD?: number;
        }>;

        for (const [modelName, usage] of Object.entries(modelUsage)) {
          if (usage.costUSD) {
            metricsService.recordCost(usage.costUSD, modelName);
          }

          metricsService.recordTokenUsage(
            {
              input: usage.inputTokens,
              output: usage.outputTokens,
              cacheRead: usage.cacheReadInputTokens,
              cacheCreation: usage.cacheCreationInputTokens,
            },
            modelName
          );
        }
      }
    } catch (error) {
      logger.error('Error recording result metrics:', error);
    }
  }

  private recordToolMetrics(toolName: string, input: unknown): void {
    const metricsService = getMetricsService();
    if (!metricsService) return;

    try {
      // Record code edit tool usage
      if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
        // Extract language from file path if available
        let language = 'unknown';
        if (typeof input === 'object' && input !== null && 'file_path' in input) {
          const filePath = (input as { file_path: unknown }).file_path;
          if (typeof filePath === 'string') {
            const ext = filePath.split('.').pop()?.toLowerCase();
            const languageMap: Record<string, string> = {
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
        metricsService.recordCodeEditToolDecision(
          toolName as 'Edit' | 'Write' | 'NotebookEdit',
          'accept',
          language
        );
      }

      // Record lines of code for Edit and Write tools
      if (toolName === 'Write' && typeof input === 'object' && input !== null && 'content' in input) {
        const content = (input as { content: unknown }).content;
        if (typeof content === 'string') {
          const lines = content.split('\n').length;
          metricsService.recordLinesOfCode(lines, 0);
        }
      }
    } catch (error) {
      logger.error('Error recording tool metrics:', error);
    }
  }

  private addMessage(
    role: 'user' | 'assistant' | 'agent' | 'tool_result',
    content: string,
    type?: 'normal' | 'question' | 'plan',
    options?: {
      toolUseId?: string;
      parentToolUseId?: string;
      status?: 'success' | 'error';
      error?: string;
    }
  ): Message {
    const message: Message = {
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

  private generateMessageId(): number {
    return this.messageIdCounter++;
  }

  private setStatus(status: AgentStatus): void {
    if (this.status !== status) {
      this.status = status;
      sessionService.broadcastStatusChange(status);
      logger.info(`Agent status changed to: ${status}`);
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getActiveToolExecutions(): Message[] {
    return [...this.activeToolExecutions];
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up agent service...');

    // Interrupt the query if it's still running
    if (this.query) {
      try {
        await this.query.interrupt();
      } catch (error) {
        logger.error('Error interrupting query:', error);
      }
    }

    // Wait for query processor to finish
    if (this.queryProcessorPromise) {
      try {
        await this.queryProcessorPromise;
      } catch (error) {
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
