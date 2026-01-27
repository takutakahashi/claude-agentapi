import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';
import type { Message } from '../../types/api.js';

// Mock services
vi.mock('../../services/agent.js', () => ({
  agentService: {
    getStatus: vi.fn(),
    sendMessage: vi.fn(),
    getMessages: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  },
}));
vi.mock('../../services/session.js', () => ({
  sessionService: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    broadcastMessageUpdate: vi.fn(),
    broadcastStatusChange: vi.fn(),
    sendInitialState: vi.fn(),
    getSubscriberCount: vi.fn(),
  },
}));

describe('GET /tool_status', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no tool executions', async () => {
    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/ToolStatusResponseBody.json',
      toolExecutions: [],
    });
  });

  it('should return only agent and tool_result messages', async () => {
    const mockMessages: Message[] = [
      {
        id: 0,
        role: 'user',
        content: 'Hello',
        time: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 1,
        role: 'assistant',
        content: 'Hi there!',
        time: '2024-01-01T00:00:01.000Z',
      },
      {
        id: 2,
        role: 'agent',
        content: 'Tool use message',
        time: '2024-01-01T00:00:02.000Z',
        toolUseId: 'tool123',
      },
      {
        id: 3,
        role: 'tool_result',
        content: 'Tool result',
        time: '2024-01-01T00:00:03.000Z',
        parentToolUseId: 'tool123',
        status: 'success',
      },
    ];

    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue(mockMessages);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body.toolExecutions).toHaveLength(2);
    expect(response.body.toolExecutions[0].role).toBe('agent');
    expect(response.body.toolExecutions[0].toolUseId).toBe('tool123');
    expect(response.body.toolExecutions[1].role).toBe('tool_result');
    expect(response.body.toolExecutions[1].parentToolUseId).toBe('tool123');
    expect(response.body.toolExecutions[1].status).toBe('success');
  });

  it('should handle error status in tool_result', async () => {
    const mockMessages: Message[] = [
      {
        id: 0,
        role: 'agent',
        content: 'Tool use message',
        time: '2024-01-01T00:00:00.000Z',
        toolUseId: 'tool456',
      },
      {
        id: 1,
        role: 'tool_result',
        content: 'Tool failed',
        time: '2024-01-01T00:00:01.000Z',
        parentToolUseId: 'tool456',
        status: 'error',
        error: 'Tool execution failed',
      },
    ];

    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue(mockMessages);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body.toolExecutions).toHaveLength(2);
    expect(response.body.toolExecutions[1].status).toBe('error');
    expect(response.body.toolExecutions[1].error).toBe('Tool execution failed');
  });

  it('should call agentService.getMessages', async () => {
    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([]);

    await request(app).get('/tool_status');

    expect(agentService.getMessages).toHaveBeenCalledOnce();
  });
});
