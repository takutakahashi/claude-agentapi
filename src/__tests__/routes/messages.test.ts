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
    getMessagesWithPagination: vi.fn(),
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
    (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      total: 0,
      hasMore: false,
    });

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
      messages: [],
      total: 0,
      hasMore: false,
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

    (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: mockMessages,
      total: 2,
      hasMore: false,
    });

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
      messages: mockMessages,
      total: 2,
      hasMore: false,
    });
  });

  it('should call agentService.getMessagesWithPagination', async () => {
    (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      total: 0,
      hasMore: false,
    });

    await request(app).get('/messages');

    expect(agentService.getMessagesWithPagination).toHaveBeenCalledOnce();
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

    (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: mockMessages,
      total: 4,
      hasMore: false,
    });

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(4);
    expect(response.body.messages[0].role).toBe('user');
    expect(response.body.messages[1].role).toBe('assistant');
    expect(response.body.messages[2].role).toBe('agent');
    expect(response.body.messages[3].role).toBe('tool_result');
  });

  describe('Pagination', () => {
    const createMockMessages = (count: number): Message[] =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
        time: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
      }));

    it('should return first n messages when limit and direction=head are specified', async () => {
      const allMessages = createMockMessages(10);
      const expectedMessages = allMessages.slice(0, 3);

      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: expectedMessages,
        total: 10,
        hasMore: true,
      });

      const response = await request(app).get('/messages?limit=3&direction=head');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(3);
      expect(response.body.messages[0].id).toBe(0);
      expect(response.body.messages[2].id).toBe(2);
      expect(response.body.total).toBe(10);
      expect(response.body.hasMore).toBe(true);
    });

    it('should return last n messages when limit is specified (default direction=tail)', async () => {
      const allMessages = createMockMessages(10);
      const expectedMessages = allMessages.slice(7);

      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: expectedMessages,
        total: 10,
        hasMore: true,
      });

      const response = await request(app).get('/messages?limit=3');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(3);
      expect(response.body.messages[0].id).toBe(7);
      expect(response.body.messages[2].id).toBe(9);
      expect(response.body.total).toBe(10);
      expect(response.body.hasMore).toBe(true);
    });

    it('should return messages around a specific ID', async () => {
      const allMessages = createMockMessages(20);
      const expectedMessages = allMessages.slice(8, 13); // 2 before + target + 2 after

      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: expectedMessages,
        total: 20,
        hasMore: true,
      });

      const response = await request(app).get('/messages?around=10&context=2');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(5);
      expect(response.body.messages[2].id).toBe(10); // Target message in the middle
      expect(response.body.total).toBe(20);
      expect(response.body.hasMore).toBe(true);
    });

    it('should return error when context is specified without around', async () => {
      const response = await request(app).get('/messages?context=5');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
      expect(response.body.detail).toContain('context');
    });

    it('should return error when around is used with limit', async () => {
      const response = await request(app).get('/messages?around=5&limit=10');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
    });

    it('should return error for invalid limit parameter', async () => {
      const response = await request(app).get('/messages?limit=invalid');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
    });

    it('should return error for negative limit parameter', async () => {
      const response = await request(app).get('/messages?limit=-5');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
    });
  });

  describe('Cursor-based pagination validation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return error when after and before are both specified', async () => {
      const response = await request(app).get('/messages?after=5&before=10');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
      expect(response.body.detail).toContain('after');
      expect(response.body.detail).toContain('before');
    });

    it('should return error when after is used with around', async () => {
      const response = await request(app).get('/messages?after=5&around=10');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
      expect(response.body.detail).toContain('after');
      expect(response.body.detail).toContain('around');
    });

    it('should return error when before is used with context', async () => {
      const response = await request(app).get('/messages?before=5&context=10');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
      expect(response.body.detail).toContain('before');
      expect(response.body.detail).toContain('context');
    });

    it('should return error when after is used with direction', async () => {
      const response = await request(app).get('/messages?after=5&direction=head');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
      expect(response.body.detail).toContain('after');
      expect(response.body.detail).toContain('direction');
    });

    it('should allow after with limit', async () => {
      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        total: 0,
        hasMore: false,
      });

      const response = await request(app).get('/messages?after=5&limit=10');

      expect(response.status).toBe(200);
    });

    it('should return error for negative after parameter', async () => {
      const response = await request(app).get('/messages?after=-5');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
    });

    it('should return error for invalid after parameter', async () => {
      const response = await request(app).get('/messages?after=invalid');

      expect(response.status).toBe(400);
      expect(response.body.title).toBe('Invalid query parameters');
    });
  });

  describe('Cursor-based pagination integration', () => {
    const createMockMessages = (count: number): Message[] =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
        time: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
      }));

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return messages after a specific ID', async () => {
      const allMessages = createMockMessages(20);
      const expectedMessages = allMessages.slice(11); // IDs 11-19

      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: expectedMessages,
        total: 20,
        hasMore: false,
      });

      const response = await request(app).get('/messages?after=10');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(9);
      expect(response.body.messages[0].id).toBe(11);
      expect(response.body.total).toBe(20);
      expect(response.body.hasMore).toBe(false);
    });

    it('should return messages before a specific ID with limit', async () => {
      const allMessages = createMockMessages(20);
      const expectedMessages = allMessages.slice(7, 10); // IDs 7, 8, 9

      (agentService.getMessagesWithPagination as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: expectedMessages,
        total: 20,
        hasMore: true,
      });

      const response = await request(app).get('/messages?before=10&limit=3');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(3);
      expect(response.body.messages[0].id).toBe(7);
      expect(response.body.messages[2].id).toBe(9);
      expect(response.body.hasMore).toBe(true);
    });
  });
});
