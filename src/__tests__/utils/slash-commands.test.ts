import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseFrontmatter, discoverAllSlashCommands } from '../../utils/slash-commands.js';
import type { ResolvedConfig } from '../../types/config.js';

// ---- parseFrontmatter tests ----

describe('parseFrontmatter', () => {
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('no frontmatter here')).toEqual({});
  });

  it('parses basic key-value pairs', () => {
    const content = `---
description: Create a git commit
argument-hint: <message>
---
body here`;
    expect(parseFrontmatter(content)).toEqual({
      description: 'Create a git commit',
      'argument-hint': '<message>',
    });
  });

  it('strips surrounding quotes from values', () => {
    const content = `---
description: "Quoted description"
argument-hint: 'single quoted'
---`;
    expect(parseFrontmatter(content)).toEqual({
      description: 'Quoted description',
      'argument-hint': 'single quoted',
    });
  });

  it('parses hide-from-slash-command-tool', () => {
    const content = `---
description: Hidden command
hide-from-slash-command-tool: "true"
---`;
    const result = parseFrontmatter(content);
    expect(result['hide-from-slash-command-tool']).toBe('true');
  });

  it('ignores comment lines', () => {
    const content = `---
# this is a comment
description: Test
---`;
    expect(parseFrontmatter(content)).toEqual({ description: 'Test' });
  });
});

// ---- discoverAllSlashCommands tests ----

describe('discoverAllSlashCommands', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `slash-cmd-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
    return {
      workingDirectory: testDir,
      permissionMode: 'default',
      ...overrides,
    };
  }

  it('returns empty array when no commands exist', async () => {
    const config = makeConfig();
    const result = await discoverAllSlashCommands(config);
    expect(result).toEqual([]);
  });

  it('discovers project-level commands', async () => {
    const commandsDir = join(testDir, '.claude', 'commands');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(
      join(commandsDir, 'my-command.md'),
      `---\ndescription: My custom command\n---\nDo something.`
    );

    const config = makeConfig();
    const result = await discoverAllSlashCommands(config);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'my-command',
      description: 'My custom command',
      source: 'project',
    });
  });

  it('discovers plugin slash commands', async () => {
    const pluginDir = join(testDir, 'my-plugin');
    const commandsDir = join(pluginDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(
      join(commandsDir, 'commit.md'),
      `---\ndescription: Create a git commit\n---\nCommit the changes.`
    );

    const config = makeConfig({
      sdkPlugins: [{ type: 'local', path: pluginDir }],
    });
    const result = await discoverAllSlashCommands(config);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'commit',
      description: 'Create a git commit',
      source: 'plugin',
      pluginName: 'my-plugin',
    });
  });

  it('excludes commands with hide-from-slash-command-tool: "true"', async () => {
    const commandsDir = join(testDir, '.claude', 'commands');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(
      join(commandsDir, 'hidden.md'),
      `---\ndescription: Hidden\nhide-from-slash-command-tool: "true"\n---\nHidden body.`
    );
    await writeFile(
      join(commandsDir, 'visible.md'),
      `---\ndescription: Visible\n---\nVisible body.`
    );

    const config = makeConfig();
    const result = await discoverAllSlashCommands(config);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('visible');
  });

  it('handles missing commands directory gracefully', async () => {
    // testDir has no .claude/commands subdirectory
    const config = makeConfig();
    await expect(discoverAllSlashCommands(config)).resolves.toEqual([]);
  });

  it('aggregates commands from multiple sources', async () => {
    // Project command
    const projectCommandsDir = join(testDir, '.claude', 'commands');
    await mkdir(projectCommandsDir, { recursive: true });
    await writeFile(
      join(projectCommandsDir, 'project-cmd.md'),
      `---\ndescription: Project command\n---`
    );

    // Plugin command
    const pluginDir = join(testDir, 'plugin-a');
    const pluginCommandsDir = join(pluginDir, 'commands');
    await mkdir(pluginCommandsDir, { recursive: true });
    await writeFile(
      join(pluginCommandsDir, 'plugin-cmd.md'),
      `---\ndescription: Plugin command\n---`
    );

    const config = makeConfig({
      sdkPlugins: [{ type: 'local', path: pluginDir }],
    });
    const result = await discoverAllSlashCommands(config);

    expect(result).toHaveLength(2);
    const names = result.map(r => r.name);
    expect(names).toContain('project-cmd');
    expect(names).toContain('plugin-cmd');
  });
});
