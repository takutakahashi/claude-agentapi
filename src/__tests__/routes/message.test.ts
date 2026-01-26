import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';

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

describe('POST /message', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject request without content', async () => {
      const response = await request(app)
        .post('/message')
        .send({ type: 'user' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject request without type', async () => {
      const response = await request(app)
        .post('/message')
        .send({ content: 'Hello' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject request with invalid type', async () => {
      const response = await request(app)
        .post('/message')
        .send({ content: 'Hello', type: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });
  });

  describe('user message', () => {
    it('should accept valid user message when agent is stable', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');
      (agentService.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/message')
        .send({ content: 'Hello', type: 'user' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.sendMessage).toHaveBeenCalledWith('Hello');
    });

    it('should reject message when agent is busy', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');

      const response = await request(app)
        .post('/message')
        .send({ content: 'Hello', type: 'user' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('title', 'Agent is busy');
      expect(agentService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle sendMessage errors', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');
      (agentService.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Agent error')
      );

      const response = await request(app)
        .post('/message')
        .send({ content: 'Hello', type: 'user' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('title', 'Internal server error');
      expect(response.body).toHaveProperty('detail', 'Agent error');
    });
  });

  describe('raw message', () => {
    it('should return not implemented for raw messages', async () => {
      const response = await request(app)
        .post('/message')
        .send({ content: 'raw input', type: 'raw' });

      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('title', 'Not implemented');
    });
  });
});
