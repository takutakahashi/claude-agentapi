import { readdir, readFile, access } from 'fs/promises';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import type { ResolvedConfig } from '../types/config.js';
import { logger } from './logger.js';

/**
 * Information about a discovered slash command (.md file based)
 */
export interface SlashCommandInfo {
  /** Command name (filename without .md extension) */
  name: string;
  /** Description from frontmatter */
  description?: string;
  /** Source of the command */
  source: 'plugin' | 'project' | 'user';
  /** Plugin name (only when source is 'plugin') */
  pluginName?: string;
  /** Absolute path to the .md file */
  filePath: string;
}

/**
 * Parse simple YAML-like frontmatter from a markdown file.
 * Handles the format used by Claude Code plugin commands:
 *   ---
 *   description: "Some description"
 *   argument-hint: "<arg>"
 *   hide-from-slash-command-tool: "true"
 *   ---
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Find frontmatter block between --- delimiters
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return result;
  }

  const frontmatter = match[1];

  for (const line of frontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    // Strip surrounding quotes if present
    const value = rawValue.replace(/^["']|["']$/g, '');
    result[key] = value;
  }

  return result;
}

/**
 * List all .md files in a directory.
 * Returns empty array if directory does not exist.
 */
async function listMdFiles(dir: string): Promise<string[]> {
  try {
    await access(dir);
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && extname(e.name).toLowerCase() === '.md')
      .map(e => join(dir, e.name));
  } catch {
    logger.debug(`Slash command directory not found or unreadable: ${dir}`);
    return [];
  }
}

/**
 * Parse a single .md command file and return SlashCommandInfo,
 * or null if the command should be hidden.
 */
async function parseCommandFile(
  filePath: string,
  source: 'plugin' | 'project' | 'user',
  pluginName?: string
): Promise<SlashCommandInfo | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    // Skip commands that are hidden from the slash command tool
    if (frontmatter['hide-from-slash-command-tool'] === 'true') {
      logger.debug(`Skipping hidden command: ${filePath}`);
      return null;
    }

    const name = basename(filePath, '.md');
    const description = frontmatter['description'];

    return {
      name,
      description,
      source,
      pluginName,
      filePath,
    };
  } catch (error) {
    logger.warn(`Failed to parse command file ${filePath}:`, error);
    return null;
  }
}

/**
 * Discover slash commands from a plugin directory.
 * Looks for *.md files in {pluginPath}/commands/
 */
async function discoverPluginSlashCommands(
  pluginPath: string
): Promise<SlashCommandInfo[]> {
  const pluginName = basename(pluginPath);
  const commandsDir = join(pluginPath, 'commands');
  const files = await listMdFiles(commandsDir);

  const results: SlashCommandInfo[] = [];
  for (const filePath of files) {
    const info = await parseCommandFile(filePath, 'plugin', pluginName);
    if (info) results.push(info);
  }

  logger.debug(`Found ${results.length} slash commands in plugin: ${pluginName}`);
  return results;
}

/**
 * Discover all slash commands from all sources:
 * 1. Enabled SDK plugins (from settings.json) → {pluginPath}/commands/*.md
 * 2. Project-level commands → {workingDirectory}/.claude/commands/*.md
 * 3. User-level commands → ~/.claude/commands/*.md
 */
export async function discoverAllSlashCommands(
  config: ResolvedConfig
): Promise<SlashCommandInfo[]> {
  const all: SlashCommandInfo[] = [];

  // 1. Plugin commands
  if (config.sdkPlugins) {
    for (const plugin of config.sdkPlugins) {
      const commands = await discoverPluginSlashCommands(plugin.path);
      all.push(...commands);
    }
  }

  // 2. Project-level commands
  const projectCommandsDir = join(config.workingDirectory, '.claude', 'commands');
  const projectFiles = await listMdFiles(projectCommandsDir);
  for (const filePath of projectFiles) {
    const info = await parseCommandFile(filePath, 'project');
    if (info) all.push(info);
  }

  // 3. User-level commands
  const userCommandsDir = join(homedir(), '.claude', 'commands');
  const userFiles = await listMdFiles(userCommandsDir);
  for (const filePath of userFiles) {
    const info = await parseCommandFile(filePath, 'user');
    if (info) all.push(info);
  }

  logger.debug(`Total slash commands discovered: ${all.length}`);
  return all;
}
