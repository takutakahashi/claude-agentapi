#!/usr/bin/env node

// Parse command-line arguments
const args = process.argv.slice(2);

// Check for --help or -h flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claude-agentapi - coder/agentapi compatible HTTP API server using Claude Agent SDK

Usage: claude-agentapi [options]

Options:
  -h, --help                         Show this help message
  -w, --working-directory <path>     Set the working directory for the agent
  -p, --permission-mode <mode>       Set permission mode (default|acceptEdits|bypassPermissions)
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
`);
  process.exit(0);
}

// Check for --dangerously-skip-permissions flag
if (args.includes('--dangerously-skip-permissions')) {
  process.env.DANGEROUSLY_SKIP_PERMISSIONS = 'true';
  console.warn('⚠️  WARNING: All permission checks are disabled. Use with extreme caution!');
}

// Check for --working-directory option
const workingDirIndex = args.findIndex(arg => arg === '--working-directory' || arg === '-w');
if (workingDirIndex !== -1 && args[workingDirIndex + 1]) {
  process.env.CLAUDE_WORKING_DIRECTORY = args[workingDirIndex + 1];
}

// Check for --permission-mode option
const permissionModeIndex = args.findIndex(arg => arg === '--permission-mode' || arg === '-p');
if (permissionModeIndex !== -1 && args[permissionModeIndex + 1]) {
  process.env.CLAUDE_PERMISSION_MODE = args[permissionModeIndex + 1];
}

// Import and run the main application
import('../dist/index.js');
