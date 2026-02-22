import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────────────────
// JSONL record types — matches Claude CLI output format
// and is compatible with the claude-posts schema:
// https://github.com/takutakahashi/claude-posts
// ─────────────────────────────────────────────────────────

export interface JsonlUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  /** Present in some API responses */
  service_tier?: string;
}

export interface JsonlContentItem {
  /** "text" | "tool_use" | "tool_result" | "thinking" … */
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
  tool_use_id?: string;
}

/** The nested `message` field of an assistant JSONL record */
export interface JsonlAssistantMessageBody {
  id: string;
  /** Always "message" */
  type: string;
  /** Always "assistant" */
  role: string;
  model: string;
  content: JsonlContentItem[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage?: JsonlUsage;
}

/** The nested `message` field of a user JSONL record */
export interface JsonlUserMessageBody {
  /** Always "user" */
  role: string;
  content: JsonlContentItem[];
}

/** type: "assistant" */
export interface JsonlAssistantRecord {
  type: 'assistant';
  message: JsonlAssistantMessageBody;
  session_id: string;
  /** Added by the Claude Agent SDK (not present in raw CLI output) */
  parent_tool_use_id?: string | null;
  /** Added by the Claude Agent SDK (not present in raw CLI output) */
  uuid?: string;
}

/** type: "user" */
export interface JsonlUserRecord {
  type: 'user';
  message: JsonlUserMessageBody;
  session_id: string;
  /** Added by the Claude Agent SDK */
  parent_tool_use_id?: string | null;
  /** Added by the Claude Agent SDK */
  uuid?: string;
}

/** type: "system" (subtype: "init") */
export interface JsonlSystemRecord {
  type: 'system';
  subtype: string;
  session_id: string;
  tools?: string[];
  mcp_servers?: Array<{ name: string; status: string }>;
  /** Additional fields present in newer CLI versions (camelCase comes from the SDK) */
  [key: string]: unknown;
}

/**
 * type: "result"
 *
 * Cost field name varies by CLI / SDK version:
 *   - `cost_usd`       — older Claude CLI format
 *   - `total_cost`     — older Claude CLI format (same value as cost_usd)
 *   - `total_cost_usd` — current Claude Agent SDK format
 */
export interface JsonlResultRecord {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns' | string;
  session_id: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result?: string;
  /** Old Claude CLI format */
  cost_usd?: number;
  /** Old Claude CLI format — same value as cost_usd */
  total_cost?: number;
  /** Current SDK format */
  total_cost_usd?: number;
}

/** Discriminated union of all known JSONL record types */
export type JsonlRecord =
  | JsonlAssistantRecord
  | JsonlUserRecord
  | JsonlSystemRecord
  | JsonlResultRecord
  | { type: string; [key: string]: unknown };

// ─────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────

export function isAssistantRecord(r: JsonlRecord): r is JsonlAssistantRecord {
  return r.type === 'assistant';
}

export function isResultRecord(r: JsonlRecord): r is JsonlResultRecord {
  return r.type === 'result';
}

// ─────────────────────────────────────────────────────────
// Helper — extract session cost from a result record
// Handles both old (cost_usd / total_cost) and new (total_cost_usd) formats
// ─────────────────────────────────────────────────────────

export function extractResultCost(record: JsonlResultRecord): number | undefined {
  return record.total_cost_usd ?? record.cost_usd ?? record.total_cost;
}

// ─────────────────────────────────────────────────────────
// Stats interfaces
// ─────────────────────────────────────────────────────────

/**
 * Per-message usage statistics parsed from JSONL.
 * @deprecated Use JsonlUsage instead.
 */
export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Aggregated statistics across one or more sessions.
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

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

/**
 * Service to read and aggregate statistics from .claude/projects JSONL files.
 */
export class JsonlStatsService {
  private projectsDir: string;

  constructor(projectsDir?: string) {
    // Default to ~/.claude/projects
    this.projectsDir = projectsDir || path.join(process.env.HOME || '~', '.claude', 'projects');
  }

  /**
   * Calculate cost from usage statistics.
   * Based on Claude API pricing (as of 2025).
   */
  private calculateCost(usage: JsonlUsage, model: string): number {
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
   * Get statistics for a specific session from JSONL file.
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
          .filter((dirent: fs.Dirent) => dirent.isDirectory())
          .map((dirent: fs.Dirent) => dirent.name);

        let found: string | undefined;
        for (const dir of dirs) {
          const candidatePath = path.join(this.projectsDir, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(candidatePath)) {
            found = candidatePath;
            break;
          }
        }

        if (!found) {
          logger.warn(`JSONL file not found for session ${sessionId}`);
          return stats;
        }
        jsonlPath = found;
      }

      // Read and parse JSONL file
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Accumulate usage-based cost as fallback; prefer result-record cost when present.
      let usageBasedCostUsd = 0;
      let resultCostUsd: number | undefined;

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line) as JsonlRecord;

          if (isAssistantRecord(record) && record.message?.usage) {
            const usage = record.message.usage;
            const model = record.message.model || 'claude-sonnet-3-5';

            stats.totalInputTokens += usage.input_tokens || 0;
            stats.totalOutputTokens += usage.output_tokens || 0;
            stats.totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
            stats.totalCacheReadTokens += usage.cache_read_input_tokens || 0;

            usageBasedCostUsd += this.calculateCost(usage, model);
            stats.messageCount++;
          } else if (isResultRecord(record)) {
            // Prefer the authoritative session cost reported in the result record.
            // Handles both old formats (cost_usd / total_cost) and the current
            // SDK format (total_cost_usd).
            const cost = extractResultCost(record);
            if (cost !== undefined) {
              resultCostUsd = cost;
            }
          }
        } catch (parseError) {
          logger.debug(`Failed to parse JSONL line: ${parseError}`);
        }
      }

      // Use result-record cost when available; fall back to usage-based calculation.
      stats.totalCostUsd = resultCostUsd ?? usageBasedCostUsd;

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
   * Get statistics for all sessions in a project.
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
        .filter((file: string) => file.endsWith('.jsonl'));

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
   * Get aggregated statistics across all sessions.
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
        .filter((dirent: fs.Dirent) => dirent.isDirectory())
        .map((dirent: fs.Dirent) => dirent.name);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(this.projectsDir, projectDir);
        const files = fs.readdirSync(projectPath)
          .filter((file: string) => file.endsWith('.jsonl'));

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
 * Initialize JSONL stats service.
 */
export function initializeJsonlStatsService(projectsDir?: string): JsonlStatsService {
  jsonlStatsService = new JsonlStatsService(projectsDir);
  return jsonlStatsService;
}

/**
 * Get JSONL stats service instance.
 */
export function getJsonlStatsService(): JsonlStatsService | null {
  return jsonlStatsService;
}
