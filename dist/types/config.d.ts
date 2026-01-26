/**
 * Claude Code compatible configuration types
 * Based on the same structure used by Claude Code CLI
 */
/**
 * MCP Server configuration - stdio type
 */
export interface MCPServerStdioConfig {
    /** Transport type */
    type?: 'stdio';
    /** Command to execute the MCP server */
    command: string;
    /** Arguments to pass to the command */
    args?: string[];
    /** Environment variables for the server process */
    env?: Record<string, string>;
    /** Whether the server is disabled */
    disabled?: boolean;
}
/**
 * MCP Server configuration - HTTP type
 */
export interface MCPServerHttpConfig {
    /** Transport type */
    type: 'http' | 'sse';
    /** Server URL */
    url: string;
    /** HTTP headers */
    headers?: Record<string, string>;
    /** Environment variables */
    env?: Record<string, string>;
    /** Whether the server is disabled */
    disabled?: boolean;
}
/**
 * MCP Server configuration (union type)
 */
export type MCPServerConfig = MCPServerStdioConfig | MCPServerHttpConfig;
/**
 * MCP Servers configuration map
 */
export type MCPServersConfig = Record<string, MCPServerConfig>;
/**
 * Plugin configuration
 */
export interface PluginConfig {
    /** Whether the plugin is enabled */
    enabled?: boolean;
    /** Plugin-specific configuration */
    config?: Record<string, unknown>;
}
/**
 * Plugins configuration map
 */
export type PluginsConfig = Record<string, PluginConfig>;
/**
 * Hook configuration
 */
export interface HookConfig {
    /** Command to execute */
    command: string;
    /** Arguments to pass to the command */
    args?: string[];
    /** Environment variables for the hook process */
    env?: Record<string, string>;
}
/**
 * Hooks configuration map
 * Hooks are executed at specific events (e.g., user-prompt-submit-hook, tool-call-hook)
 */
export type HooksConfig = Record<string, HookConfig>;
/**
 * Custom command configuration
 */
export interface CommandConfig {
    /** Command to execute */
    command: string;
    /** Arguments to pass to the command */
    args?: string[];
    /** Environment variables for the command process */
    env?: Record<string, string>;
    /** Description of what the command does */
    description?: string;
}
/**
 * Commands configuration map
 * Custom commands that can be invoked (e.g., /deploy, /test)
 */
export type CommandsConfig = Record<string, CommandConfig>;
/**
 * Main Claude configuration structure
 * Compatible with Claude Code's .claude/config.json
 */
export interface ClaudeConfig {
    /** MCP server configurations */
    mcpServers?: MCPServersConfig;
    /** Plugin configurations */
    plugins?: PluginsConfig;
    /** Skills configurations (alias for plugins) */
    skills?: PluginsConfig;
    /** Hook configurations */
    hooks?: HooksConfig;
    /** Custom command configurations */
    commands?: CommandsConfig;
    /** Allowed tools (for MCP tool permissions) - supports wildcards like "mcp__servername__*" */
    allowedTools?: string[];
    /** Environment variables */
    env?: Record<string, string>;
}
/**
 * Claude Code settings.json structure
 */
export interface ClaudeSettings {
    /** Enabled plugins map (name@marketplace -> boolean) */
    enabledPlugins?: Record<string, boolean>;
    /** Environment variables */
    env?: Record<string, string>;
    /** Extra known marketplaces configuration */
    extraKnownMarketplaces?: Record<string, {
        source: {
            source: string;
            path: string;
        };
    }>;
    /** Other settings */
    settings?: Record<string, unknown>;
}
/**
 * SDK plugin configuration
 */
export interface SdkPluginConfig {
    type: 'local';
    path: string;
}
/**
 * Setting source type for loading settings and CLAUDE.md files
 */
export type SettingSource = 'user' | 'project' | 'local';
/**
 * Merged configuration with environment variable overrides
 */
export interface ResolvedConfig {
    /** Working directory for the agent */
    workingDirectory: string;
    /** Permission mode */
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
    /** MCP servers to be passed to the Agent SDK */
    mcpServers?: MCPServersConfig;
    /** Plugins/skills configuration (from config.json) */
    plugins?: PluginsConfig;
    /** Resolved SDK plugins (from settings.json) */
    sdkPlugins?: SdkPluginConfig[];
    /** Hooks configuration */
    hooks?: HooksConfig;
    /** Custom commands configuration */
    commands?: CommandsConfig;
    /** Allowed tools (for MCP tool permissions) */
    allowedTools?: string[];
    /** Environment variables */
    env?: Record<string, string>;
    /** Setting sources for loading CLAUDE.md and settings files */
    settingSources?: SettingSource[];
}
//# sourceMappingURL=config.d.ts.map