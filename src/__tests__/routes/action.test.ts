import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';

// Mock services
vi.mock('../../services/agent.js', () => ({
  agentService: {
    getStatus: vi.fn(),
    sendAction: vi.fn(),
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

describe('POST /action', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject request without answers', async () => {
      const response = await request(app)
        .post('/action')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject request with invalid answers type', async () => {
      const response = await request(app)
        .post('/action')
        .send({ answers: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should accept empty answers object', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.sendAction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/action')
        .send({ answers: {} });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('action submission', () => {
    it('should accept valid action when agent is running', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.sendAction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const answers = {
        'question1': 'answer1',
        'question2': 'answer2',
      };

      const response = await request(app)
        .post('/action')
        .send({ answers });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.sendAction).toHaveBeenCalledWith(answers);
    });

    it('should reject action when agent is stable (no active question)', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');

      const response = await request(app)
        .post('/action')
        .send({ answers: { q1: 'a1' } });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('title', 'No active question');
      expect(agentService.sendAction).not.toHaveBeenCalled();
    });

    it('should handle sendAction errors', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.sendAction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Action processing error')
      );

      const response = await request(app)
        .post('/action')
        .send({ answers: { q1: 'a1' } });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('title', 'Internal server error');
      expect(response.body).toHaveProperty('detail', 'Action processing error');
    });
  });
});
