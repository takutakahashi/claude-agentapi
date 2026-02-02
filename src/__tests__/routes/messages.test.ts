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

describe('GET /messages', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no messages', async () => {
    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
      messages: [],
    });
  });

  it('should return message history', async () => {
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
    ];

    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue(mockMessages);

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
      messages: mockMessages,
    });
  });

  it('should call agentService.getMessages', async () => {
    (agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([]);

    await request(app).get('/messages');

    expect(agentService.getMessages).toHaveBeenCalledOnce();
  });

  it('should include all message types including agent and tool_result', async () => {
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

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(4);
    expect(response.body.messages[0].role).toBe('user');
    expect(response.body.messages[1].role).toBe('assistant');
    expect(response.body.messages[2].role).toBe('agent');
    expect(response.body.messages[3].role).toBe('tool_result');
  });
});
