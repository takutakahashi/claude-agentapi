import { query, type SDKMessage, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';
import { resolveConfig } from '../utils/config.js';

const MAX_MESSAGE_HISTORY = parseInt(process.env.MAX_MESSAGE_HISTORY || '100', 10);

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

      // Create input stream manager
      this.inputStreamManager = new InputStreamManager();

      // Create query with streaming input
      this.query = query({
        prompt: this.inputStreamManager.stream(),
        options: queryOptions.options,
      });

      // Start processing query responses in the background
      this.queryProcessorPromise = this.processQuery();

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

  private async processSDKMessage(msg: SDKMessage): Promise<void> {
    try {
      logger.debug('Processing SDK message:', JSON.stringify(msg, null, 2));

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
          const agentMessage = this.addMessage('agent', toolUseMessage);
          sessionService.broadcastMessageUpdate(agentMessage);

          // Handle special tool uses
          await this.handleToolUse(toolUse);
        }

        // After processing assistant message, set status back to stable
        this.setStatus('stable');
      } else if (msg.type === 'user') {
        // This might be tool results or other user messages
        logger.debug('User message from SDK:', msg);
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

  private addMessage(role: 'user' | 'assistant' | 'agent', content: string, type?: 'normal' | 'question' | 'plan'): Message {
    const message: Message = {
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
  }
}

export const agentService = new AgentService();
