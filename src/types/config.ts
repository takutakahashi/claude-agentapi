/**
 * Claude Code compatible configuration types
 * Based on the same structure used by Claude Code CLI
 */

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
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
}

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
  /** Plugins/skills configuration */
  plugins?: PluginsConfig;
}
