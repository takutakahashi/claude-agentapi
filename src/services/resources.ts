import type { Resource } from '../types/api.js';
import type { ResolvedConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { discoverAllSlashCommands } from '../utils/slash-commands.js';

/**
 * Get available resources (skills, slash_commands, subagents) from the configuration
 */
export async function getAvailableResources(config: ResolvedConfig): Promise<Resource[]> {
  const resources: Resource[] = [];

  // Add skills/plugins
  if (config.plugins) {
    for (const [name, pluginConfig] of Object.entries(config.plugins)) {
      if (pluginConfig.enabled !== false) {
        resources.push({
          type: 'skill',
          name,
          description: pluginConfig.description,
          metadata: pluginConfig.config,
        });
      }
    }
  }

  // Add SDK plugins (from settings.json)
  if (config.sdkPlugins) {
    for (const plugin of config.sdkPlugins) {
      // Extract plugin name from path
      const pluginName = plugin.path.split('/').pop() || plugin.path;
      resources.push({
        type: 'skill',
        name: pluginName,
        description: `Plugin from ${plugin.path}`,
        metadata: {
          path: plugin.path,
          source: 'settings.json',
        },
      });
    }
  }

  // Add slash commands from plugins, project, and user directories
  const slashCommands = await discoverAllSlashCommands(config);
  for (const cmd of slashCommands) {
    resources.push({
      type: 'slash_command',
      name: cmd.name,
      description: cmd.description,
      metadata: {
        source: cmd.source,
        ...(cmd.pluginName ? { pluginName: cmd.pluginName } : {}),
        filePath: cmd.filePath,
      },
    });
  }

  // Add subagents (placeholder - will be populated when SDK supports subagents)
  // Currently Claude Agent SDK doesn't have explicit subagent support,
  // but this can be extended in the future

  logger.debug(`Found ${resources.length} resources`);
  return resources;
}
