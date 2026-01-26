# claude-agentapi

A `coder/agentapi` compatible HTTP API server that uses Claude Agent SDK TypeScript on AWS Bedrock.

## Overview

This project implements a server compatible with the [coder/agentapi](https://github.com/coder/agentapi) specification, allowing you to interact with Claude AI agents through a standardized HTTP API. The server uses the Claude Agent SDK V2 and can be configured to use either AWS Bedrock or the Anthropic API.

## Features

- ✅ Full `coder/agentapi` compatibility
- ✅ Claude Agent SDK V2 integration
- ✅ AWS Bedrock support
- ✅ Anthropic API support (API Key and OAuth Token)
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
