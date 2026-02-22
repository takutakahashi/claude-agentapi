import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlStatsService, extractResultCost } from '../../services/jsonl-stats.js';
import type {
  JsonlAssistantRecord,
  JsonlResultRecord,
} from '../../services/jsonl-stats.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─────────────────────────────────────────────────────────
// Helpers — build JSONL records matching claude-posts schema
// https://github.com/takutakahashi/claude-posts
// ─────────────────────────────────────────────────────────

function buildAssistantRecord(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  },
  sessionId = 'test-session',
): JsonlAssistantRecord {
  return {
    type: 'assistant',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage,
    },
    session_id: sessionId,
    parent_tool_use_id: null,
  };
}

function buildResultRecord(
  costField: 'cost_usd' | 'total_cost' | 'total_cost_usd',
  costValue: number,
  sessionId = 'test-session',
): JsonlResultRecord {
  return {
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    is_error: false,
    duration_ms: 1000,
    duration_api_ms: 900,
    num_turns: 1,
    result: 'done',
    [costField]: costValue,
  };
}

// ─────────────────────────────────────────────────────────
// extractResultCost unit tests
// ─────────────────────────────────────────────────────────

describe('extractResultCost', () => {
  it('should extract cost from total_cost_usd (current SDK format)', () => {
    const record = buildResultRecord('total_cost_usd', 0.42);
    expect(extractResultCost(record)).toBe(0.42);
  });

  it('should extract cost from cost_usd (old CLI format)', () => {
    const record = buildResultRecord('cost_usd', 0.10);
    expect(extractResultCost(record)).toBe(0.10);
  });

  it('should extract cost from total_cost (old CLI format alias)', () => {
    const record = buildResultRecord('total_cost', 0.05);
    expect(extractResultCost(record)).toBe(0.05);
  });

  it('should prefer total_cost_usd over cost_usd', () => {
    const record: JsonlResultRecord = {
      type: 'result',
      subtype: 'success',
      session_id: 's',
      is_error: false,
      duration_ms: 0,
      duration_api_ms: 0,
      num_turns: 0,
      total_cost_usd: 0.99,
      cost_usd: 0.01,
    };
    expect(extractResultCost(record)).toBe(0.99);
  });

  it('should return undefined when no cost field is present', () => {
    const record: JsonlResultRecord = {
      type: 'result',
      subtype: 'success',
      session_id: 's',
      is_error: false,
      duration_ms: 0,
      duration_api_ms: 0,
      num_turns: 0,
    };
    expect(extractResultCost(record)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// JsonlStatsService integration tests
// ─────────────────────────────────────────────────────────

describe('JsonlStatsService', () => {
  let tempDir: string;
  let projectsDir: string;
  let service: JsonlStatsService;

  beforeEach(() => {
    // Create temporary directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-stats-test-'));
    projectsDir = path.join(tempDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });

    service = new JsonlStatsService(projectsDir);
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSessionStats', () => {
    it('should return empty stats for non-existent session', async () => {
      const stats = await service.getSessionStats('non-existent-session');

      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.totalCacheCreationTokens).toBe(0);
      expect(stats.totalCacheReadTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCostUsd).toBe(0);
      expect(stats.messageCount).toBe(0);
    });

    it('should calculate stats from JSONL file using full claude-posts-compatible schema', async () => {
      const sessionId = 'test-session-123';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      const records: JsonlAssistantRecord[] = [
        buildAssistantRecord('claude-sonnet-4-5-20250929', {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 1000,
        }, sessionId),
        buildAssistantRecord('claude-sonnet-4-5-20250929', {
          input_tokens: 150,
          output_tokens: 75,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 500,
        }, sessionId),
      ];
      fs.writeFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n'));

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      expect(stats.totalInputTokens).toBe(250);
      expect(stats.totalOutputTokens).toBe(125);
      expect(stats.totalCacheCreationTokens).toBe(300);
      expect(stats.totalCacheReadTokens).toBe(1500);
      expect(stats.totalTokens).toBe(2175);
      expect(stats.messageCount).toBe(2);
      expect(stats.totalCostUsd).toBeGreaterThan(0);
    });

    it('should use cost_usd from result record (old Claude CLI format)', async () => {
      const sessionId = 'test-session-result-old';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const sessionCost = 0.10527415;
      const records = [
        buildAssistantRecord('claude-3-7-sonnet-20250219', {
          input_tokens: 4,
          output_tokens: 91,
          cache_creation_input_tokens: 24416,
          cache_read_input_tokens: 0,
        }, sessionId),
        // Old-format result record (matches data/claude.jsonl in claude-posts)
        {
          type: 'result',
          subtype: 'success',
          cost_usd: sessionCost,
          total_cost: sessionCost,
          is_error: false,
          duration_ms: 11943,
          duration_api_ms: 13613,
          num_turns: 3,
          result: 'done',
          session_id: sessionId,
        },
      ];
      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      fs.writeFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n'));

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      // totalCostUsd must come from the result record, not the manual calculation
      expect(stats.totalCostUsd).toBeCloseTo(sessionCost, 8);
      expect(stats.messageCount).toBe(1);
    });

    it('should use total_cost_usd from result record (current SDK format)', async () => {
      const sessionId = 'test-session-result-sdk';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const sessionCost = 0.042;
      const records = [
        buildAssistantRecord('claude-3-7-sonnet-20250219', {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        }, sessionId),
        // SDK-format result record
        buildResultRecord('total_cost_usd', sessionCost, sessionId),
      ];
      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      fs.writeFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n'));

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      expect(stats.totalCostUsd).toBeCloseTo(sessionCost, 8);
    });

    it('should fall back to usage-based cost when no result record is present', async () => {
      const sessionId = 'test-session-no-result';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const record = buildAssistantRecord('claude-sonnet-3-5', {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, sessionId);
      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      fs.writeFileSync(jsonlPath, JSON.stringify(record));

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      expect(stats.totalCostUsd).toBeGreaterThan(0);
      expect(stats.messageCount).toBe(1);
    });

    it('should ignore non-assistant messages', async () => {
      const sessionId = 'test-session-456';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      const jsonlContent = [
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', content: 'ok', is_error: false, tool_use_id: 'toolu_01' }],
          },
          session_id: sessionId,
        }),
        JSON.stringify(buildAssistantRecord('claude-sonnet-3-5', {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        }, sessionId)),
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: sessionId,
          tools: ['Bash'],
          mcp_servers: [],
        }),
      ].join('\n');

      fs.writeFileSync(jsonlPath, jsonlContent);

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      expect(stats.messageCount).toBe(1); // Only one assistant message
      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
    });

    it('should handle missing usage fields gracefully', async () => {
      const sessionId = 'test-session-789';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      const jsonlContent = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_partial',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-3-5',
          content: [],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            // Missing cache fields — should default to 0
          },
        },
        session_id: sessionId,
      });

      fs.writeFileSync(jsonlPath, jsonlContent);

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
      expect(stats.totalCacheCreationTokens).toBe(0);
      expect(stats.totalCacheReadTokens).toBe(0);
    });
  });

  describe('getProjectStats', () => {
    it('should aggregate stats for all sessions in a project', async () => {
      const projectPath = '/home/test/project';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      // Create two session files
      fs.writeFileSync(
        path.join(projectDir, 'session-1.jsonl'),
        JSON.stringify(buildAssistantRecord('claude-sonnet-3-5', {
          input_tokens: 100, output_tokens: 50,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
        }, 'session-1'))
      );

      fs.writeFileSync(
        path.join(projectDir, 'session-2.jsonl'),
        JSON.stringify(buildAssistantRecord('claude-sonnet-3-5', {
          input_tokens: 200, output_tokens: 100,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
        }, 'session-2'))
      );

      const statsMap = await service.getProjectStats(projectPath);

      expect(statsMap.size).toBe(2);
      expect(statsMap.has('session-1')).toBe(true);
      expect(statsMap.has('session-2')).toBe(true);

      const session1Stats = statsMap.get('session-1')!;
      expect(session1Stats.totalInputTokens).toBe(100);

      const session2Stats = statsMap.get('session-2')!;
      expect(session2Stats.totalInputTokens).toBe(200);
    });
  });

  describe('getAllStats', () => {
    it('should aggregate stats across all projects and sessions', async () => {
      // Create multiple projects
      const project1Dir = path.join(projectsDir, '-home-test-project1');
      const project2Dir = path.join(projectsDir, '-home-test-project2');

      fs.mkdirSync(project1Dir, { recursive: true });
      fs.mkdirSync(project2Dir, { recursive: true });

      // Project 1, Session 1
      fs.writeFileSync(
        path.join(project1Dir, 'session-1.jsonl'),
        JSON.stringify(buildAssistantRecord('claude-sonnet-3-5', {
          input_tokens: 100, output_tokens: 50,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
        }, 'session-1'))
      );

      // Project 2, Session 2
      fs.writeFileSync(
        path.join(project2Dir, 'session-2.jsonl'),
        JSON.stringify(buildAssistantRecord('claude-sonnet-3-5', {
          input_tokens: 200, output_tokens: 100,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
        }, 'session-2'))
      );

      const stats = await service.getAllStats();

      expect(stats.totalInputTokens).toBe(300); // 100 + 200
      expect(stats.totalOutputTokens).toBe(150); // 50 + 100
      expect(stats.messageCount).toBe(2);
    });
  });
});
