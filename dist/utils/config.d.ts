import type { ClaudeConfig, ResolvedConfig } from '../types/config.js';
/**
 * Load Claude configuration from .claude/config.json
 * Checks in order:
 * 1. Global config: ~/.claude/config.json
 * 2. Project config: .claude/config.json (current working directory)
 * 3. Working directory config: {workingDirectory}/.claude/config.json
 */
export declare function loadClaudeConfig(workingDirectory?: string): Promise<ClaudeConfig>;
/**
 * Resolve final configuration with environment variable overrides
 */
export declare function resolveConfig(): Promise<ResolvedConfig>;
//# sourceMappingURL=config.d.ts.map