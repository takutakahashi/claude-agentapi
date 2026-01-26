#!/usr/bin/env node

// Parse command-line arguments
const args = process.argv.slice(2);

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
