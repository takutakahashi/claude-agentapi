import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAvailableResources } from '../../services/resources.js';
import type { ResolvedConfig } from '../../types/config.js';
import type { SlashCommandInfo } from '../../utils/slash-commands.js';

// Mock slash-commands utility
vi.mock('../../utils/slash-commands.js', () => ({
  discoverAllSlashCommands: vi.fn(),
}));

import { discoverAllSlashCommands } from '../../utils/slash-commands.js';

describe('getAvailableResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (discoverAllSlashCommands as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
    return {
      workingDirectory: '/tmp/test',
      permissionMode: 'default',
      ...overrides,
    };
  }

  it('returns empty array when no resources configured', async () => {
    const config = makeConfig();
    const result = await getAvailableResources(config);
    expect(result).toEqual([]);
  });

  it('returns skill resources from plugins config', async () => {
    const config = makeConfig({
      plugins: {
        'my-plugin': {
          enabled: true,
          description: 'A test plugin',
          config: { key: 'value' },
        },
      },
    });

    const result = await getAvailableResources(config);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'skill',
      name: 'my-plugin',
      description: 'A test plugin',
    });
  });

  it('excludes plugins with enabled: false', async () => {
    const config = makeConfig({
      plugins: {
        'disabled-plugin': { enabled: false, description: 'Disabled' },
        'enabled-plugin': { enabled: true, description: 'Enabled' },
      },
    });

    const result = await getAvailableResources(config);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled-plugin');
  });

  it('returns skill resources from sdkPlugins', async () => {
    const config = makeConfig({
      sdkPlugins: [{ type: 'local', path: '/path/to/commit-commands' }],
    });

    const result = await getAvailableResources(config);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'skill',
      name: 'commit-commands',
      metadata: { path: '/path/to/commit-commands', source: 'settings.json' },
    });
  });

  it('returns slash_command resources from discovered slash commands', async () => {
    const mockCommands: SlashCommandInfo[] = [
      {
        name: 'commit',
        description: 'Create a git commit',
        source: 'plugin',
        pluginName: 'commit-commands',
        filePath: '/path/to/commit.md',
      },
      {
        name: 'my-cmd',
        description: 'My project command',
        source: 'project',
        filePath: '/project/.claude/commands/my-cmd.md',
      },
    ];
    (discoverAllSlashCommands as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommands);

    const config = makeConfig();
    const result = await getAvailableResources(config);

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      type: 'slash_command',
      name: 'commit',
      description: 'Create a git commit',
      metadata: {
        source: 'plugin',
        pluginName: 'commit-commands',
        filePath: '/path/to/commit.md',
      },
    });

    expect(result[1]).toMatchObject({
      type: 'slash_command',
      name: 'my-cmd',
      description: 'My project command',
      metadata: {
        source: 'project',
        filePath: '/project/.claude/commands/my-cmd.md',
      },
    });
    // pluginName should not be present for project commands
    expect(result[1].metadata).not.toHaveProperty('pluginName');
  });

  it('aggregates skills and slash_commands together', async () => {
    const mockCommands: SlashCommandInfo[] = [
      {
        name: 'review-pr',
        description: 'Review PR',
        source: 'plugin',
        pluginName: 'pr-review-toolkit',
        filePath: '/path/review-pr.md',
      },
    ];
    (discoverAllSlashCommands as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommands);

    const config = makeConfig({
      plugins: { 'my-skill': { enabled: true } },
    });

    const result = await getAvailableResources(config);

    expect(result).toHaveLength(2);
    const types = result.map(r => r.type);
    expect(types).toContain('skill');
    expect(types).toContain('slash_command');
  });
});
