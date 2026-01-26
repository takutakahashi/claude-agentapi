import { unstable_v2_createSession, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';

const MAX_MESSAGE_HISTORY = parseInt(process.env.MAX_MESSAGE_HISTORY || '100', 10);

export class AgentService {
  private session: Awaited<ReturnType<typeof unstable_v2_createSession>> | null = null;
  private status: AgentStatus = 'stable';
  private messages: Message[] = [];
  private messageIdCounter = 0;

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Claude Agent SDK session...');

      const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

      // Configure working directory
      const workingDirectory = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
      logger.info(`Working directory: ${workingDirectory}`);

      // Configure permission mode
      let permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' = 'default';

      // Check for dangerously-skip-permissions flag
      if (process.env.DANGEROUSLY_SKIP_PERMISSIONS === 'true') {
        permissionMode = 'bypassPermissions';
        logger.warn('⚠️  WARNING: All permission checks are disabled (bypassPermissions mode)');
      } else if (process.env.CLAUDE_PERMISSION_MODE) {
        // Use the permission mode from environment variable
        const mode = process.env.CLAUDE_PERMISSION_MODE;
        if (mode === 'default' || mode === 'acceptEdits' || mode === 'bypassPermissions') {
          permissionMode = mode;
          logger.info(`Permission mode: ${permissionMode}`);
        } else {
          logger.warn(`Invalid permission mode: ${mode}. Using default.`);
        }
      } else {
        logger.info(`Permission mode: ${permissionMode}`);
      }

      // Note: workingDirectory and permissionMode are supported by the SDK
      // but may not be in the current type definitions
      this.session = await unstable_v2_createSession({
        model,
        workingDirectory,
        permissionMode,
        // Bedrock support is controlled via CLAUDE_CODE_USE_BEDROCK environment variable
        // Additional configuration can be added here as needed
      } as Parameters<typeof unstable_v2_createSession>[0]);

      logger.info('Claude Agent SDK session initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Claude Agent SDK session:', error);
      throw error;
    }
  }

  async sendMessage(content: string): Promise<void> {
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
      } else if (msg.type === 'user') {
        // This might be tool results or other user messages
        logger.debug('User message from SDK:', msg);
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
    // Add any cleanup logic if needed
  }
}

export const agentService = new AgentService();
