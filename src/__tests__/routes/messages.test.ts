import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';
import type { Message } from '../../types/api.js';

// Mock services
vi.mock('../../services/agent.js');
vi.mock('../../services/session.js');

describe('GET /messages', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no messages', async () => {
    vi.mocked(agentService.getMessages).mockReturnValue([]);

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should return message history', async () => {
    const mockMessages: Message[] = [
      {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        time: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: 'Hi there!',
        time: '2024-01-01T00:00:01.000Z',
      },
    ];

    vi.mocked(agentService.getMessages).mockReturnValue(mockMessages);

    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockMessages);
  });

  it('should call agentService.getMessages', async () => {
    vi.mocked(agentService.getMessages).mockReturnValue([]);

    await request(app).get('/messages');

    expect(agentService.getMessages).toHaveBeenCalledOnce();
  });
});
