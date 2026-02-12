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

  it('should write SDK messages to output file', async () => {
    process.env.STREAM_JSON_OUTPUT_FILE = outputFile;
    
    const service = new AgentService();
    await service.initialize();
    
    // Simulate processing SDK messages
    const testMessage = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Test message' }],
      },
    };
    
    // Call processSDKMessage directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processSDKMessage(testMessage);
    
    await service.cleanup();
    
    // Read the output file
    const content = await readFile(outputFile, 'utf-8');
    const lines = content.trim().split('\n');
    
    expect(lines.length).toBeGreaterThan(0);
    
    // Parse the first line and verify it's valid JSON
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('assistant');
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
