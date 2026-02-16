import * as fs from 'node:fs';
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
 * Service to read and aggregate statistics from claude-agentapi's history.jsonl
 */
export class JsonlStatsService {
  private historyFilePath: string;

  constructor(historyFilePath?: string) {
    // Default to STREAM_JSON_OUTPUT_FILE env var or /opt/claude-agentapi/history.jsonl
    this.historyFilePath = historyFilePath || process.env.STREAM_JSON_OUTPUT_FILE || '/opt/claude-agentapi/history.jsonl';
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
   * Get statistics for a specific session from history.jsonl file
   */
  async getSessionStats(sessionId?: string): Promise<AggregatedStats> {
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
      // Check if history file exists
      if (!fs.existsSync(this.historyFilePath)) {
        logger.debug(`History file not found: ${this.historyFilePath}`);
        return stats;
      }

      // Read and parse JSONL file
      const content = fs.readFileSync(this.historyFilePath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line);

          // Filter by session ID if specified
          if (sessionId && record.session_id !== sessionId) {
            continue;
          }

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

      const sessionInfo = sessionId ? `session ${sessionId}` : 'all sessions';
      logger.info(`Loaded stats for ${sessionInfo}: ${stats.messageCount} messages, ${stats.totalTokens} tokens, $${stats.totalCostUsd.toFixed(4)}`);

      return stats;
    } catch (error) {
      logger.error(`Failed to read JSONL stats:`, error);
      return stats;
    }
  }

  /**
   * Get aggregated statistics across all sessions in history file
   */
  async getAllStats(): Promise<AggregatedStats> {
    // Call getSessionStats without sessionId to get all stats
    return this.getSessionStats();
  }
}

// Singleton instance
let jsonlStatsService: JsonlStatsService | null = null;

/**
 * Initialize JSONL stats service
 */
export function initializeJsonlStatsService(historyFilePath?: string): JsonlStatsService {
  jsonlStatsService = new JsonlStatsService(historyFilePath);
  return jsonlStatsService;
}

/**
 * Get JSONL stats service instance
 */
export function getJsonlStatsService(): JsonlStatsService | null {
  return jsonlStatsService;
}
