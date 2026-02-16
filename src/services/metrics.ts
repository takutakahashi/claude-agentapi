import { Counter, Histogram, Meter } from '@opentelemetry/api';
import { getMeterProvider } from '../utils/telemetry.js';
import { logger } from '../utils/logger.js';

/**
 * Metrics service following Claude Code's metric naming and structure
 * Reference: https://code.claude.com/docs/en/monitoring-usage
 */
export class MetricsService {
  private meter: Meter | null = null;

  // Counters
  private sessionCounter: Counter | null = null;
  private linesOfCodeCounter: Counter | null = null;
  private pullRequestCounter: Counter | null = null;
  private commitCounter: Counter | null = null;
  private costCounter: Counter | null = null;
  private tokenCounter: Counter | null = null;
  private codeEditToolDecisionCounter: Counter | null = null;

  // Histograms
  private activeTimeHistogram: Histogram | null = null;

  // Session tracking
  private sessionId: string;
  private sessionStartTime: number = 0;
  private lastActivityTime: number = 0;

  // Usage tracking
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private totalCacheReadTokens: number = 0;
  private totalCacheCreationTokens: number = 0;
  private totalCostUsd: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const meterProvider = getMeterProvider();
    if (!meterProvider) {
      logger.info('Metrics not initialized - telemetry disabled');
      return;
    }

    try {
      // Create meter with the same name as Claude Code
      this.meter = meterProvider.getMeter('com.anthropic.claude_code');

      // Initialize counters following Claude Code metric names
      this.sessionCounter = this.meter.createCounter('claude_code.session.count', {
        description: 'Count of CLI sessions started',
        unit: 'count',
      });

      this.linesOfCodeCounter = this.meter.createCounter('claude_code.lines_of_code.count', {
        description: 'Count of lines of code modified',
        unit: 'count',
      });

      this.pullRequestCounter = this.meter.createCounter('claude_code.pull_request.count', {
        description: 'Number of pull requests created',
        unit: 'count',
      });

      this.commitCounter = this.meter.createCounter('claude_code.commit.count', {
        description: 'Number of git commits created',
        unit: 'count',
      });

      this.costCounter = this.meter.createCounter('claude_code.cost.usage', {
        description: 'Cost of the Claude Code session',
        unit: 'USD',
      });

      this.tokenCounter = this.meter.createCounter('claude_code.token.usage', {
        description: 'Number of tokens used',
        unit: 'tokens',
      });

      this.codeEditToolDecisionCounter = this.meter.createCounter('claude_code.code_edit_tool.decision', {
        description: 'Count of code editing tool permission decisions',
        unit: 'count',
      });

      this.activeTimeHistogram = this.meter.createHistogram('claude_code.active_time.total', {
        description: 'Total active time in seconds',
        unit: 's',
      });

      logger.info('Metrics service initialized');
    } catch (error) {
      logger.error('Failed to initialize metrics:', error);
    }
  }

  /**
   * Get standard attributes for all metrics
   */
  private getStandardAttributes(): Record<string, string> {
    return {
      'session.id': this.sessionId,
      'app.version': process.env.npm_package_version || '1.0.0',
      'terminal.type': process.env.TERM || 'unknown',
    };
  }

  /**
   * Record session start
   */
  recordSessionStart(): void {
    if (!this.sessionCounter) return;

    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();

    this.sessionCounter.add(1, this.getStandardAttributes());
    logger.debug('Recorded session start');
  }

  /**
   * Record lines of code changed
   */
  recordLinesOfCode(added: number, removed: number): void {
    if (!this.linesOfCodeCounter) return;

    const attrs = this.getStandardAttributes();

    if (added > 0) {
      this.linesOfCodeCounter.add(added, { ...attrs, type: 'added' });
    }

    if (removed > 0) {
      this.linesOfCodeCounter.add(removed, { ...attrs, type: 'removed' });
    }

    this.updateActivity();
    logger.debug(`Recorded lines of code: +${added} -${removed}`);
  }

  /**
   * Record pull request created
   */
  recordPullRequest(): void {
    if (!this.pullRequestCounter) return;

    this.pullRequestCounter.add(1, this.getStandardAttributes());
    this.updateActivity();
    logger.debug('Recorded pull request');
  }

  /**
   * Record git commit
   */
  recordCommit(): void {
    if (!this.commitCounter) return;

    this.commitCounter.add(1, this.getStandardAttributes());
    this.updateActivity();
    logger.debug('Recorded git commit');
  }

  /**
   * Record cost
   */
  recordCost(costUsd: number, model: string): void {
    // Always track locally
    this.totalCostUsd += costUsd;

    // Send to metrics if available
    if (this.costCounter) {
      const attrs = {
        ...this.getStandardAttributes(),
        model,
      };

      this.costCounter.add(costUsd, attrs);
      this.updateActivity();
    }

    logger.debug(`Recorded cost: $${costUsd} for model ${model}`);
  }

  /**
   * Record token usage
   */
  recordTokenUsage(tokens: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheCreation?: number;
  }, model: string): void {
    // Always track locally
    if (tokens.input) {
      this.totalInputTokens += tokens.input;
    }

    if (tokens.output) {
      this.totalOutputTokens += tokens.output;
    }

    if (tokens.cacheRead) {
      this.totalCacheReadTokens += tokens.cacheRead;
    }

    if (tokens.cacheCreation) {
      this.totalCacheCreationTokens += tokens.cacheCreation;
    }

    // Send to metrics if available
    if (this.tokenCounter) {
      const baseAttrs = {
        ...this.getStandardAttributes(),
        model,
      };

      if (tokens.input) {
        this.tokenCounter.add(tokens.input, { ...baseAttrs, type: 'input' });
      }

      if (tokens.output) {
        this.tokenCounter.add(tokens.output, { ...baseAttrs, type: 'output' });
      }

      if (tokens.cacheRead) {
        this.tokenCounter.add(tokens.cacheRead, { ...baseAttrs, type: 'cacheRead' });
      }

      if (tokens.cacheCreation) {
        this.tokenCounter.add(tokens.cacheCreation, { ...baseAttrs, type: 'cacheCreation' });
      }

      this.updateActivity();
    }

    logger.debug(`Recorded token usage for model ${model}`);
  }

  /**
   * Record code edit tool decision
   */
  recordCodeEditToolDecision(tool: 'Edit' | 'Write' | 'NotebookEdit', decision: 'accept' | 'reject', language?: string): void {
    if (!this.codeEditToolDecisionCounter) return;

    const attrs = {
      ...this.getStandardAttributes(),
      tool,
      decision,
      language: language || 'unknown',
    };

    this.codeEditToolDecisionCounter.add(1, attrs);
    this.updateActivity();
    logger.debug(`Recorded code edit decision: ${tool} ${decision}`);
  }

  /**
   * Update last activity time
   */
  private updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Record active time on session end
   */
  recordSessionEnd(): void {
    if (!this.activeTimeHistogram || this.sessionStartTime === 0) return;

    const activeTimeSeconds = (this.lastActivityTime - this.sessionStartTime) / 1000;
    this.activeTimeHistogram.record(activeTimeSeconds, this.getStandardAttributes());
    logger.debug(`Recorded active time: ${activeTimeSeconds}s`);
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): {
    sessionId: string;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
      total: number;
    };
    cost: {
      totalUsd: number;
    };
  } {
    return {
      sessionId: this.sessionId,
      tokens: {
        input: this.totalInputTokens,
        output: this.totalOutputTokens,
        cacheRead: this.totalCacheReadTokens,
        cacheCreation: this.totalCacheCreationTokens,
        total: this.totalInputTokens + this.totalOutputTokens + this.totalCacheReadTokens + this.totalCacheCreationTokens,
      },
      cost: {
        totalUsd: this.totalCostUsd,
      },
    };
  }
}

// Singleton instance
let metricsService: MetricsService | null = null;

/**
 * Initialize metrics service
 */
export function initializeMetricsService(sessionId: string): MetricsService {
  metricsService = new MetricsService(sessionId);
  return metricsService;
}

/**
 * Get metrics service instance
 */
export function getMetricsService(): MetricsService | null {
  return metricsService;
}
