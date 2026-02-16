import { query, type SDKMessage, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
import { sessionService } from './session.js';
import { logger } from '../utils/logger.js';
import { resolveConfig } from '../utils/config.js';
import { getMetricsService } from './metrics.js';
import { createWriteStream, type WriteStream } from 'fs';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

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
  private pendingQuestionToolUseId: string | null = null;
  private pendingQuestionInput: unknown | null = null;
  private pendingQuestionResolve: ((value: unknown) => void) | null = null;
  private pendingPlanToolUseId: string | null = null;
  private pendingPlanInput: unknown | null = null;
  private pendingPlanResolve: ((value: boolean) => void) | null = null;
  private outputFileStream: WriteStream | null = null;

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Claude Agent SDK with v1 API...');

      // Initialize output file stream if specified
      const outputFile = process.env.STREAM_JSON_OUTPUT_FILE;
      if (outputFile) {
        try {
          // Ensure the directory exists
          const dir = dirname(outputFile);
          await mkdir(dir, { recursive: true });

          // Create write stream
          this.outputFileStream = createWriteStream(outputFile, { flags: 'a' });
          logger.info(`Stream JSON output will be written to: ${outputFile}`);
        } catch (error) {
          logger.error(`Failed to create output file stream: ${error}`);
          throw error;
        }
      }

      // Resolve configuration from .claude/config.json and environment variables
      const config = await resolveConfig();

      const model = process.env.ANTHROPIC_MODEL || 'default';

      // Build query options with v1 API
      const queryOptions: Parameters<typeof query>[0] = {
        prompt: '', // Initial empty prompt - we'll use streaming input
        options: {
          model,
          cwd: config.workingDirectory,
          permissionMode: config.permissionMode,
        },
      };

      // Add pathToClaudeCodeExecutable if configured via environment variable
      if (process.env.CLAUDE_CODE_EXECUTABLE_PATH) {
        logger.info(`Using custom Claude Code executable: ${process.env.CLAUDE_CODE_EXECUTABLE_PATH}`);
        queryOptions.options!.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_EXECUTABLE_PATH;
      }

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

      // Add environment variables
      // Filter and pass Claude Code related environment variables from parent process
      const claudeEnvVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        // Only pass environment variables that are relevant to Claude Code
        if (value !== undefined && (
          key.startsWith('CLAUDE_') ||
          key.startsWith('ANTHROPIC_') ||
          key.startsWith('AWS_') ||
          key === 'DEBUG' ||
          key === 'NODE_ENV'
        )) {
          claudeEnvVars[key] = value;
        }
      }

      // Merge with config.env (config.env takes precedence)
      queryOptions.options!.env = {
        ...claudeEnvVars,
        ...config.env,
      };

      const totalEnvVars = Object.keys(queryOptions.options!.env).length;
      const customEnvVars = config.env ? Object.keys(config.env).length : 0;
      if (totalEnvVars > 0) {
        logger.info(`Configuring ${totalEnvVars} environment variable(s) (${customEnvVars} custom, ${totalEnvVars - customEnvVars} inherited)`);
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

      // Add canUseTool callback to handle AskUserQuestion and ExitPlanMode without timeout
      queryOptions.options!.canUseTool = async (toolName: string, toolInput: unknown) => {
        logger.debug('canUseTool callback triggered', {
          tool_name: toolName,
          has_input: !!toolInput,
        });

        if (toolName === 'AskUserQuestion') {
          logger.info('AskUserQuestion detected in canUseTool, waiting for user response...');

          // Create a promise that will be resolved when user sends answer via /action
          const answerPromise = new Promise<unknown>((resolve) => {
            this.pendingQuestionResolve = resolve;
          });

          // Wait indefinitely for user response (no timeout)
          const answers = await answerPromise;

          logger.info('User answer received, returning to SDK', {
            answers_preview: JSON.stringify(answers).substring(0, 200),
          });

          // Return permission result with user answers merged into the original input
          // This preserves the original 'questions' field while adding 'answers'
          const mergedInput = typeof toolInput === 'object' && toolInput !== null
            ? { ...toolInput as Record<string, unknown>, answers }
            : { answers };

          return {
            behavior: 'allow' as const,
            updatedInput: mergedInput as Record<string, unknown>,
          };
        }

        if (toolName === 'ExitPlanMode') {
          logger.info('ExitPlanMode detected in canUseTool, waiting for user approval...');

          // Create a promise that will be resolved when user sends approval via /action
          const approvalPromise = new Promise<boolean>((resolve) => {
            this.pendingPlanResolve = resolve;
          });

          // Wait indefinitely for user approval (no timeout)
          const approved = await approvalPromise;

          logger.info('User plan approval received, returning to SDK', {
            approved,
          });

          if (!approved) {
            // User rejected the plan
            return {
              behavior: 'deny' as const,
              message: 'User rejected the plan',
            };
          }

          // User approved the plan
          return {
            behavior: 'allow' as const,
            updatedInput: toolInput as Record<string, unknown> | undefined,
          };
        }

        // For all other tools, allow execution
        return {
          behavior: 'allow' as const,
          updatedInput: toolInput as Record<string, unknown> | undefined,
        };
      };

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

      // クエリプロセッサーでエラーが発生した場合、pending 状態をクリア
      if (this.pendingQuestionToolUseId || this.pendingPlanToolUseId || this.activeToolExecutions.length > 0) {
        logger.warn('Clearing pending states and active tool executions due to query processor error', {
          pending_question: !!this.pendingQuestionToolUseId,
          pending_plan: !!this.pendingPlanToolUseId,
          active_tools: this.activeToolExecutions.length,
        });

        this.pendingQuestionToolUseId = null;
        this.pendingQuestionInput = null;
        this.pendingQuestionResolve = null;
        this.pendingPlanToolUseId = null;
        this.pendingPlanInput = null;
        this.pendingPlanResolve = null;
        this.activeToolExecutions = [];
      }

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

  async sendAction(answers: Record<string, string | string[]>): Promise<void> {
    logger.debug('sendAction called', {
      answers_keys: Object.keys(answers),
      current_status: this.status,
      has_pending_question: !!this.pendingQuestionToolUseId,
      has_input_stream: !!this.inputStreamManager,
    });

    if (!this.inputStreamManager) {
      const error = new Error('Agent not initialized');
      logger.error('sendAction failed: Agent not initialized', {
        stack: error.stack,
      });
      throw error;
    }

    if (this.status !== 'running') {
      const error = new Error('No active question to answer');
      logger.error('sendAction failed: Agent not running', {
        current_status: this.status,
        stack: error.stack,
      });
      throw error;
    }

    if (!this.pendingQuestionToolUseId) {
      const error = new Error('No pending question to answer');
      logger.error('sendAction failed: No pending question', {
        has_pending_plan: !!this.pendingPlanToolUseId,
        stack: error.stack,
      });
      throw error;
    }

    try {
      const toolUseId = this.pendingQuestionToolUseId;
      logger.info('Sending action response to agent', {
        answers_count: Object.keys(answers).length,
        tool_use_id: toolUseId,
      });

      // Add user message to history for tracking
      const answerText = `Answers: ${JSON.stringify(answers, null, 2)}`;
      const userMessage = this.addMessage('user', answerText);
      sessionService.broadcastMessageUpdate(userMessage);
      logger.debug('User answer message created and broadcasted', { message_id: userMessage.id });

      // Resolve the canUseTool promise with the answers
      if (this.pendingQuestionResolve) {
        logger.info('Resolving canUseTool promise with user answers', {
          tool_use_id: toolUseId,
          answers_preview: JSON.stringify(answers).substring(0, 200),
        });

        this.pendingQuestionResolve(answers);
        this.pendingQuestionResolve = null;
      } else {
        logger.warn('No pending question resolve function found');
      }

      // Clear the pending question
      this.pendingQuestionToolUseId = null;
      this.pendingQuestionInput = null;

      logger.debug('Pending question cleared', {
        has_pending_question: !!this.pendingQuestionToolUseId,
      });

    } catch (error) {
      logger.error('Error processing action', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        tool_use_id: this.pendingQuestionToolUseId,
        answers: JSON.stringify(answers),
      });
      throw error;
    }
  }

  async approvePlan(approved: boolean): Promise<void> {
    logger.debug('approvePlan called', {
      approved,
      current_status: this.status,
      has_pending_plan: !!this.pendingPlanToolUseId,
      has_input_stream: !!this.inputStreamManager,
    });

    if (!this.inputStreamManager) {
      const error = new Error('Agent not initialized');
      logger.error('approvePlan failed: Agent not initialized', {
        stack: error.stack,
      });
      throw error;
    }

    if (this.status !== 'running') {
      const error = new Error('No active plan to approve');
      logger.error('approvePlan failed: Agent not running', {
        current_status: this.status,
        stack: error.stack,
      });
      throw error;
    }

    if (!this.pendingPlanToolUseId) {
      const error = new Error('No pending plan to approve');
      logger.error('approvePlan failed: No pending plan', {
        has_pending_question: !!this.pendingQuestionToolUseId,
        stack: error.stack,
      });
      throw error;
    }

    try {
      const toolUseId = this.pendingPlanToolUseId;
      logger.info('Sending plan approval response to agent', {
        approved,
        tool_use_id: toolUseId,
      });

      // Add user message to history for tracking
      const approvalText = approved ? '✅ Plan approved' : '❌ Plan rejected';
      const userMessage = this.addMessage('user', approvalText);
      sessionService.broadcastMessageUpdate(userMessage);
      logger.debug('User approval message created and broadcasted', { message_id: userMessage.id });

      // Resolve the canUseTool promise with the approval status
      if (this.pendingPlanResolve) {
        logger.info('Resolving canUseTool promise with plan approval', {
          tool_use_id: toolUseId,
          approved,
        });

        this.pendingPlanResolve(approved);
        this.pendingPlanResolve = null;
      } else {
        logger.warn('No pending plan resolve function found');
      }

      // Clear the pending plan
      this.pendingPlanToolUseId = null;
      this.pendingPlanInput = null;

      logger.debug('Pending plan cleared', {
        has_pending_plan: !!this.pendingPlanToolUseId,
      });

    } catch (error) {
      logger.error('Error processing plan approval', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        tool_use_id: this.pendingPlanToolUseId,
        approved,
      });
      throw error;
    }
  }

  async stopAgent(): Promise<void> {
    if (!this.query) {
      throw new Error('Agent not initialized');
    }

    try {
      logger.info('Stopping agent...');

      // Interrupt the query
      await this.query.interrupt();

      // Clear pending states and active tool executions
      if (this.pendingQuestionToolUseId || this.pendingPlanToolUseId || this.activeToolExecutions.length > 0) {
        logger.info('Clearing pending states and active tool executions due to agent stop', {
          pending_question: !!this.pendingQuestionToolUseId,
          pending_plan: !!this.pendingPlanToolUseId,
          active_tools: this.activeToolExecutions.length,
        });

        this.pendingQuestionToolUseId = null;
        this.pendingQuestionInput = null;
        this.pendingQuestionResolve = null;
        this.pendingPlanToolUseId = null;
        this.pendingPlanInput = null;
        this.pendingPlanResolve = null;
        this.activeToolExecutions = [];
      }

      // Set status to stable
      this.setStatus('stable');

      logger.info('Agent stopped successfully');
    } catch (error) {
      logger.error('Error stopping agent:', error);
      throw error;
    }
  }

  private async processSDKMessage(msg: SDKMessage): Promise<void> {
    try {
      logger.debug('Processing SDK message:', JSON.stringify(msg, null, 2));

      // Write to output file if stream is configured
      if (this.outputFileStream) {
        try {
          this.outputFileStream.write(JSON.stringify(msg) + '\n');
        } catch (error) {
          logger.error('Failed to write to output file:', error);
        }
      }

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
        try {
          logger.debug('Processing assistant message', {
            has_content: !!msg.message?.content,
            content_length: Array.isArray(msg.message?.content) ? msg.message.content.length : 0,
          });

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
              logger.debug('Assistant text message broadcasted', { message_id: assistantMessage.id });
            }
          }

          // Check for tool uses
          const toolUses = content.filter((block: unknown): block is { type: 'tool_use'; name: string; input: unknown; id?: string } =>
            typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_use'
          );

          logger.debug('Found tool uses in assistant message', { count: toolUses.length });

          for (const toolUse of toolUses) {
            try {
              logger.debug('Processing tool use', {
                name: toolUse.name,
                id: toolUse.id,
                has_input: !!toolUse.input,
              });

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
            } catch (toolError) {
              logger.error('Error processing individual tool use', {
                tool_name: toolUse.name,
                tool_id: toolUse.id,
                error: toolError instanceof Error ? toolError.message : String(toolError),
                stack: toolError instanceof Error ? toolError.stack : undefined,
              });
              throw toolError;
            }
          }
        } catch (assistantError) {
          logger.error('Error processing assistant message', {
            error: assistantError instanceof Error ? assistantError.message : String(assistantError),
            stack: assistantError instanceof Error ? assistantError.stack : undefined,
            message_preview: JSON.stringify(msg).substring(0, 500),
          });
          throw assistantError;
        }
      } else if (msg.type === 'user') {
        try {
          logger.debug('Processing user message', {
            has_content: !!msg.message?.content,
          });

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

          logger.debug('Found tool results in user message', { count: toolResults.length });

          for (const toolResult of toolResults) {
            try {
              logger.debug('Processing tool result', {
                tool_use_id: toolResult.tool_use_id,
                is_error: !!toolResult.is_error,
                content_type: typeof toolResult.content,
              });

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
            } catch (toolResultError) {
              logger.error('Error processing individual tool result', {
                tool_use_id: toolResult.tool_use_id,
                error: toolResultError instanceof Error ? toolResultError.message : String(toolResultError),
                stack: toolResultError instanceof Error ? toolResultError.stack : undefined,
              });
              throw toolResultError;
            }
          }

          // Log other user messages
          if (toolResults.length === 0) {
            logger.debug('User message from SDK (non-tool-result):', msg);
          }
        } catch (userError) {
          logger.error('Error processing user message', {
            error: userError instanceof Error ? userError.message : String(userError),
            stack: userError instanceof Error ? userError.stack : undefined,
          });
          throw userError;
        }
      } else if (msg.type === 'result') {
        // Query completed
        if (msg.subtype === 'success') {
          logger.info('Query completed successfully');

          // AskUserQuestion, ExitPlanMode が pending の場合、またはツールが実行中の場合は stable にしない
          if (!this.pendingQuestionToolUseId && !this.pendingPlanToolUseId && this.activeToolExecutions.length === 0) {
            this.setStatus('stable');
          } else {
            logger.info('Keeping status as running due to pending user interaction or active tool executions', {
              has_pending_question: !!this.pendingQuestionToolUseId,
              has_pending_plan: !!this.pendingPlanToolUseId,
              active_tool_executions: this.activeToolExecutions.length,
            });
          }
        } else {
          // エラー時は pending 状態とツール実行をクリアして stable に戻す
          logger.warn('Query completed with errors:', msg.errors);

          if (this.pendingQuestionToolUseId || this.pendingPlanToolUseId || this.activeToolExecutions.length > 0) {
            logger.warn('Clearing pending states and active tool executions due to error', {
              pending_question: !!this.pendingQuestionToolUseId,
              pending_plan: !!this.pendingPlanToolUseId,
              active_tools: this.activeToolExecutions.length,
            });

            this.pendingQuestionToolUseId = null;
            this.pendingQuestionInput = null;
            this.pendingQuestionResolve = null;
            this.pendingPlanToolUseId = null;
            this.pendingPlanInput = null;
            this.pendingPlanResolve = null;
            this.activeToolExecutions = [];
          }

          this.setStatus('stable');
        }
      }
    } catch (error) {
      logger.error('Error processing SDK message', {
        message_type: msg.type,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
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

  private async handleToolUse(toolUse: { name: string; input: unknown; id?: string }): Promise<void> {
    const { name, input, id } = toolUse;

    if (name === 'AskUserQuestion') {
      try {
        logger.info('AskUserQuestion tool use detected', {
          tool_use_id: id,
          input_type: typeof input,
          input_preview: JSON.stringify(input).substring(0, 200),
        });

        // Save the tool_use_id and input for later response
        this.pendingQuestionToolUseId = id || null;
        this.pendingQuestionInput = input;

        logger.info('Saved pending question', {
          tool_use_id: this.pendingQuestionToolUseId,
          has_input: !!this.pendingQuestionInput,
        });

        // Format as a question message
        const questionText = this.formatQuestion(input);
        const questionMessage = this.addMessage('assistant', questionText, 'question');
        sessionService.broadcastMessageUpdate(questionMessage);

        logger.info('AskUserQuestion detected and broadcasted successfully', {
          tool_use_id: id,
          message_id: questionMessage.id,
          current_status: this.status,
        });
      } catch (error) {
        logger.error('Error handling AskUserQuestion', {
          tool_use_id: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          input: JSON.stringify(input),
        });
        throw error;
      }
    } else if (name === 'ExitPlanMode') {
      try {
        logger.info('ExitPlanMode tool use detected', {
          tool_use_id: id,
          input_type: typeof input,
        });

        // Save the tool_use_id and input for later response
        this.pendingPlanToolUseId = id || null;
        this.pendingPlanInput = input;

        // Format as a plan message
        const planText = this.formatPlan(input);
        const planMessage = this.addMessage('assistant', planText, 'plan');
        sessionService.broadcastMessageUpdate(planMessage);

        logger.info('ExitPlanMode detected and broadcasted successfully', {
          tool_use_id: id,
          message_id: planMessage.id,
        });
      } catch (error) {
        logger.error('Error handling ExitPlanMode', {
          tool_use_id: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
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
    try {
      logger.debug('Formatting question', { input_type: typeof input });

      // Format AskUserQuestion input as readable text
      if (typeof input === 'string') {
        return `❓ Question: ${input}`;
      }

      if (typeof input === 'object' && input !== null && 'questions' in input) {
        const { questions } = input as { questions: unknown };
        logger.debug('Questions field found', {
          is_array: Array.isArray(questions),
          length: Array.isArray(questions) ? questions.length : 'N/A',
        });

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

      logger.debug('Using fallback JSON formatting for question');
      return `❓ Question: ${JSON.stringify(input, null, 2)}`;
    } catch (error) {
      logger.error('Error formatting question', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        input: String(input),
      });
      return `❓ Question: [Error formatting question: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  private formatPlan(input: unknown): string {
    // Format ExitPlanMode input as JSON
    if (typeof input === 'string') {
      return input;
    }

    return JSON.stringify(input, null, 2);
  }

  private recordResultMetrics(msg: { type: 'result'; [key: string]: unknown }): void {
    const metricsService = getMetricsService();
    if (!metricsService) return;

    try {
      const model = process.env.ANTHROPIC_MODEL || 'default';

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

  /**
   * Get messages with pagination/filtering options
   * @param options Pagination options
   * @returns Filtered messages and metadata
   */
  getMessagesWithPagination(options: {
    limit?: number;
    direction?: 'head' | 'tail';
    around?: number;
    context?: number;
    after?: number;
    before?: number;
  }): {
    messages: Message[];
    total: number;
    hasMore: boolean;
  } {
    const total = this.messages.length;
    let messages: Message[];
    let hasMore = false;

    // Case 1: Get messages around a specific ID
    if (options.around !== undefined) {
      const targetIndex = this.messages.findIndex(m => m.id === options.around);

      if (targetIndex === -1) {
        // ID not found, return empty
        return { messages: [], total, hasMore: false };
      }

      const contextCount = options.context ?? 10; // Default to 10 messages before/after
      const startIndex = Math.max(0, targetIndex - contextCount);
      const endIndex = Math.min(total, targetIndex + contextCount + 1);

      messages = this.messages.slice(startIndex, endIndex);
      hasMore = startIndex > 0 || endIndex < total;
    }
    // Case 2: Cursor-based pagination (after/before) - check before limit to avoid conflict
    else if (options.after !== undefined || options.before !== undefined) {
      if (options.after !== undefined) {
        // Get messages with ID > after (excluding after itself)
        const afterIndex = this.messages.findIndex(m => m.id === options.after);

        if (afterIndex === -1) {
          // ID not found - return empty for safety
          return { messages: [], total, hasMore: false };
        }

        // Start from next message after the cursor
        const startIndex = afterIndex + 1;
        const limit = options.limit ?? total; // If no limit, get all remaining
        const endIndex = Math.min(total, startIndex + limit);

        messages = this.messages.slice(startIndex, endIndex);
        hasMore = endIndex < total; // More messages exist after endIndex
      } else {
        // options.before !== undefined
        // Get messages with ID < before (excluding before itself)
        const beforeIndex = this.messages.findIndex(m => m.id === options.before);

        if (beforeIndex === -1) {
          // ID not found - return empty for safety
          return { messages: [], total, hasMore: false };
        }

        // Get messages before the cursor
        const limit = options.limit ?? beforeIndex; // If no limit, get all preceding
        const startIndex = Math.max(0, beforeIndex - limit);
        const endIndex = beforeIndex; // Exclude the before message itself

        messages = this.messages.slice(startIndex, endIndex);
        hasMore = startIndex > 0; // More messages exist before startIndex
      }
    }
    // Case 3: Get first/last n messages
    else if (options.limit !== undefined) {
      const limit = options.limit;
      const direction = options.direction ?? 'tail'; // Default to tail (most recent)

      if (direction === 'head') {
        // Get first n messages
        messages = this.messages.slice(0, limit);
        hasMore = total > limit;
      } else {
        // Get last n messages (most recent)
        const startIndex = Math.max(0, total - limit);
        messages = this.messages.slice(startIndex);
        hasMore = startIndex > 0;
      }
    }
    // Case 4: Get all messages (no pagination)
    else {
      messages = [...this.messages];
      hasMore = false;
    }

    return { messages, total, hasMore };
  }

  getActiveToolExecutions(): Message[] {
    return [...this.activeToolExecutions];
  }

  getPendingActions(): Array<{ type: string; tool_use_id: string; content: unknown }> {
    const pending: Array<{ type: string; tool_use_id: string; content: unknown }> = [];

    if (this.pendingQuestionToolUseId && this.pendingQuestionInput) {
      pending.push({
        type: 'answer_question',
        tool_use_id: this.pendingQuestionToolUseId,
        content: this.pendingQuestionInput,
      });
    }

    if (this.pendingPlanToolUseId && this.pendingPlanInput) {
      pending.push({
        type: 'approve_plan',
        tool_use_id: this.pendingPlanToolUseId,
        content: this.pendingPlanInput,
      });
    }

    return pending;
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

    // Close output file stream
    if (this.outputFileStream) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.outputFileStream!.end((error?: Error | null) => {
            if (error) {
              logger.error('Error closing output file stream:', error);
              reject(error);
            } else {
              logger.info('Output file stream closed');
              resolve();
            }
          });
        });
      } catch (error) {
        logger.error('Failed to close output file stream:', error);
      }
    }

    // Clear all pending states and active tool executions
    if (this.pendingQuestionToolUseId || this.pendingPlanToolUseId || this.activeToolExecutions.length > 0) {
      logger.info('Clearing pending states and active tool executions during cleanup', {
        pending_question: !!this.pendingQuestionToolUseId,
        pending_plan: !!this.pendingPlanToolUseId,
        active_tools: this.activeToolExecutions.length,
      });

      this.pendingQuestionToolUseId = null;
      this.pendingQuestionInput = null;
      this.pendingQuestionResolve = null;
      this.pendingPlanToolUseId = null;
      this.pendingPlanInput = null;
      this.pendingPlanResolve = null;
      this.activeToolExecutions = [];
    }

    // Record session end metrics
    const metricsService = getMetricsService();
    if (metricsService) {
      metricsService.recordSessionEnd();
    }
  }
}

export const agentService = new AgentService();
