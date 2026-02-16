import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsService } from '../../services/metrics.js';

// Mock telemetry
vi.mock('../../utils/telemetry.js', () => ({
  getMeterProvider: vi.fn().mockReturnValue(null),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService('test-session-123');
  });

  describe('getUsageStats', () => {
    it('should return initial zero stats', () => {
      const stats = metricsService.getUsageStats();

      expect(stats).toEqual({
        sessionId: 'test-session-123',
        tokens: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheCreation: 0,
          total: 0,
        },
        cost: {
          totalUsd: 0,
        },
      });
    });

    it('should track token usage correctly with cumulative values from SDK', () => {
      // Record cumulative token usage (as SDK provides)
      // First result message with cumulative usage
      metricsService.recordTokenUsage({
        input: 100,
        output: 50,
      }, 'test-model');

      // Second result message with updated cumulative usage
      metricsService.recordTokenUsage({
        input: 200,
        output: 150,
        cacheRead: 50,
        cacheCreation: 25,
      }, 'test-model');

      const stats = metricsService.getUsageStats();

      // Since SDK provides cumulative values, the latest values should be stored
      expect(stats.tokens.input).toBe(200);
      expect(stats.tokens.output).toBe(150);
      expect(stats.tokens.cacheRead).toBe(50);
      expect(stats.tokens.cacheCreation).toBe(25);
      expect(stats.tokens.total).toBe(425);
    });

    it('should track cost correctly with cumulative values from SDK', () => {
      // SDK provides cumulative cost in result messages
      metricsService.recordCost(0.05, 'model-1');
      metricsService.recordCost(0.08, 'model-1'); // Updated cumulative cost

      const stats = metricsService.getUsageStats();

      // Latest cumulative cost should be stored
      expect(stats.cost.totalUsd).toBe(0.08);
    });

    it('should track both tokens and cost together with cumulative values', () => {
      // First result message
      metricsService.recordTokenUsage({
        input: 1000,
        output: 500,
      }, 'test-model');

      metricsService.recordCost(0.1, 'test-model');

      // Second result message with updated cumulative values
      metricsService.recordTokenUsage({
        input: 1000,
        output: 500,
        cacheRead: 200,
      }, 'test-model');

      const stats = metricsService.getUsageStats();

      expect(stats.tokens.input).toBe(1000);
      expect(stats.tokens.output).toBe(500);
      expect(stats.tokens.cacheRead).toBe(200);
      expect(stats.tokens.total).toBe(1700);
      expect(stats.cost.totalUsd).toBe(0.1);
    });
  });
});
