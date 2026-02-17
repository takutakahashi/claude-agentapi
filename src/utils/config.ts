import { readFile, access, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ClaudeConfig, ResolvedConfig, MCPServersConfig, PluginsConfig, ClaudeSettings, SdkPluginConfig, SettingSource } from '../types/config.js';
import { logger } from './logger.js';

/**
 * Load MCP config from --mcp-config option
 * Supports both JSON string and file path
 */
async function loadMcpConfigFromOption(): Promise<ClaudeConfig | null> {
  const mcpConfigOption = process.env.CLAUDE_MCP_CONFIG;
  if (!mcpConfigOption) {
    return null;
  }

  try {
    // First, try to parse as JSON string
    try {
      const parsed = JSON.parse(mcpConfigOption);
      logger.info('Loaded MCP config from --mcp-config (JSON string)');
      return parsed as ClaudeConfig;
    } catch {
      // If not valid JSON, try as file path
      const content = await readFile(mcpConfigOption, 'utf-8');
      const parsed = JSON.parse(content);
      logger.info(`Loaded MCP config from --mcp-config (file): ${mcpConfigOption}`);
      return parsed as ClaudeConfig;
    }
  } catch (error) {
    logger.error(`Failed to load MCP config from --mcp-config: ${error}`);
    return null;
  }
}

/**
 * Load Claude configuration from .claude/config.json
 * Checks in order:
 * 1. Global config: ~/.claude/config.json
 * 2. Project config: .claude/config.json (current working directory)
 * 3. Working directory config: {workingDirectory}/.claude/config.json
 * 4. --mcp-config option (highest priority)
 */
export async function loadClaudeConfig(workingDirectory?: string): Promise<ClaudeConfig> {
  const configs: ClaudeConfig[] = [];

  // 1. Load global config
  const globalConfigPath = join(homedir(), '.claude', 'config.json');
  const globalConfig = await loadConfigFile(globalConfigPath);
  if (globalConfig) {
    configs.push(globalConfig);
    logger.info(`Loaded global config from: ${globalConfigPath}`);
  }

  // 2. Load project config (from current working directory)
  const projectConfigPath = join(process.cwd(), '.claude', 'config.json');
  if (projectConfigPath !== globalConfigPath) {
    const projectConfig = await loadConfigFile(projectConfigPath);
    if (projectConfig) {
      configs.push(projectConfig);
      logger.info(`Loaded project config from: ${projectConfigPath}`);
    }
  }

  // 3. Load working directory config (if specified and different)
  if (workingDirectory) {
    const workingDirConfigPath = join(workingDirectory, '.claude', 'config.json');
    if (workingDirConfigPath !== globalConfigPath && workingDirConfigPath !== projectConfigPath) {
      const workingDirConfig = await loadConfigFile(workingDirConfigPath);
      if (workingDirConfig) {
        configs.push(workingDirConfig);
        logger.info(`Loaded working directory config from: ${workingDirConfigPath}`);
      }
    }
  }

  // 4. Load MCP config from --mcp-config option (highest priority)
  const mcpConfigFromOption = await loadMcpConfigFromOption();
  if (mcpConfigFromOption) {
    configs.push(mcpConfigFromOption);
  }

  // Merge all configs (later configs override earlier ones)
  return mergeConfigs(configs);
}

/**
 * Load a single config file
 */
async function loadConfigFile(path: string): Promise<ClaudeConfig | null> {
  try {
    // Check if file exists
    await access(path);

    const content = await readFile(path, 'utf-8');
    const config = JSON.parse(content) as ClaudeConfig;

    return config;
  } catch (error) {
    // File doesn't exist or can't be read - this is not an error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`Config file not found: ${path}`);
    } else {
      logger.warn(`Failed to load config from ${path}:`, error);
    }
    return null;
  }
}

/**
 * Merge multiple config objects
 * Later configs override earlier ones
 */
function mergeConfigs(configs: ClaudeConfig[]): ClaudeConfig {
  const merged: ClaudeConfig = {};

  for (const config of configs) {
    // Merge mcpServers
    if (config.mcpServers) {
      merged.mcpServers = {
        ...merged.mcpServers,
        ...config.mcpServers,
      };
    }

    // Merge plugins
    if (config.plugins) {
      merged.plugins = {
        ...merged.plugins,
        ...config.plugins,
      };
    }

    // Merge skills (alias for plugins)
    if (config.skills) {
      merged.skills = {
        ...merged.skills,
        ...config.skills,
      };
    }

    // Merge hooks
    if (config.hooks) {
      merged.hooks = {
        ...merged.hooks,
        ...config.hooks,
      };
    }

    // Merge allowedTools (concatenate arrays)
    if (config.allowedTools) {
      merged.allowedTools = [
        ...(merged.allowedTools || []),
        ...config.allowedTools,
      ];
    }

    // Merge env
    if (config.env) {
      merged.env = {
        ...merged.env,
        ...config.env,
      };
    }
  }

  return merged;
}

/**
 * Load Claude settings from ~/.claude/settings.json
 */
async function loadClaudeSettings(): Promise<ClaudeSettings | null> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');

  try {
    await access(settingsPath);
    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as ClaudeSettings;
    logger.debug(`Loaded settings from: ${settingsPath}`);
    return settings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`Settings file not found: ${settingsPath}`);
    } else {
      logger.warn(`Failed to load settings from ${settingsPath}:`, error);
    }
    return null;
  }
}

/**
 * Resolve plugin path from marketplace
 */
async function resolvePluginPath(
  pluginName: string,
  marketplace: string,
  settings: ClaudeSettings | null
): Promise<string | null> {
  // Get marketplace path
  let marketplacePath: string;

  if (settings?.extraKnownMarketplaces?.[marketplace]) {
    // Use custom marketplace path from settings
    marketplacePath = settings.extraKnownMarketplaces[marketplace].source.path;
  } else {
    // Use default marketplace path
    marketplacePath = join(
      homedir(),
      '.claude',
      'plugins',
      'marketplaces',
      marketplace
    );
  }

  // Construct plugin path
  const pluginPath = join(marketplacePath, 'plugins', pluginName);

  // Check if plugin directory exists
  try {
    const stats = await stat(pluginPath);
    if (stats.isDirectory()) {
      logger.debug(`Resolved plugin ${pluginName}@${marketplace} to: ${pluginPath}`);
      return pluginPath;
    }
  } catch (error) {
    logger.debug(`Plugin not found: ${pluginPath}`);
  }

  return null;
}

/**
 * Convert enabled plugins from settings.json to SDK format
 */
async function resolvePluginsFromSettings(settings: ClaudeSettings | null): Promise<SdkPluginConfig[]> {
  if (!settings?.enabledPlugins) {
    return [];
  }

  const sdkPlugins: SdkPluginConfig[] = [];

  for (const [fullName, enabled] of Object.entries(settings.enabledPlugins)) {
    if (!enabled) {
      continue;
    }

    // Parse plugin name: "name@marketplace" or just "name"
    const [pluginName, marketplace = 'claude-plugins-official'] = fullName.split('@');

    // Resolve plugin path
    const pluginPath = await resolvePluginPath(pluginName, marketplace, settings);

    if (pluginPath) {
      sdkPlugins.push({
        type: 'local',
        path: pluginPath,
      });
      logger.debug(`Added plugin: ${fullName} from ${pluginPath}`);
    } else {
      logger.warn(`Plugin ${fullName} not found, skipping`);
    }
  }

  return sdkPlugins;
}

/**
 * Resolve final configuration with environment variable overrides
 */
export async function resolveConfig(): Promise<ResolvedConfig> {
  // Get working directory from env or default to current directory
  const workingDirectory = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();

  // Load Claude config files
  const claudeConfig = await loadClaudeConfig(workingDirectory);

  // Load Claude settings
  const settings = await loadClaudeSettings();

  // Determine permission mode
  let permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' = 'default';

  if (process.env.DANGEROUSLY_SKIP_PERMISSIONS === 'true') {
    permissionMode = 'bypassPermissions';
    logger.warn('⚠️  WARNING: All permission checks are disabled (bypassPermissions mode)');
  } else if (process.env.CLAUDE_PERMISSION_MODE) {
    const mode = process.env.CLAUDE_PERMISSION_MODE;
    if (mode === 'default' || mode === 'acceptEdits' || mode === 'bypassPermissions') {
      permissionMode = mode;
    } else {
      logger.warn(`Invalid permission mode: ${mode}. Using default.`);
    }
  }

  // Filter out disabled MCP servers
  const mcpServers = filterEnabledMCPServers(claudeConfig.mcpServers);

  // Merge plugins and skills
  const plugins: PluginsConfig = {
    ...claudeConfig.skills,
    ...claudeConfig.plugins,
  };

  // Resolve SDK plugins from settings.json
  const sdkPlugins = await resolvePluginsFromSettings(settings);

  // Determine setting sources for loading CLAUDE.md files
  // Default: ['user', 'project'] to enable CLAUDE.md loading
  let settingSources: SettingSource[] = ['user', 'project'];

  // Allow override via environment variable (comma-separated)
  if (process.env.CLAUDE_SETTING_SOURCES) {
    const sources = process.env.CLAUDE_SETTING_SOURCES.split(',').map(s => s.trim()) as SettingSource[];
    // Validate sources
    const validSources = sources.filter(s => ['user', 'project', 'local'].includes(s));
    if (validSources.length > 0) {
      settingSources = validSources;
    } else {
      logger.warn(`Invalid CLAUDE_SETTING_SOURCES: ${process.env.CLAUDE_SETTING_SOURCES}. Using default: user,project`);
    }
  }

  const resolved: ResolvedConfig = {
    workingDirectory,
    permissionMode,
    mcpServers,
    plugins,
    sdkPlugins: sdkPlugins.length > 0 ? sdkPlugins : undefined,
    hooks: claudeConfig.hooks,
    allowedTools: claudeConfig.allowedTools,
    env: claudeConfig.env,
    settingSources,
  };

  // Log configuration summary
  logger.info('Configuration resolved:');
  logger.info(`  Working directory: ${resolved.workingDirectory}`);
  logger.info(`  Permission mode: ${resolved.permissionMode}`);
  logger.info(`  Setting sources: ${resolved.settingSources?.join(', ') || 'none'} (CLAUDE.md enabled: ${resolved.settingSources?.includes('project') ? 'yes' : 'no'})`);

  if (mcpServers && Object.keys(mcpServers).length > 0) {
    logger.info(`  MCP servers: ${Object.keys(mcpServers).join(', ')}`);
  } else {
    logger.info('  MCP servers: none');
  }

  if (sdkPlugins.length > 0) {
    logger.info(`  SDK Plugins: ${sdkPlugins.length} plugin(s) loaded from settings.json`);
  } else {
    logger.info('  SDK Plugins: none');
  }

  if (resolved.hooks && Object.keys(resolved.hooks).length > 0) {
    logger.info(`  Hooks: ${Object.keys(resolved.hooks).join(', ')}`);
  } else {
    logger.info('  Hooks: none');
  }

  return resolved;
}

/**
 * Filter out disabled MCP servers
 */
function filterEnabledMCPServers(servers?: MCPServersConfig): MCPServersConfig | undefined {
  if (!servers) {
    return undefined;
  }

  const enabled: MCPServersConfig = {};

  for (const [name, config] of Object.entries(servers)) {
    if (!config.disabled) {
      enabled[name] = config;
    } else {
      logger.info(`MCP server '${name}' is disabled, skipping`);
    }
  }

  return Object.keys(enabled).length > 0 ? enabled : undefined;
}
