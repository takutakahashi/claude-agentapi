# claude-agentapi

A `coder/agentapi` compatible HTTP API server that uses Claude Agent SDK TypeScript on AWS Bedrock.

## Overview

This project implements a server compatible with the [coder/agentapi](https://github.com/coder/agentapi) specification, allowing you to interact with Claude AI agents through a standardized HTTP API. The server uses the Claude Agent SDK V2 and can be configured to use either AWS Bedrock or the Anthropic API.

## Features

- ✅ Full `coder/agentapi` compatibility
- ✅ Claude Agent SDK V2 integration
- ✅ AWS Bedrock support
- ✅ Anthropic API support (API Key and OAuth Token)
- ✅ **Claude Code compatible configuration** (`.claude/config.json`)
- ✅ **MCP (Model Context Protocol) servers support**
- ✅ **Plugin marketplace support**
- ✅ **Prometheus metrics export** (Claude Code compatible)
- ✅ Server-Sent Events (SSE) for real-time updates
- ✅ Multi-turn conversation support
- ✅ AskUserQuestion and ExitPlanMode tool handling
- ✅ TypeScript with strict type checking
- ✅ Problem+JSON error responses

## Prerequisites

- Node.js 20.x or higher
- AWS account with Bedrock access (if using Bedrock)
- Or Anthropic API key or OAuth token (if using Anthropic API)

## Installation

### Quick Start with npx/bunx (Recommended)

#### From GitHub Packages

```bash
# Create a .env file with your configuration
cat > .env << 'EOF'
PORT=3000
HOST=localhost
CLAUDE_CODE_USE_BEDROCK=0
CLAUDE_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_OAUTH_TOKEN=your_oauth_token_here
EOF

# Configure npm to use GitHub Packages
echo "@takutakahashi:registry=https://npm.pkg.github.com" >> .npmrc

# Run with npx
npx @takutakahashi/claude-agentapi

# Or install globally
npm install -g @takutakahashi/claude-agentapi
claude-agentapi
```

#### From npm Registry (if published)

```bash
# Create a .env file with your configuration
cat > .env << 'EOF'
PORT=3000
HOST=localhost
CLAUDE_CODE_USE_BEDROCK=0
CLAUDE_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_OAUTH_TOKEN=your_oauth_token_here
EOF

# Run with npx (npm)
npx claude-agentapi

# Or with bunx (Bun)
bunx claude-agentapi
```

### Manual Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd claude-agentapi
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

This server supports two configuration methods:
1. **Claude Code compatible `.claude/config.json`** - For MCP servers, plugins, and skills
2. **Environment variables** - For server settings and API credentials

### Claude Config File (`.claude/config.json`)

This server uses the same configuration structure as Claude Code CLI. Configuration files are loaded in the following order (later configs override earlier ones):

1. **Global**: `~/.claude/config.json`
2. **Project**: `.claude/config.json` (current working directory)
3. **Working directory**: `{CLAUDE_WORKING_DIRECTORY}/.claude/config.json`

#### Example `.claude/config.json`

```json
{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "API_KEY": "your-api-key"
      },
      "disabled": false
    }
  },
  "plugins": {
    "example-plugin": {
      "enabled": true,
      "config": {
        "option": "value"
      }
    }
  }
}
```

See `.claude/config.json.example` for a complete example.

#### Configuration Structure

- **`mcpServers`**: MCP (Model Context Protocol) server configurations
  - `command`: Command to execute the MCP server
  - `args`: Array of command-line arguments
  - `env`: Environment variables for the server process
  - `disabled`: Set to `true` to disable a server without removing its configuration

- **`plugins`** / **`skills`**: Plugin/skill configurations
  - `enabled`: Whether the plugin is enabled
  - `config`: Plugin-specific configuration object

- **`hooks`**: Hook configurations for executing commands at specific events
  - `command`: Command to execute when the hook is triggered
  - `args`: Array of command-line arguments
  - `env`: Environment variables for the hook process
  - Common hooks: `user-prompt-submit-hook`, `tool-call-hook`

- **`commands`**: Custom command definitions
  - `command`: Command to execute
  - `args`: Array of command-line arguments
  - `env`: Environment variables for the command process
  - `description`: Description of what the command does

### Environment Variables

Create a `.env` file based on `.env.example`:

#### Server Configuration
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: localhost)

#### Claude Configuration
- `CLAUDE_MODEL` - Claude model name (default: claude-sonnet-4-5-20250929)

#### AWS Bedrock Configuration (when using Bedrock)
- `CLAUDE_CODE_USE_BEDROCK=1` - Enable Bedrock
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_SESSION_TOKEN` - AWS session token (optional)

#### Anthropic API Configuration (when not using Bedrock)
Use either API Key or OAuth Token (not both):
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `ANTHROPIC_OAUTH_TOKEN` - Your Anthropic OAuth token

#### Agent Permission Configuration
- `CLAUDE_WORKING_DIRECTORY` - Working directory for the agent (default: current working directory)
- `CLAUDE_PERMISSION_MODE` - Permission mode: `default`, `acceptEdits`, or `bypassPermissions` (default: default)
- `DANGEROUSLY_SKIP_PERMISSIONS` - Set to `true` to skip all permission checks (equivalent to `bypassPermissions` mode)

**Permission Modes:**
- `default` - Standard permission checks with user prompts for confirmations
- `acceptEdits` - Automatically approve file edits (still prompts for other operations)
- `bypassPermissions` - Skip all permission checks (⚠️ use with extreme caution)

#### Telemetry Configuration
- `CLAUDE_CODE_ENABLE_TELEMETRY` - Enable OpenTelemetry metrics export (set to `1` to enable)
- `PROMETHEUS_PORT` - Prometheus metrics server port (default: 9464)

#### Other Configuration
- `DEBUG` - Enable debug logging (default: false)
- `MAX_MESSAGE_HISTORY` - Maximum messages to keep in history (default: 100)

## Usage

### Run with npx/bunx

If you used npx/bunx for installation:

```bash
# Make sure you have a .env file in the current directory
npx claude-agentapi
# or
bunx claude-agentapi
```

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### CLI Options

The CLI accepts the following command-line options:

#### `--dangerously-skip-permissions`
Disables all permission checks by setting the permission mode to `bypassPermissions`. This allows the agent to perform any operation without asking for confirmation.

⚠️ **WARNING**: Use this option with extreme caution! The agent will have unrestricted access to your filesystem and can execute any commands without prompts.

```bash
npx claude-agentapi --dangerously-skip-permissions
```

#### `--working-directory <path>` or `-w <path>`
Sets the working directory for the agent. This allows the agent to access files relative to the specified directory, including `.claude` and other configuration directories.

```bash
npx claude-agentapi --working-directory /path/to/your/project
# or
npx claude-agentapi -w /path/to/your/project
```

#### `--permission-mode <mode>` or `-p <mode>`
Sets the permission mode for the agent. Valid options are `default`, `acceptEdits`, or `bypassPermissions`.

```bash
npx claude-agentapi --permission-mode acceptEdits
# or
npx claude-agentapi -p acceptEdits
```

**Example with multiple options:**
```bash
npx claude-agentapi \
  --working-directory /path/to/project \
  --permission-mode acceptEdits
```

## API Endpoints

The server implements the following `coder/agentapi` compatible endpoints:

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

### GET /status
Get current agent status.

**Response:**
```json
{
  "agent_type": "claude",
  "status": "running" | "stable"
}
```

### GET /messages
Get conversation message history.

**Response:**
```json
[
  {
    "id": "msg_1_1234567890",
    "role": "user" | "assistant",
    "content": "Message content",
    "time": "2024-01-01T00:00:00.000Z",
    "type": "normal" | "question" | "plan"
  }
]
```

### POST /message
Send a message to the agent.

**Request:**
```json
{
  "content": "Your message",
  "type": "user" | "raw"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Error (409 - Agent Busy):**
```json
{
  "type": "about:blank",
  "title": "Agent is busy",
  "status": 409,
  "detail": "The agent is currently processing another request."
}
```

### GET /events
Server-Sent Events (SSE) stream for real-time updates.

**Events:**

1. `init` - Initial state on connection
```json
{
  "messages": [...],
  "status": "stable"
}
```

2. `message_update` - New message
```json
{
  "id": "msg_1_1234567890",
  "role": "assistant",
  "content": "Message content",
  "time": "2024-01-01T00:00:00.000Z"
}
```

3. `status_change` - Agent status changed
```json
{
  "status": "running" | "stable"
}
```

## Architecture

```
src/
├── index.ts              # Application entry point
├── server.ts             # Express server configuration
├── routes/               # API route handlers
│   ├── status.ts         # GET /status
│   ├── messages.ts       # GET /messages
│   ├── message.ts        # POST /message
│   └── events.ts         # GET /events (SSE)
├── services/             # Business logic
│   ├── agent.ts          # Claude Agent SDK integration
│   └── session.ts        # SSE session management
├── types/                # TypeScript type definitions
│   ├── api.ts            # API types
│   └── agent.ts          # Agent types
└── utils/                # Utility functions
    ├── logger.ts         # Logging utility
    └── sse.ts            # SSE helper
```

## MCP Servers and Plugins

### MCP Servers

This server supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers, allowing you to extend Claude's capabilities with custom tools and integrations.

MCP servers are configured in `.claude/config.json` under the `mcpServers` key. Each server configuration includes:

- The command to execute
- Optional arguments
- Environment variables
- An optional `disabled` flag to temporarily disable a server

**Example MCP server configuration:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
    },
    "database": {
      "command": "docker",
      "args": ["run", "-i", "my-mcp-db-server"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

### Plugins and Skills

Plugins extend Claude's functionality with additional capabilities. Configure plugins in `.claude/config.json` under the `plugins` or `skills` key.

**Example plugin configuration:**

```json
{
  "plugins": {
    "code-reviewer": {
      "enabled": true,
      "config": {
        "strictness": "high",
        "languages": ["typescript", "python"]
      }
    }
  }
}
```

**Note:** The `skills` key is an alias for `plugins` and works identically.

### Hooks

Hooks allow you to execute custom commands when specific events occur during agent operation. Configure hooks in `.claude/config.json` under the `hooks` key.

**Example hook configuration:**

```json
{
  "hooks": {
    "user-prompt-submit-hook": {
      "command": "bash",
      "args": ["-c", "echo 'User prompt submitted'"],
      "env": {
        "HOOK_TYPE": "user-prompt-submit"
      }
    },
    "tool-call-hook": {
      "command": "node",
      "args": ["/path/to/tool-call-logger.js"]
    }
  }
}
```

**Common hook types:**
- `user-prompt-submit-hook`: Triggered when a user submits a prompt
- `tool-call-hook`: Triggered when the agent calls a tool
- And more depending on Claude Agent SDK support

### Custom Commands

Define custom commands that can be invoked during agent operation. Configure commands in `.claude/config.json` under the `commands` key.

**Example command configuration:**

```json
{
  "commands": {
    "deploy": {
      "command": "bash",
      "args": ["-c", "npm run deploy"],
      "description": "Deploy the application to production",
      "env": {
        "NODE_ENV": "production"
      }
    },
    "test": {
      "command": "npm",
      "args": ["test"],
      "description": "Run the test suite"
    }
  }
}
```

Commands can be invoked by the agent or used for custom workflows within your application.

## Prometheus Metrics

This server implements OpenTelemetry metrics export to Prometheus, following [Claude Code's metric naming and structure](https://code.claude.com/docs/en/monitoring-usage).

### Enabling Metrics

Enable metrics collection by setting the following environment variables:

```bash
# Enable telemetry
export CLAUDE_CODE_ENABLE_TELEMETRY=1

# Optional: Set custom Prometheus port (default: 9464)
export PROMETHEUS_PORT=9464
```

Once enabled, Prometheus metrics will be available at:
```
http://localhost:9464/metrics
```

### Available Metrics

The following metrics are exported following Claude Code's naming conventions:

| Metric Name | Description | Unit | Attributes |
|-------------|-------------|------|------------|
| `claude_code.session.count` | Count of sessions started | count | session.id, app.version, terminal.type |
| `claude_code.token.usage` | Number of tokens used | tokens | session.id, app.version, terminal.type, model, type (input/output/cacheRead/cacheCreation) |
| `claude_code.cost.usage` | Cost of the session | USD | session.id, app.version, terminal.type, model |
| `claude_code.lines_of_code.count` | Lines of code modified | count | session.id, app.version, terminal.type, type (added/removed) |
| `claude_code.code_edit_tool.decision` | Code editing tool permission decisions | count | session.id, app.version, terminal.type, tool (Edit/Write/NotebookEdit), decision (accept/reject), language |
| `claude_code.active_time.total` | Total active time | seconds | session.id, app.version, terminal.type |

### Standard Attributes

All metrics include the following standard attributes:

- `session.id` - Unique session identifier (UUID)
- `app.version` - Application version from package.json
- `terminal.type` - Terminal type (from `TERM` environment variable)

### Prometheus Configuration

Example Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'claude-agentapi'
    static_configs:
      - targets: ['localhost:9464']
    scrape_interval: 60s
```

### Grafana Dashboard

You can visualize these metrics using Grafana. Example queries:

```promql
# Total sessions started
sum(claude_code_session_count)

# Token usage by type
sum by (type) (claude_code_token_usage)

# Total cost in USD
sum(claude_code_cost_usage)

# Lines of code added vs removed
sum by (type) (claude_code_lines_of_code_count)
```

## Special Features

### AskUserQuestion Handling

When the agent uses the `AskUserQuestion` tool, the server automatically formats the question and broadcasts it as a message with `type: "question"`. The question appears with a ❓ emoji prefix.

### ExitPlanMode Handling

When the agent uses the `ExitPlanMode` tool, the server formats the plan and broadcasts it as a message with `type: "plan"`. The plan appears with a 📋 emoji prefix.

## Error Handling

The server uses the Problem+JSON format (RFC 7807) for error responses:

```json
{
  "type": "about:blank",
  "title": "Error title",
  "status": 400,
  "detail": "Detailed error message"
}
```

## Limitations

- Single session only (no multi-session support)
- Raw message type (`type: "raw"`) not yet implemented
- File upload endpoint (`POST /upload`) not yet implemented

## Development

### Project Structure

The project follows a modular architecture with clear separation of concerns:
- **Routes**: Handle HTTP requests/responses
- **Services**: Implement business logic
- **Types**: Define TypeScript interfaces
- **Utils**: Provide shared utilities

### Adding New Features

1. Define types in `src/types/`
2. Implement logic in `src/services/`
3. Create route handlers in `src/routes/`
4. Register routes in `src/server.ts`

## License

MIT

## References

- [coder/agentapi](https://github.com/coder/agentapi)
- [Claude Agent SDK Documentation](https://platform.claude.com/docs/agent-sdk/overview)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
