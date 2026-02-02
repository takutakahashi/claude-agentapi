import { spawn } from 'child_process';
import type { CommandConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

/**
 * Execute a command and return the output
 */
export async function executeCommand(
  name: string,
  config: CommandConfig
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  logger.info(`Executing command: ${name}`);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...config.env,
    };

    const childProcess = spawn(config.command, config.args || [], {
      env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('error', (error) => {
      logger.error(`Command ${name} failed:`, error);
      reject(error);
    });

    childProcess.on('close', (code) => {
      logger.info(`Command ${name} exited with code ${code}`);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

/**
 * Parse message content to check if it's a command invocation
 * Returns command name if message starts with /command-name, otherwise null
 */
export function parseCommandFromMessage(content: string): string | null {
  const trimmed = content.trim();
  const commandMatch = trimmed.match(/^\/([a-zA-Z0-9_-]+)/);
  return commandMatch ? commandMatch[1] : null;
}
