import { ObservableGauge, Meter, ObservableResult } from '@opentelemetry/api';
import { getMeterProvider } from '../utils/telemetry.js';
import { getJsonlStatsService } from './jsonl-stats.js';
import { logger } from '../utils/logger.js';

/**
 * Service to export JSONL statistics as Prometheus metrics
 * This provides accurate statistics based on actual usage from .claude/projects JSONL files
 */
export class JsonlMetricsExporter {
  private meter: Meter | null = null;
  private sessionId: string | null = null;

  // Observable gauges for current statistics
  private sessionTokensGauge: ObservableGauge | null = null;
  private sessionCostGauge: ObservableGauge | null = null;
  private sessionMessageCountGauge: ObservableGauge | null = null;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || null;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const meterProvider = getMeterProvider();
    if (!meterProvider) {
      logger.info('JSONL metrics exporter not initialized - telemetry disabled');
      return;
    }

    try {
      this.meter = meterProvider.getMeter('com.anthropic.claude_code.jsonl');

      // Create observable gauges that read from JSONL files
      this.sessionTokensGauge = this.meter.createObservableGauge(
        'claude_code.jsonl.session.tokens',
        {
          description: 'Token usage from JSONL files',
          unit: 'tokens',
        }
      );

      this.sessionCostGauge = this.meter.createObservableGauge(
        'claude_code.jsonl.session.cost',
        {
          description: 'Session cost from JSONL files',
          unit: 'USD',
        }
      );

      this.sessionMessageCountGauge = this.meter.createObservableGauge(
        'claude_code.jsonl.session.messages',
        {
          description: 'Number of messages from JSONL files',
          unit: 'count',
        }
      );

      // Register callbacks to read from JSONL
      this.sessionTokensGauge.addCallback(async (observableResult) => {
        await this.collectTokenMetrics(observableResult);
      });

      this.sessionCostGauge.addCallback(async (observableResult) => {
        await this.collectCostMetrics(observableResult);
      });

      this.sessionMessageCountGauge.addCallback(async (observableResult) => {
        await this.collectMessageCountMetrics(observableResult);
      });

      logger.info('JSONL metrics exporter initialized');
    } catch (error) {
      logger.error('Failed to initialize JSONL metrics exporter:', error);
    }
  }

  private async collectTokenMetrics(observableResult: ObservableResult): Promise<void> {
    const jsonlStats = getJsonlStatsService();
    if (!jsonlStats) return;

    try {
      let stats;
      if (this.sessionId) {
        // Get stats for specific session
        stats = await jsonlStats.getSessionStats(this.sessionId);
      } else {
        // Get aggregated stats
        stats = await jsonlStats.getAllStats();
      }

      const baseAttrs = {
        'session.id': this.sessionId || 'all',
      };

      // Record token metrics by type
      observableResult.observe(stats.totalInputTokens, { ...baseAttrs, type: 'input' });
      observableResult.observe(stats.totalOutputTokens, { ...baseAttrs, type: 'output' });
      observableResult.observe(stats.totalCacheReadTokens, { ...baseAttrs, type: 'cacheRead' });
      observableResult.observe(stats.totalCacheCreationTokens, { ...baseAttrs, type: 'cacheCreation' });
      observableResult.observe(stats.totalTokens, { ...baseAttrs, type: 'total' });
    } catch (error) {
      logger.error('Failed to collect token metrics from JSONL:', error);
    }
  }

  private async collectCostMetrics(observableResult: ObservableResult): Promise<void> {
    const jsonlStats = getJsonlStatsService();
    if (!jsonlStats) return;

    try {
      let stats;
      if (this.sessionId) {
        stats = await jsonlStats.getSessionStats(this.sessionId);
      } else {
        stats = await jsonlStats.getAllStats();
      }

      observableResult.observe(stats.totalCostUsd, {
        'session.id': this.sessionId || 'all',
      });
    } catch (error) {
      logger.error('Failed to collect cost metrics from JSONL:', error);
    }
  }

  private async collectMessageCountMetrics(observableResult: ObservableResult): Promise<void> {
    const jsonlStats = getJsonlStatsService();
    if (!jsonlStats) return;

    try {
      let stats;
      if (this.sessionId) {
        stats = await jsonlStats.getSessionStats(this.sessionId);
      } else {
        stats = await jsonlStats.getAllStats();
      }

      observableResult.observe(stats.messageCount, {
        'session.id': this.sessionId || 'all',
      });
    } catch (error) {
      logger.error('Failed to collect message count metrics from JSONL:', error);
    }
  }

  /**
   * Update the session ID to track
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }
}

// Singleton instance
let jsonlMetricsExporter: JsonlMetricsExporter | null = null;

/**
 * Initialize JSONL metrics exporter
 */
export function initializeJsonlMetricsExporter(sessionId?: string): JsonlMetricsExporter {
  jsonlMetricsExporter = new JsonlMetricsExporter(sessionId);
  return jsonlMetricsExporter;
}

/**
 * Get JSONL metrics exporter instance
 */
export function getJsonlMetricsExporter(): JsonlMetricsExporter | null {
  return jsonlMetricsExporter;
}
