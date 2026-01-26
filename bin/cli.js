#!/usr/bin/env bun

const HELP_TEXT = `
claude-agentapi - coder/agentapi compatible HTTP API server using Claude Agent SDK

Usage: claude-agentapi [options]

Options:
  -h, --help                         Show this help message
  -w, --working-directory <path>     Set the working directory for the agent
  -p, --permission-mode <mode>       Set permission mode (default|acceptEdits|bypassPermissions)
  --mcp-config <json|path>           MCP servers configuration (JSON string or file path)
  --dangerously-skip-permissions     Bypass all permission checks (use with caution!)

Environment Variables:
  PORT                               Server port (default: 3000)
  HOST                               Server host (default: localhost)
  CLAUDE_MODEL                       Claude model name (default: claude-sonnet-4-5-20250929)
  CLAUDE_CODE_USE_BEDROCK           Use AWS Bedrock (1) or Anthropic API (0)
  AWS_REGION                        AWS region (when using Bedrock)
  AWS_ACCESS_KEY_ID                 AWS access key (when using Bedrock)
  AWS_SECRET_ACCESS_KEY             AWS secret key (when using Bedrock)
  ANTHROPIC_API_KEY                 Anthropic API key
  ANTHROPIC_OAUTH_TOKEN             Anthropic OAuth token
  CLAUDE_WORKING_DIRECTORY          Working directory for the agent
  CLAUDE_PERMISSION_MODE            Permission mode
  DEBUG                             Enable debug logging

Configuration:
  MCP servers, plugins, and other settings are loaded from:
  1. Global config: ~/.claude/config.json
  2. Project config: .claude/config.json
  3. Working directory config: {workingDirectory}/.claude/config.json

For more information, visit: https://github.com/takutakahashi/claude-agentapi
`;

/**
 * Find the value of an argument option by its flags
 */
function getArgValue(args, ...flags) {
  const index = args.findIndex(arg => flags.includes(arg));
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return null;
}

/**
 * Check if an argument flag is present
 */
function hasFlag(args, ...flags) {
  return args.some(arg => flags.includes(arg));
}

// Parse command-line arguments
const args = process.argv.slice(2);

// Handle --help flag
if (hasFlag(args, '--help', '-h')) {
  console.log(HELP_TEXT);
  process.exit(0);
}

// Handle --dangerously-skip-permissions flag
if (hasFlag(args, '--dangerously-skip-permissions')) {
  process.env.DANGEROUSLY_SKIP_PERMISSIONS = 'true';
  console.warn('WARNING: All permission checks are disabled. Use with extreme caution!');
}

// Set environment variables from CLI options
const workingDir = getArgValue(args, '--working-directory', '-w');
if (workingDir) {
  process.env.CLAUDE_WORKING_DIRECTORY = workingDir;
}

const permissionMode = getArgValue(args, '--permission-mode', '-p');
if (permissionMode) {
  process.env.CLAUDE_PERMISSION_MODE = permissionMode;
}

const mcpConfig = getArgValue(args, '--mcp-config');
if (mcpConfig) {
  process.env.CLAUDE_MCP_CONFIG = mcpConfig;
}

// Import and run the main application
import('../dist/index.js');
