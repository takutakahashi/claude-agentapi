import { Router } from 'express';
import { agentService } from '../services/agent.js';
import { PostMessageRequestSchema } from '../types/api.js';
import type { PostMessageResponse, ProblemJson } from '../types/api.js';
import { logger } from '../utils/logger.js';
import { parseCommandFromMessage, executeCommand } from '../services/command.js';
import { resolveConfig } from '../utils/config.js';

const router = Router();

router.post('/message', async (req, res) => {
  try {
    // Validate request body
    const validation = PostMessageRequestSchema.safeParse(req.body);

    if (!validation.success) {
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: validation.error.message,
      };
      return res.status(400).json(error);
    }

    const { content, type } = validation.data;

    if (type === 'user') {
      // Check if agent is stable
      if (agentService.getStatus() !== 'stable') {
        const error: ProblemJson = {
          type: 'about:blank',
          title: 'Agent is busy',
          status: 409,
          detail: 'The agent is currently processing another request. Please wait until it becomes stable.',
        };
        return res.status(409).json(error);
      }

      // Check if message is a command invocation
      const commandName = parseCommandFromMessage(content);
      if (commandName) {
        // Get configuration to check if command exists
        const config = await resolveConfig();
        const commandConfig = config.commands?.[commandName];

        if (commandConfig) {
          logger.info(`Executing command: /${commandName}`);
          try {
            const result = await executeCommand(commandName, commandConfig);

            // Send command output as a message to the agent
            const outputMessage = `Command /${commandName} executed:\n\nExit code: ${result.exitCode}\n\nOutput:\n${result.stdout}\n${result.stderr ? `\nErrors:\n${result.stderr}` : ''}`;
            await agentService.sendMessage(outputMessage);

            const response: PostMessageResponse = { ok: true };
            return res.json(response);
          } catch (error) {
            logger.error(`Command /${commandName} failed:`, error);
            const errorMessage = `Command /${commandName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            await agentService.sendMessage(errorMessage);

            const response: PostMessageResponse = { ok: true };
            return res.json(response);
          }
        } else {
          // Command not found, send as regular message to agent
          logger.debug(`Command /${commandName} not found in configuration, sending as regular message`);
        }
      }

      // Send message to agent (either regular message or unrecognized command)
      await agentService.sendMessage(content);

      const response: PostMessageResponse = { ok: true };
      return res.json(response);
    } else if (type === 'raw') {
      // Raw messages (direct terminal input) are not yet implemented
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Not implemented',
        status: 501,
        detail: 'Raw message type is not yet implemented.',
      };
      return res.status(501).json(error);
    } else {
      // This should never happen due to schema validation
      const error: ProblemJson = {
        type: 'about:blank',
        title: 'Invalid message type',
        status: 400,
        detail: `Invalid message type: ${type}`,
      };
      return res.status(400).json(error);
    }
  } catch (error) {
    logger.error('Error processing message:', error);

    const problemJson: ProblemJson = {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return res.status(500).json(problemJson);
  }
});

export default router;
