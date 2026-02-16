import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';

/**
 * Interface for Claude Code usage statistics from JSONL
 */
export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Interface for aggregated statistics
 */
export interface AggregatedStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  messageCount: number;
}

/**
 * Service to read and aggregate statistics from .claude/projects JSONL files
 */
export class JsonlStatsService {
  private projectsDir: string;

  constructor(projectsDir?: string) {
    // Default to ~/.claude/projects
    this.projectsDir = projectsDir || path.join(process.env.HOME || '~', '.claude', 'projects');
  }

  /**
   * Calculate cost from usage statistics
   * Based on Claude API pricing (as of 2025)
   */
  private calculateCost(usage: UsageStats, model: string): number {
    // Pricing per 1M tokens (MTok)
    const pricing: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
      'claude-sonnet-4-5': {
        input: 3.00,
        output: 15.00,
        cacheWrite: 3.75,
        cacheRead: 0.30,
      },
      'claude-sonnet-3-5': {
        input: 3.00,
        output: 15.00,
        cacheWrite: 3.75,
        cacheRead: 0.30,
      },
      'claude-opus-4': {
        input: 15.00,
        output: 75.00,
        cacheWrite: 18.75,
        cacheRead: 1.50,
      },
      'claude-haiku-3-5': {
        input: 1.00,
        output: 5.00,
        cacheWrite: 1.25,
        cacheRead: 0.10,
      },
    };

    // Determine model family
    let modelPricing = pricing['claude-sonnet-3-5']; // default
    if (model.includes('sonnet-4')) {
      modelPricing = pricing['claude-sonnet-4-5'];
    } else if (model.includes('opus-4')) {
      modelPricing = pricing['claude-opus-4'];
    } else if (model.includes('haiku')) {
      modelPricing = pricing['claude-haiku-3-5'];
    }

    const inputCost = (usage.input_tokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * modelPricing.output;
    const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * modelPricing.cacheWrite;
    const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * modelPricing.cacheRead;

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  /**
   * Get statistics for a specific session from JSONL file
   */
  async getSessionStats(sessionId: string, projectPath?: string): Promise<AggregatedStats> {
    const stats: AggregatedStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      messageCount: 0,
    };

    try {
      // Construct JSONL file path
      let jsonlPath: string;
      if (projectPath) {
        // Convert project path to directory name (e.g., /home/user/project -> -home-user-project)
        const dirName = projectPath.replace(/\//g, '-');
        jsonlPath = path.join(this.projectsDir, dirName, `${sessionId}.jsonl`);
      } else {
        // Search for the session file
        const dirs = fs.readdirSync(this.projectsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const dir of dirs) {
          const candidatePath = path.join(this.projectsDir, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(candidatePath)) {
            jsonlPath = candidatePath;
            break;
          }
        }

        if (!jsonlPath!) {
          logger.warn(`JSONL file not found for session ${sessionId}`);
          return stats;
        }
      }

      // Read and parse JSONL file
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line);

          // Check if this is an assistant message with usage data
          if (record.type === 'assistant' && record.message?.usage) {
            const usage = record.message.usage;
            const model = record.message.model || 'claude-sonnet-3-5';

            stats.totalInputTokens += usage.input_tokens || 0;
            stats.totalOutputTokens += usage.output_tokens || 0;
            stats.totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
            stats.totalCacheReadTokens += usage.cache_read_input_tokens || 0;

            // Calculate cost for this message
            stats.totalCostUsd += this.calculateCost(usage, model);
            stats.messageCount++;
          }
        } catch (parseError) {
          logger.debug(`Failed to parse JSONL line: ${parseError}`);
        }
      }

      stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens +
                         stats.totalCacheCreationTokens + stats.totalCacheReadTokens;

      logger.info(`Loaded stats for session ${sessionId}: ${stats.messageCount} messages, ${stats.totalTokens} tokens, $${stats.totalCostUsd.toFixed(4)}`);

      return stats;
    } catch (error) {
      logger.error(`Failed to read JSONL stats for session ${sessionId}:`, error);
      return stats;
    }
  }

  /**
   * Get statistics for all sessions in a project
   */
  async getProjectStats(projectPath: string): Promise<Map<string, AggregatedStats>> {
    const statsMap = new Map<string, AggregatedStats>();

    try {
      const dirName = projectPath.replace(/\//g, '-');
      const projectDir = path.join(this.projectsDir, dirName);

      if (!fs.existsSync(projectDir)) {
        logger.warn(`Project directory not found: ${projectDir}`);
        return statsMap;
      }

      const files = fs.readdirSync(projectDir)
        .filter(file => file.endsWith('.jsonl'));

      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await this.getSessionStats(sessionId, projectPath);
        statsMap.set(sessionId, stats);
      }

      return statsMap;
    } catch (error) {
      logger.error(`Failed to read project stats for ${projectPath}:`, error);
      return statsMap;
    }
  }

  /**
   * Get aggregated statistics across all sessions
   */
  async getAllStats(): Promise<AggregatedStats> {
    const aggregated: AggregatedStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      messageCount: 0,
    };

    try {
      const projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(this.projectsDir, projectDir);
        const files = fs.readdirSync(projectPath)
          .filter(file => file.endsWith('.jsonl'));

        for (const file of files) {
          const sessionId = path.basename(file, '.jsonl');
          const projectPathOriginal = projectDir.replace(/-/g, '/');
          const stats = await this.getSessionStats(sessionId, projectPathOriginal);

          aggregated.totalInputTokens += stats.totalInputTokens;
          aggregated.totalOutputTokens += stats.totalOutputTokens;
          aggregated.totalCacheCreationTokens += stats.totalCacheCreationTokens;
          aggregated.totalCacheReadTokens += stats.totalCacheReadTokens;
          aggregated.totalTokens += stats.totalTokens;
          aggregated.totalCostUsd += stats.totalCostUsd;
          aggregated.messageCount += stats.messageCount;
        }
      }

      return aggregated;
    } catch (error) {
      logger.error('Failed to read all stats:', error);
      return aggregated;
    }
  }
}

// Singleton instance
let jsonlStatsService: JsonlStatsService | null = null;

/**
 * Initialize JSONL stats service
 */
export function initializeJsonlStatsService(projectsDir?: string): JsonlStatsService {
  jsonlStatsService = new JsonlStatsService(projectsDir);
  return jsonlStatsService;
}

/**
 * Get JSONL stats service instance
 */
export function getJsonlStatsService(): JsonlStatsService | null {
  return jsonlStatsService;
}
