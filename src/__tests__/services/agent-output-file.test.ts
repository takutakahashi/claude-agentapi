import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock other dependencies
vi.mock('../../services/session.js', () => ({
  sessionService: {
    broadcastMessageUpdate: vi.fn(),
    broadcastStatusChange: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../utils/config.js', () => ({
  resolveConfig: vi.fn().mockResolvedValue({
    workingDirectory: '/test',
    permissionMode: 'default',
  }),
}));

vi.mock('../../services/metrics.js', () => ({
  getMetricsService: vi.fn().mockReturnValue(null),
  initializeMetricsService: vi.fn(),
}));

// Import AgentService after mocking
const { AgentService } = await import('../../services/agent.js');

/**
 * Build a claude-posts-compatible assistant message.
 * Schema reference: https://github.com/takutakahashi/claude-posts
 *
 * Top-level fields:
 *   type        "assistant"
 *   message     JsonlAssistantMessageBody
 *   session_id  string
 *
 * The Claude Agent SDK additionally injects parent_tool_use_id and uuid
 * at the top level; those are included here to match real SDK output.
 */
function buildAssistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    message: {
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-7-sonnet-20250219',
      content: [{ type: 'text', text: 'Test message' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      ...((overrides.message as Record<string, unknown>) ?? {}),
    },
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000000',
    session_id: 'test-session-id',
    ...overrides,
  };
}

describe('AgentService - Output File', () => {
  let tempDir: string;
  let outputFile: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'agent-test-'));
    outputFile = join(tempDir, 'output.jsonl');
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });

    // Clear environment variable
    delete process.env.STREAM_JSON_OUTPUT_FILE;
  });

  it('should create output file when STREAM_JSON_OUTPUT_FILE is set', async () => {
    process.env.STREAM_JSON_OUTPUT_FILE = outputFile;

    const service = new AgentService();
    await service.initialize();

    // Verify that the service instance has an output stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((service as any).outputFileStream).not.toBeNull();

    await service.cleanup();
  });

  it('should write SDK messages to output file in claude-posts-compatible format', async () => {
    process.env.STREAM_JSON_OUTPUT_FILE = outputFile;

    const service = new AgentService();
    await service.initialize();

    // Use a message that matches the real Claude CLI / claude-posts schema
    const testMessage = buildAssistantMessage();

    // Call processSDKMessage directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processSDKMessage(testMessage);

    await service.cleanup();

    // Read the output file
    const content = await readFile(outputFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBeGreaterThan(0);

    // Parse and validate the written record against the claude-posts schema
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('assistant');
    expect(parsed.session_id).toBe('test-session-id');
    expect(parsed.message).toBeDefined();
    expect(parsed.message.id).toBe('msg_test123');
    expect(parsed.message.role).toBe('assistant');
    expect(parsed.message.model).toBe('claude-3-7-sonnet-20250219');
    expect(parsed.message.stop_reason).toBe('end_turn');
    expect(Array.isArray(parsed.message.content)).toBe(true);
    expect(parsed.message.content[0].type).toBe('text');
  });

  it('should write tool_use message in claude-posts-compatible format', async () => {
    process.env.STREAM_JSON_OUTPUT_FILE = outputFile;

    const service = new AgentService();
    await service.initialize();

    const testMessage = buildAssistantMessage({
      message: {
        id: 'msg_tool123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-7-sonnet-20250219',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01abc',
            name: 'Bash',
            input: { command: 'ls', description: 'List files' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processSDKMessage(testMessage);

    await service.cleanup();

    const content = await readFile(outputFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('assistant');
    expect(parsed.message.stop_reason).toBe('tool_use');
    const toolUse = parsed.message.content[0];
    expect(toolUse.type).toBe('tool_use');
    expect(toolUse.id).toBe('toolu_01abc');
    expect(toolUse.name).toBe('Bash');
  });

  it('should not create output file when STREAM_JSON_OUTPUT_FILE is not set', async () => {
    const service = new AgentService();
    await service.initialize();

    // Verify that the service instance has no output stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((service as any).outputFileStream).toBeNull();

    await service.cleanup();
  });

  it('should create parent directory if it does not exist', async () => {
    const nestedPath = join(tempDir, 'nested', 'dir', 'output.jsonl');
    process.env.STREAM_JSON_OUTPUT_FILE = nestedPath;

    const service = new AgentService();
    await service.initialize();

    // Verify that the service instance has an output stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((service as any).outputFileStream).not.toBeNull();

    await service.cleanup();
  });
});
