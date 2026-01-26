/**
 * Metrics service following Claude Code's metric naming and structure
 * Reference: https://code.claude.com/docs/en/monitoring-usage
 */
export declare class MetricsService {
    private meter;
    private sessionCounter;
    private linesOfCodeCounter;
    private pullRequestCounter;
    private commitCounter;
    private costCounter;
    private tokenCounter;
    private codeEditToolDecisionCounter;
    private activeTimeHistogram;
    private sessionId;
    private sessionStartTime;
    private lastActivityTime;
    constructor(sessionId: string);
    private initializeMetrics;
    /**
     * Get standard attributes for all metrics
     */
    private getStandardAttributes;
    /**
     * Record session start
     */
    recordSessionStart(): void;
    /**
     * Record lines of code changed
     */
    recordLinesOfCode(added: number, removed: number): void;
    /**
     * Record pull request created
     */
    recordPullRequest(): void;
    /**
     * Record git commit
     */
    recordCommit(): void;
    /**
     * Record cost
     */
    recordCost(costUsd: number, model: string): void;
    /**
     * Record token usage
     */
    recordTokenUsage(tokens: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheCreation?: number;
    }, model: string): void;
    /**
     * Record code edit tool decision
     */
    recordCodeEditToolDecision(tool: 'Edit' | 'Write' | 'NotebookEdit', decision: 'accept' | 'reject', language?: string): void;
    /**
     * Update last activity time
     */
    private updateActivity;
    /**
     * Record active time on session end
     */
    recordSessionEnd(): void;
}
/**
 * Initialize metrics service
 */
export declare function initializeMetricsService(sessionId: string): MetricsService;
/**
 * Get metrics service instance
 */
export declare function getMetricsService(): MetricsService | null;
//# sourceMappingURL=metrics.d.ts.map