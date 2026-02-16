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

    it('should return last API call usage (not cumulative)', () => {
      // First API call
      metricsService.recordTokenUsage({
        input: 100,
        output: 50,
      }, 'test-model');

      // Second API call (this is what should be returned)
      metricsService.recordTokenUsage({
        input: 200,
        output: 150,
        cacheRead: 50,
        cacheCreation: 25,
      }, 'test-model');

      const stats = metricsService.getUsageStats();

      // Should return only the last API call's usage
      expect(stats.tokens.input).toBe(200);
      expect(stats.tokens.output).toBe(150);
      expect(stats.tokens.cacheRead).toBe(50);
      expect(stats.tokens.cacheCreation).toBe(25);
      expect(stats.tokens.total).toBe(425);
    });

    it('should return last API call cost (not cumulative)', () => {
      metricsService.recordCost(0.05, 'model-1');
      metricsService.recordCost(0.03, 'model-2'); // This is what should be returned

      const stats = metricsService.getUsageStats();

      // Should return only the last API call's cost
      expect(stats.cost.totalUsd).toBe(0.03);
    });

    it('should return last API call for both tokens and cost', () => {
      metricsService.recordTokenUsage({
        input: 1000,
        output: 500,
      }, 'test-model');

      metricsService.recordCost(0.1, 'test-model');

      // Last API call with different usage
      metricsService.recordTokenUsage({
        input: 50,
        output: 30,
        cacheRead: 200,
      }, 'test-model');

      const stats = metricsService.getUsageStats();

      // Should return only the last API call's usage
      expect(stats.tokens.input).toBe(50);
      expect(stats.tokens.output).toBe(30);
      expect(stats.tokens.cacheRead).toBe(200);
      expect(stats.tokens.total).toBe(280);
      expect(stats.cost.totalUsd).toBe(0.1); // Last recorded cost
    });
  });
});
