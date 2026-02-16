import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlStatsService } from '../../services/jsonl-stats.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

    it('should calculate stats from JSONL file', async () => {
      const sessionId = 'test-session-123';
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      // Create sample JSONL file
      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      const jsonlContent = [
        JSON.stringify({
          type: 'assistant',
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
      ].join('\n');

      fs.writeFileSync(jsonlPath, jsonlContent);

      const stats = await service.getSessionStats(sessionId, '/home/test/project');

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
      const projectDir = path.join(projectsDir, '-home-test-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
      const jsonlContent = [
        JSON.stringify({
          type: 'user',
          message: { content: 'Hello' },
        }),
        JSON.stringify({
          type: 'assistant',
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
        JSON.stringify({
          type: 'queue-operation',
          operation: 'dequeue',
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
          model: 'claude-sonnet-3-5',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            // Missing cache fields
          },
        },
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
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        })
      );

      fs.writeFileSync(
        path.join(projectDir, 'session-2.jsonl'),
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        })
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
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        })
      );

      // Project 2, Session 2
      fs.writeFileSync(
        path.join(project2Dir, 'session-2.jsonl'),
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-3-5',
            usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        })
      );

      const stats = await service.getAllStats();

      expect(stats.totalInputTokens).toBe(300); // 100 + 200
      expect(stats.totalOutputTokens).toBe(150); // 50 + 100
      expect(stats.messageCount).toBe(2);
    });
  });
});
