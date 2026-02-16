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
- ✅ **Token budget management** - Control costs with configurable limits
- ✅ **Token usage tracking** - Last call and cumulative statistics
- ✅ **Automatic message history trimming** - Optimize memory usage
- ✅ Server-Sent Events (SSE) for real-time updates
- ✅ Multi-turn conversation support
- ✅ AskUserQuestion and ExitPlanMode tool handling
- ✅ TypeScript with strict type checking
- ✅ Problem+JSON error responses

## Documentation

- 📖 [/action エンドポイント使用ガイド](docs/action-endpoint.md) - エージェントとの対話的なやり取りの詳細な使用方法

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
ANTHROPIC_MODEL=default
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
ANTHROPIC_MODEL=default
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
1. **Claude Code compatible `.claude/config.json`** - For MCP servers and hooks
2. **Environment variables** - For server settings and API credentials

### Claude Config File (`.claude/config.json`)

This server uses the Claude Agent SDK v1 API (`query` function) which supports MCP servers, hooks, and other configurations. Configuration files are loaded in the following order (later configs override earlier ones):

1. **Global**: `~/.claude/config.json`
2. **Project**: `.claude/config.json` (current working directory)
3. **Working directory**: `{CLAUDE_WORKING_DIRECTORY}/.claude/config.json`

**Supported Configuration**:
- ✅ `mcpServers` - MCP server configurations (fully supported)
- ✅ `hooks` - Hook callbacks for responding to events
- ✅ `plugins` - Loaded from `~/.claude/settings.json` `enabledPlugins`
  - Automatically resolves plugin paths from marketplaces
  - Supports custom marketplaces via `extraKnownMarketplaces`
  - Example: `"code-simplifier@claude-plugins-official": true`
- ⏳ `commands` - Custom command configurations (not yet implemented)

#### Example `.claude/config.json`

```json
{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

See `.claude/config.json.example` for a complete example with all supported options.

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

#### Model Configuration
- `ANTHROPIC_MODEL` - Claude model name (default: default)

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
- `CLAUDE_CODE_EXECUTABLE_PATH` - Custom path to Claude Code executable (optional, uses SDK built-in executable by default)

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
- `STREAM_JSON_OUTPUT_FILE` - Path to write stream JSON output (for debugging and logging)

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

#### `--output-file <path>`
Writes the stream JSON output from the agent to the specified file. This is useful for debugging and logging purposes. Each SDK message will be written as a separate JSON line.

```bash
npx claude-agentapi --output-file /path/to/output.jsonl
```

**Example with multiple options:**
```bash
npx claude-agentapi \
  --working-directory /path/to/project \
  --permission-mode acceptEdits \
  --output-file /tmp/agent-stream.jsonl
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
Get conversation message history (user and assistant messages only).

**Query Parameters:**

Pagination options (all optional):

1. **Limit and Direction** - Get first/last n messages:
   - `limit` (number): Number of messages to retrieve
   - `direction` (string): `head` (first n) or `tail` (last n, default)

2. **Around a Message** - Get messages around a specific message ID:
   - `around` (number): Message ID to center around
   - `context` (number): Number of messages before/after (default: 10)

**Examples:**

```bash
# Get all messages (no pagination)
GET /messages

# Get last 10 messages (most recent)
GET /messages?limit=10

# Get first 5 messages
GET /messages?limit=5&direction=head

# Get 3 messages before and after message ID 42
GET /messages?around=42&context=3

# Get 10 messages before and after message ID 100 (default context)
GET /messages?around=100
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user" | "assistant",
      "content": "Message content",
      "time": "2024-01-01T00:00:00.000Z",
      "type": "normal" | "question" | "plan"
    }
  ],
  "total": 100,
  "hasMore": true
}
```

**Response Fields:**
- `messages`: Array of message objects
- `total`: Total number of messages available
- `hasMore`: Whether there are more messages beyond the returned set

**Parameter Validation:**
- `limit` must be a positive integer
- `direction` must be either `head` or `tail`
- `around` must be a non-negative integer
- `context` requires `around` to be specified
- `around` cannot be used with `limit` or `direction`

### GET /tool_status
Get currently active tool executions. When a tool starts executing, it appears in this list. When the tool completes (success or error), it is removed from the list.

**Response:**
```json
{
  "messages": [
    {
      "id": 2,
      "role": "agent",
      "content": "{\"type\":\"tool_use\",\"name\":\"Read\",\"id\":\"toolu_123\",\"input\":{\"file_path\":\"/path/to/file\"}}",
      "time": "2024-01-01T00:00:00.000Z",
      "toolUseId": "toolu_123"
    }
  ]
}
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

### GET /action
Get a list of pending actions that require user response.

**Response:**
```json
{
  "pending_actions": [
    {
      "type": "answer_question",
      "tool_use_id": "toolu_123",
      "content": {
        "questions": [
          {
            "question": "Which library should we use?",
            "header": "Library",
            "multiSelect": false,
            "options": [
              { "label": "React", "description": "UI library" },
              { "label": "Vue", "description": "Progressive framework" }
            ]
          }
        ]
      }
    }
  ]
}
```

### POST /action
Send an action to the agent. Supports multiple action types for different agent interactions.

**📖 詳細な使用方法については [/action エンドポイント使用ガイド](docs/action-endpoint.md) を参照してください。**

#### Action Type: `answer_question`
Answer questions from the AskUserQuestion tool.

**Request:**
```json
{
  "type": "answer_question",
  "answers": {
    "question1": "answer1",
    "question2": "answer2"
  }
}
```

**Response:**
```json
{
  "ok": true
}
```

**Error (409 - No Active Question):**
```json
{
  "type": "about:blank",
  "title": "No active question",
  "status": 409,
  "detail": "There is no active question to answer. The agent must be running and waiting for user input."
}
```

#### Action Type: `approve_plan`
Approve or reject a plan presented by the ExitPlanMode tool.

**Request (Approve):**
```json
{
  "type": "approve_plan",
  "approved": true
}
```

**Request (Reject):**
```json
{
  "type": "approve_plan",
  "approved": false
}
```

**Response:**
```json
{
  "ok": true
}
```

**Error (409 - No Active Plan):**
```json
{
  "type": "about:blank",
  "title": "No active plan",
  "status": 409,
  "detail": "There is no active plan to approve. The agent must be running and waiting for plan approval."
}
```

#### Action Type: `stop_agent`
Stop the currently running agent.

**Request:**
```json
{
  "type": "stop_agent"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Note:** This action can be called at any time, regardless of agent status.

### GET /usage
Get token usage and cost statistics for the **last API call**.

**Response:**
```json
{
  "tokens": {
    "input": 1000,
    "output": 500,
    "cacheRead": 200,
    "cacheCreation": 100,
    "total": 1800
  },
  "cost": {
    "totalUsd": 0.05
  },
  "session": {
    "id": "session-123",
    "status": "running",
    "messageCount": 5
  }
}
```

### GET /usage/cumulative
Get **cumulative** token usage and cost statistics for the entire session.

**Response:**
```json
{
  "tokens": {
    "input": 5000,
    "output": 2500,
    "cacheRead": 1000,
    "cacheCreation": 500,
    "total": 9000
  },
  "cost": {
    "totalUsd": 0.25
  },
  "session": {
    "id": "session-123",
    "status": "running",
    "messageCount": 15
  }
}
```

### GET /usage/budget
Get token budget status and limits.

**Response:**
```json
{
  "budget": {
    "maxTokens": 10000,
    "maxCostUsd": 1.0,
    "maxTurns": 50,
    "maxMessageHistory": 100,
    "warningThresholdPercent": 80
  },
  "current": {
    "tokens": 5000,
    "costUsd": 0.25,
    "turns": 10
  },
  "limits": {
    "tokensExceeded": false,
    "costExceeded": false,
    "turnsExceeded": false
  }
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
│   ├── action.ts         # POST /action
│   ├── tool_status.ts    # GET /tool_status
│   └── events.ts         # GET /events (SSE)
├── services/             # Business logic
│   ├── agent.ts          # Claude Agent SDK integration
│   ├── session.ts        # SSE session management
│   └── metrics.ts        # Prometheus metrics collection
├── types/                # TypeScript type definitions
│   ├── api.ts            # API types
│   ├── agent.ts          # Agent types
│   └── config.ts         # Configuration types
└── utils/                # Utility functions
    ├── logger.ts         # Logging utility
    ├── sse.ts            # SSE helper
    ├── config.ts         # Configuration loader
    └── telemetry.ts      # OpenTelemetry setup
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

## Token Budget Management

This server provides comprehensive token budget management to help you control costs and optimize resource usage. The implementation is inspired by [anomalyco/opencode](https://github.com/anomalyco/opencode)'s token management features.

### Features

- **Dual Token Tracking**: Track both last API call and cumulative usage
- **Budget Limits**: Set limits on tokens, cost (USD), and conversation turns
- **Automatic Warnings**: Get warned when approaching budget limits
- **Message History Management**: Automatic trimming based on configured limits
- **Real-time Monitoring**: Track usage via REST API endpoints

### Configuration

Configure token budget limits using environment variables:

```bash
# Maximum total tokens allowed (input + output + cache)
TOKEN_BUDGET_MAX_TOKENS=1000000

# Maximum cost in USD
TOKEN_BUDGET_MAX_COST_USD=10.0

# Maximum number of conversation turns (API calls)
TOKEN_BUDGET_MAX_TURNS=100

# Maximum message history length (for automatic trimming)
MAX_MESSAGE_HISTORY=100

# Warning threshold as percentage of budget (0-100)
# When usage reaches this percentage, a warning will be logged
TOKEN_BUDGET_WARNING_THRESHOLD=80
```

### Usage Tracking Endpoints

Three endpoints are available for monitoring token usage:

1. **`GET /usage`** - Returns token usage for the **last API call**
2. **`GET /usage/cumulative`** - Returns **cumulative** usage across all API calls
3. **`GET /usage/budget`** - Returns budget status and limits

Example response from `/usage/budget`:

```json
{
  "budget": {
    "maxTokens": 1000000,
    "maxCostUsd": 10.0,
    "maxTurns": 100,
    "warningThresholdPercent": 80
  },
  "current": {
    "tokens": 450000,
    "costUsd": 4.2,
    "turns": 42
  },
  "limits": {
    "tokensExceeded": false,
    "costExceeded": false,
    "turnsExceeded": false
  }
}
```

### Automatic Budget Warnings

When you approach or exceed budget limits, warnings will be logged:

```
[WARN] Token budget warning: 820000/1000000 tokens (82.0%)
[WARN] Cost budget exceeded: $10.15/$10.00 (101.5%)
[WARN] Turn limit reached: 100/100 turns
```

### Message History Optimization

To optimize memory usage and token consumption, the server automatically trims message history when it exceeds the configured limit. This can be controlled via:

- Environment variable: `MAX_MESSAGE_HISTORY=100`
- Token budget config: `TOKEN_BUDGET_MAX_MESSAGE_HISTORY` (takes precedence)

When trimming occurs, the oldest messages are removed while preserving recent conversation context.

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

### Agent Actions (`POST /action`)

The `/action` endpoint provides a unified interface for interacting with the agent through different action types:

#### 1. **Answer Questions** (`answer_question`)
When the agent uses the `AskUserQuestion` tool:
- The server automatically formats and broadcasts the question with `type: "question"` (❓ emoji prefix)
- Client sends answers via `/action` with `type: "answer_question"`
- Answers are sent back to the agent as a `tool_result`

**Example workflow:**
1. Agent calls `AskUserQuestion` → Server broadcasts question message
2. Client sends: `POST /action` with `{"type": "answer_question", "answers": {"q1": "a1"}}`
3. Server forwards answer to agent as `tool_result`

#### 2. **Approve/Reject Plans** (`approve_plan`)
When the agent uses the `ExitPlanMode` tool:
- The server formats and broadcasts the plan with `type: "plan"` (📋 emoji prefix)
- Client approves or rejects via `/action` with `type: "approve_plan"`
- Approval/rejection is sent back to the agent as a `tool_result`

**Example workflow:**
1. Agent calls `ExitPlanMode` → Server broadcasts plan message
2. Client sends: `POST /action` with `{"type": "approve_plan", "approved": true}`
3. Server forwards approval to agent as `tool_result`

#### 3. **Stop Agent** (`stop_agent`)
Allows interrupting the agent at any time:
- Can be called regardless of agent status
- Immediately interrupts the running query
- Sets agent status to `stable`

**Example:**
- Client sends: `POST /action` with `{"type": "stop_agent"}`
- Server interrupts agent and returns to stable state

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
