import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ClaudeConfig, ResolvedConfig, MCPServersConfig, PluginsConfig } from '../types/config.js';
import { logger } from './logger.js';

/**
 * Load Claude configuration from .claude/config.json
 * Checks in order:
 * 1. Global config: ~/.claude/config.json
 * 2. Project config: .claude/config.json (current working directory)
 * 3. Working directory config: {workingDirectory}/.claude/config.json
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
  }

  return merged;
}

/**
 * Resolve final configuration with environment variable overrides
 */
export async function resolveConfig(): Promise<ResolvedConfig> {
  // Get working directory from env or default to current directory
  const workingDirectory = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();

  // Load Claude config files
  const claudeConfig = await loadClaudeConfig(workingDirectory);

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

  const resolved: ResolvedConfig = {
    workingDirectory,
    permissionMode,
    mcpServers,
    plugins,
  };

  // Log configuration summary
  logger.info('Configuration resolved:');
  logger.info(`  Working directory: ${resolved.workingDirectory}`);
  logger.info(`  Permission mode: ${resolved.permissionMode}`);

  if (mcpServers && Object.keys(mcpServers).length > 0) {
    logger.info(`  MCP servers: ${Object.keys(mcpServers).join(', ')}`);
  } else {
    logger.info('  MCP servers: none');
  }

  if (plugins && Object.keys(plugins).length > 0) {
    logger.info(`  Plugins: ${Object.keys(plugins).join(', ')}`);
  } else {
    logger.info('  Plugins: none');
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
