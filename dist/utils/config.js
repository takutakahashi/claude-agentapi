import { readFile, access, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from './logger.js';
/**
 * Try to parse a string as JSON
 * Returns the parsed result or null if parsing fails
 */
function tryParseJson(str) {
    try {
        return JSON.parse(str);
    }
    catch {
        return null;
    }
}
/**
 * Load MCP config from --mcp-config option
 * Supports both JSON string and file path
 */
async function loadMcpConfigFromOption() {
    const mcpConfigOption = process.env.CLAUDE_MCP_CONFIG;
    if (!mcpConfigOption) {
        return null;
    }
    // First, try to parse as JSON string
    const jsonConfig = tryParseJson(mcpConfigOption);
    if (jsonConfig) {
        logger.info('Loaded MCP config from --mcp-config (JSON string)');
        return jsonConfig;
    }
    // If not valid JSON, try as file path
    try {
        const content = await readFile(mcpConfigOption, 'utf-8');
        const parsed = JSON.parse(content);
        logger.info(`Loaded MCP config from --mcp-config (file): ${mcpConfigOption}`);
        return parsed;
    }
    catch (error) {
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
export async function loadClaudeConfig(workingDirectory) {
    const configs = [];
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
async function loadConfigFile(path) {
    try {
        await access(path);
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        const isNotFound = error.code === 'ENOENT';
        if (isNotFound) {
            logger.debug(`Config file not found: ${path}`);
        }
        else {
            logger.warn(`Failed to load config from ${path}:`, error);
        }
        return null;
    }
}
/**
 * Merge a single object property from source into target
 */
function mergeObjectProperty(target, source, key) {
    if (source[key]) {
        target[key] = { ...target[key], ...source[key] };
    }
}
/**
 * Merge multiple config objects
 * Later configs override earlier ones
 */
function mergeConfigs(configs) {
    const merged = {};
    for (const config of configs) {
        mergeObjectProperty(merged, config, 'mcpServers');
        mergeObjectProperty(merged, config, 'plugins');
        mergeObjectProperty(merged, config, 'skills');
        mergeObjectProperty(merged, config, 'hooks');
        mergeObjectProperty(merged, config, 'commands');
        mergeObjectProperty(merged, config, 'env');
        // Merge allowedTools by concatenation rather than override
        if (config.allowedTools) {
            merged.allowedTools = [...(merged.allowedTools || []), ...config.allowedTools];
        }
    }
    return merged;
}
/**
 * Load Claude settings from ~/.claude/settings.json
 */
async function loadClaudeSettings() {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    try {
        await access(settingsPath);
        const content = await readFile(settingsPath, 'utf-8');
        logger.debug(`Loaded settings from: ${settingsPath}`);
        return JSON.parse(content);
    }
    catch (error) {
        const isNotFound = error.code === 'ENOENT';
        if (isNotFound) {
            logger.debug(`Settings file not found: ${settingsPath}`);
        }
        else {
            logger.warn(`Failed to load settings from ${settingsPath}:`, error);
        }
        return null;
    }
}
/**
 * Get the marketplace base path from settings or use default
 */
function getMarketplacePath(marketplace, settings) {
    const customPath = settings?.extraKnownMarketplaces?.[marketplace]?.source.path;
    if (customPath) {
        return customPath;
    }
    return join(homedir(), '.claude', 'plugins', 'marketplaces', marketplace);
}
/**
 * Resolve plugin path from marketplace
 */
async function resolvePluginPath(pluginName, marketplace, settings) {
    const marketplacePath = getMarketplacePath(marketplace, settings);
    const pluginPath = join(marketplacePath, 'plugins', pluginName);
    try {
        const stats = await stat(pluginPath);
        if (stats.isDirectory()) {
            logger.debug(`Resolved plugin ${pluginName}@${marketplace} to: ${pluginPath}`);
            return pluginPath;
        }
    }
    catch {
        logger.debug(`Plugin not found: ${pluginPath}`);
    }
    return null;
}
/**
 * Convert enabled plugins from settings.json to SDK format
 */
async function resolvePluginsFromSettings(settings) {
    if (!settings?.enabledPlugins) {
        return [];
    }
    const sdkPlugins = [];
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
        }
        else {
            logger.warn(`Plugin ${fullName} not found, skipping`);
        }
    }
    return sdkPlugins;
}
const VALID_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions'];
/**
 * Resolve permission mode from environment variables
 */
function resolvePermissionMode() {
    if (process.env.DANGEROUSLY_SKIP_PERMISSIONS === 'true') {
        logger.warn('WARNING: All permission checks are disabled (bypassPermissions mode)');
        return 'bypassPermissions';
    }
    const mode = process.env.CLAUDE_PERMISSION_MODE;
    if (!mode) {
        return 'default';
    }
    if (VALID_PERMISSION_MODES.includes(mode)) {
        return mode;
    }
    logger.warn(`Invalid permission mode: ${mode}. Using default.`);
    return 'default';
}
/**
 * Resolve final configuration with environment variable overrides
 */
export async function resolveConfig() {
    // Get working directory from env or default to current directory
    const workingDirectory = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
    // Load Claude config files
    const claudeConfig = await loadClaudeConfig(workingDirectory);
    // Load Claude settings
    const settings = await loadClaudeSettings();
    // Determine permission mode
    const permissionMode = resolvePermissionMode();
    // Filter out disabled MCP servers
    const mcpServers = filterEnabledMCPServers(claudeConfig.mcpServers);
    // Merge plugins and skills
    const plugins = {
        ...claudeConfig.skills,
        ...claudeConfig.plugins,
    };
    // Resolve SDK plugins from settings.json
    const sdkPlugins = await resolvePluginsFromSettings(settings);
    const resolved = {
        workingDirectory,
        permissionMode,
        mcpServers,
        plugins,
        sdkPlugins: sdkPlugins.length > 0 ? sdkPlugins : undefined,
        hooks: claudeConfig.hooks,
        commands: claudeConfig.commands,
        allowedTools: claudeConfig.allowedTools,
        env: claudeConfig.env,
    };
    logConfigSummary(resolved, sdkPlugins);
    return resolved;
}
/**
 * Log a summary of the resolved configuration
 */
function logConfigSummary(config, sdkPlugins) {
    const formatKeys = (obj) => obj && Object.keys(obj).length > 0 ? Object.keys(obj).join(', ') : 'none';
    const formatPlugins = () => sdkPlugins.length > 0 ? `${sdkPlugins.length} plugin(s) loaded from settings.json` : 'none';
    logger.info('Configuration resolved:');
    logger.info(`  Working directory: ${config.workingDirectory}`);
    logger.info(`  Permission mode: ${config.permissionMode}`);
    logger.info(`  MCP servers: ${formatKeys(config.mcpServers)}`);
    logger.info(`  SDK Plugins: ${formatPlugins()}`);
    logger.info(`  Hooks: ${formatKeys(config.hooks)}`);
    logger.info(`  Commands: ${formatKeys(config.commands)}`);
}
/**
 * Filter out disabled MCP servers
 */
function filterEnabledMCPServers(servers) {
    if (!servers) {
        return undefined;
    }
    const enabled = {};
    for (const [name, config] of Object.entries(servers)) {
        if (!config.disabled) {
            enabled[name] = config;
        }
        else {
            logger.info(`MCP server '${name}' is disabled, skipping`);
        }
    }
    return Object.keys(enabled).length > 0 ? enabled : undefined;
}
//# sourceMappingURL=config.js.map