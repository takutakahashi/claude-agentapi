import { getMeterProvider } from '../utils/telemetry.js';
import { logger } from '../utils/logger.js';
/**
 * Metrics service following Claude Code's metric naming and structure
 * Reference: https://code.claude.com/docs/en/monitoring-usage
 */
export class MetricsService {
    meter = null;
    // Counters
    sessionCounter = null;
    linesOfCodeCounter = null;
    pullRequestCounter = null;
    commitCounter = null;
    costCounter = null;
    tokenCounter = null;
    codeEditToolDecisionCounter = null;
    // Histograms
    activeTimeHistogram = null;
    // Session tracking
    sessionId;
    sessionStartTime = 0;
    lastActivityTime = 0;
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.initializeMetrics();
    }
    initializeMetrics() {
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
        }
        catch (error) {
            logger.error('Failed to initialize metrics:', error);
        }
    }
    /**
     * Get standard attributes for all metrics
     */
    getStandardAttributes() {
        return {
            'session.id': this.sessionId,
            'app.version': process.env.npm_package_version || '1.0.0',
            'terminal.type': process.env.TERM || 'unknown',
        };
    }
    /**
     * Record session start
     */
    recordSessionStart() {
        if (!this.sessionCounter)
            return;
        this.sessionStartTime = Date.now();
        this.lastActivityTime = Date.now();
        this.sessionCounter.add(1, this.getStandardAttributes());
        logger.debug('Recorded session start');
    }
    /**
     * Record lines of code changed
     */
    recordLinesOfCode(added, removed) {
        if (!this.linesOfCodeCounter)
            return;
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
    recordPullRequest() {
        if (!this.pullRequestCounter)
            return;
        this.pullRequestCounter.add(1, this.getStandardAttributes());
        this.updateActivity();
        logger.debug('Recorded pull request');
    }
    /**
     * Record git commit
     */
    recordCommit() {
        if (!this.commitCounter)
            return;
        this.commitCounter.add(1, this.getStandardAttributes());
        this.updateActivity();
        logger.debug('Recorded git commit');
    }
    /**
     * Record cost
     */
    recordCost(costUsd, model) {
        if (!this.costCounter)
            return;
        const attrs = {
            ...this.getStandardAttributes(),
            model,
        };
        this.costCounter.add(costUsd, attrs);
        this.updateActivity();
        logger.debug(`Recorded cost: $${costUsd} for model ${model}`);
    }
    /**
     * Record token usage
     */
    recordTokenUsage(tokens, model) {
        if (!this.tokenCounter)
            return;
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
        logger.debug(`Recorded token usage for model ${model}`);
    }
    /**
     * Record code edit tool decision
     */
    recordCodeEditToolDecision(tool, decision, language) {
        if (!this.codeEditToolDecisionCounter)
            return;
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
    updateActivity() {
        this.lastActivityTime = Date.now();
    }
    /**
     * Record active time on session end
     */
    recordSessionEnd() {
        if (!this.activeTimeHistogram || this.sessionStartTime === 0)
            return;
        const activeTimeSeconds = (this.lastActivityTime - this.sessionStartTime) / 1000;
        this.activeTimeHistogram.record(activeTimeSeconds, this.getStandardAttributes());
        logger.debug(`Recorded active time: ${activeTimeSeconds}s`);
    }
}
// Singleton instance
let metricsService = null;
/**
 * Initialize metrics service
 */
export function initializeMetricsService(sessionId) {
    metricsService = new MetricsService(sessionId);
    return metricsService;
}
/**
 * Get metrics service instance
 */
export function getMetricsService() {
    return metricsService;
}
//# sourceMappingURL=metrics.js.map