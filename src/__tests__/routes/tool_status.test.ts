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
    getActiveToolExecutions: vi.fn(),
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

  it('should return empty array when no active tool executions', async () => {
    (agentService.getActiveToolExecutions as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/ToolStatusResponseBody.json',
      messages: [],
    });
  });

  it('should return only active tool execution messages (agent role)', async () => {
    const mockActiveExecutions: Message[] = [
      {
        id: 2,
        role: 'agent',
        content: 'Tool use message',
        time: '2024-01-01T00:00:02.000Z',
        toolUseId: 'tool123',
      },
      {
        id: 4,
        role: 'agent',
        content: 'Another tool use',
        time: '2024-01-01T00:00:04.000Z',
        toolUseId: 'tool456',
      },
    ];

    (agentService.getActiveToolExecutions as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveExecutions);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[0].role).toBe('agent');
    expect(response.body.messages[0].toolUseId).toBe('tool123');
    expect(response.body.messages[1].role).toBe('agent');
    expect(response.body.messages[1].toolUseId).toBe('tool456');
  });

  it('should only include agent messages, not tool_result messages', async () => {
    // In the new implementation, tool_result messages cause the corresponding
    // agent message to be removed from activeToolExecutions
    const mockActiveExecutions: Message[] = [
      {
        id: 2,
        role: 'agent',
        content: 'Still running tool',
        time: '2024-01-01T00:00:02.000Z',
        toolUseId: 'tool789',
      },
    ];

    (agentService.getActiveToolExecutions as ReturnType<typeof vi.fn>).mockReturnValue(mockActiveExecutions);

    const response = await request(app).get('/tool_status');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].role).toBe('agent');
    // No tool_result messages should be present
    const hasToolResult = response.body.messages.some((msg: Message) => msg.role === 'tool_result');
    expect(hasToolResult).toBe(false);
  });

  it('should call agentService.getActiveToolExecutions', async () => {
    (agentService.getActiveToolExecutions as ReturnType<typeof vi.fn>).mockReturnValue([]);

    await request(app).get('/tool_status');

    expect(agentService.getActiveToolExecutions).toHaveBeenCalledOnce();
  });
});
