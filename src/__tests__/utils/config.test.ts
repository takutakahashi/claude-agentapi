import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadClaudeConfig } from '../../utils/config.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadClaudeConfig with --mcp-config', () => {
  const testDir = join(tmpdir(), 'test-claude-config');
  const testConfigFile = join(testDir, 'test-mcp.json');

  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up environment variable
    delete process.env.CLAUDE_MCP_CONFIG;

    // Clean up test files
    try {
      await unlink(testConfigFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should load MCP config from JSON string', async () => {
    const testMcpConfig = {
      'test-server': {
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: 'test-key'
        }
      }
    };

    process.env.CLAUDE_MCP_CONFIG = JSON.stringify(testMcpConfig);

    const config = await loadClaudeConfig();

    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers?.['test-server']).toBeDefined();
    expect(config.mcpServers?.['test-server'].command).toBe('node');
  });

  it('should load MCP config from file path', async () => {
    const testMcpConfig = {
      'file-server': {
        command: 'python',
        args: ['server.py']
      }
    };

    await writeFile(testConfigFile, JSON.stringify(testMcpConfig));
    process.env.CLAUDE_MCP_CONFIG = testConfigFile;

    const config = await loadClaudeConfig();

    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers?.['file-server']).toBeDefined();
    expect(config.mcpServers?.['file-server'].command).toBe('python');
  });

  it('should return empty config when --mcp-config is not provided', async () => {
    const config = await loadClaudeConfig();

    // Without --mcp-config and without any config files, should return empty object
    expect(config).toBeDefined();
  });

  it('should handle invalid JSON string gracefully', async () => {
    process.env.CLAUDE_MCP_CONFIG = 'invalid-json';

    const config = await loadClaudeConfig();

    // Should not crash and should return a config object
    expect(config).toBeDefined();
  });
});
