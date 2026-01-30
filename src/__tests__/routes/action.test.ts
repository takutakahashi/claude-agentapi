import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';

// Mock services
vi.mock('../../services/agent.js', () => ({
  agentService: {
    getStatus: vi.fn(),
    sendAction: vi.fn(),
    approvePlan: vi.fn(),
    stopAgent: vi.fn(),
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
    it('should reject request without type', async () => {
      const response = await request(app)
        .post('/action')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject request with invalid type', async () => {
      const response = await request(app)
        .post('/action')
        .send({ type: 'invalid_type' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject answer_question without answers', async () => {
      const response = await request(app)
        .post('/action')
        .send({ type: 'answer_question' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should reject approve_plan without approved field', async () => {
      const response = await request(app)
        .post('/action')
        .send({ type: 'approve_plan' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('title', 'Invalid request');
    });

    it('should accept valid answer_question with empty answers', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.sendAction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/action')
        .send({ type: 'answer_question', answers: {} });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('answer_question action', () => {
    it('should accept valid answer_question when agent is running', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.sendAction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const answers = {
        'question1': 'answer1',
        'question2': 'answer2',
      };

      const response = await request(app)
        .post('/action')
        .send({ type: 'answer_question', answers });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.sendAction).toHaveBeenCalledWith(answers);
    });

    it('should reject answer_question when agent is stable', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');

      const response = await request(app)
        .post('/action')
        .send({ type: 'answer_question', answers: { q1: 'a1' } });

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
        .send({ type: 'answer_question', answers: { q1: 'a1' } });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('title', 'Internal server error');
      expect(response.body).toHaveProperty('detail', 'Action processing error');
    });
  });

  describe('approve_plan action', () => {
    it('should accept plan approval when agent is running', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.approvePlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/action')
        .send({ type: 'approve_plan', approved: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.approvePlan).toHaveBeenCalledWith(true);
    });

    it('should accept plan rejection when agent is running', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.approvePlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/action')
        .send({ type: 'approve_plan', approved: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.approvePlan).toHaveBeenCalledWith(false);
    });

    it('should reject approve_plan when agent is stable', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');

      const response = await request(app)
        .post('/action')
        .send({ type: 'approve_plan', approved: true });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('title', 'No active plan');
      expect(agentService.approvePlan).not.toHaveBeenCalled();
    });

    it('should handle approvePlan errors', async () => {
      (agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (agentService.approvePlan as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Plan approval error')
      );

      const response = await request(app)
        .post('/action')
        .send({ type: 'approve_plan', approved: true });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('title', 'Internal server error');
      expect(response.body).toHaveProperty('detail', 'Plan approval error');
    });
  });

  describe('stop_agent action', () => {
    it('should stop agent successfully', async () => {
      (agentService.stopAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/action')
        .send({ type: 'stop_agent' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(agentService.stopAgent).toHaveBeenCalled();
    });

    it('should handle stopAgent errors', async () => {
      (agentService.stopAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Stop agent error')
      );

      const response = await request(app)
        .post('/action')
        .send({ type: 'stop_agent' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('title', 'Internal server error');
      expect(response.body).toHaveProperty('detail', 'Stop agent error');
    });
  });
});
