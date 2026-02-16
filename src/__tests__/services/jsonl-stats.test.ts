import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlStatsService } from '../../services/jsonl-stats.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('JsonlStatsService', () => {
  let tempDir: string;
  let historyFile: string;
  let service: JsonlStatsService;

  beforeEach(() => {
    // Create temporary directory and history file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-stats-test-'));
    historyFile = path.join(tempDir, 'history.jsonl');

    service = new JsonlStatsService(historyFile);
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSessionStats', () => {
    it('should return empty stats for non-existent file', async () => {
      const stats = await service.getSessionStats('non-existent-session');

      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.totalCacheCreationTokens).toBe(0);
      expect(stats.totalCacheReadTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCostUsd).toBe(0);
      expect(stats.messageCount).toBe(0);
    });

    it('should calculate stats from history.jsonl for specific session', async () => {
      const sessionId = 'test-session-123';

      // Create sample history.jsonl
      const jsonlContent = [
        JSON.stringify({
          type: 'assistant',
          session_id: sessionId,
          message: {
            model: 'claude-sonnet-4-5-20250929',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 200,
              cache_read_input_tokens: 1000,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          session_id: sessionId,
          message: {
            model: 'claude-sonnet-4-5-20250929',
            usage: {
              input_tokens: 150,
              output_tokens: 75,
              cache_creation_input_tokens: 100,
              cache_read_input_tokens: 500,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          session_id: 'other-session',
          message: {
            model: 'claude-sonnet-3-5',
            usage: {
              input_tokens: 999,
              output_tokens: 999,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
      ].join('\n');

      fs.writeFileSync(historyFile, jsonlContent);

      const stats = await service.getSessionStats(sessionId);

      expect(stats.totalInputTokens).toBe(250);
      expect(stats.totalOutputTokens).toBe(125);
      expect(stats.totalCacheCreationTokens).toBe(300);
      expect(stats.totalCacheReadTokens).toBe(1500);
      expect(stats.totalTokens).toBe(2175);
      expect(stats.messageCount).toBe(2);
      expect(stats.totalCostUsd).toBeGreaterThan(0);
    });

    it('should ignore non-assistant messages', async () => {
      const sessionId = 'test-session-456';

      const jsonlContent = [
        JSON.stringify({
          type: 'system',
          session_id: sessionId,
          subtype: 'init',
        }),
        JSON.stringify({
          type: 'user',
          session_id: sessionId,
          message: { content: 'Hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          session_id: sessionId,
          message: {
            model: 'claude-sonnet-3-5',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
      ].join('\n');

      fs.writeFileSync(historyFile, jsonlContent);

      const stats = await service.getSessionStats(sessionId);

      expect(stats.messageCount).toBe(1); // Only one assistant message
      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
    });

    it('should handle missing usage fields gracefully', async () => {
      const sessionId = 'test-session-789';

      const jsonlContent = JSON.stringify({
        type: 'assistant',
        session_id: sessionId,
        message: {
          model: 'claude-sonnet-3-5',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            // Missing cache fields
          },
        },
      });

      fs.writeFileSync(historyFile, jsonlContent);

      const stats = await service.getSessionStats(sessionId);

      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
      expect(stats.totalCacheCreationTokens).toBe(0);
      expect(stats.totalCacheReadTokens).toBe(0);
    });
  });

  describe('getAllStats', () => {
    it('should aggregate stats across all sessions in history file', async () => {
      // Create history with multiple sessions
      const jsonlContent = [
        JSON.stringify({
          type: 'assistant',
          session_id: 'session-1',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          session_id: 'session-2',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          session_id: 'session-1',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        }),
      ].join('\n');

      fs.writeFileSync(historyFile, jsonlContent);

      const stats = await service.getAllStats();

      expect(stats.totalInputTokens).toBe(350); // 100 + 200 + 50
      expect(stats.totalOutputTokens).toBe(175); // 50 + 100 + 25
      expect(stats.messageCount).toBe(3);
    });
  });
});
