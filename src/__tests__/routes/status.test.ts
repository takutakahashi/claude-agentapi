import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { agentService } from '../../services/agent.js';

// Mock the agent service
vi.mock('../../services/agent.js', () => ({
  agentService: {
    getStatus: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  },
}));

// Mock the session service
vi.mock('../../services/session.js', () => ({
  sessionService: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    broadcast: vi.fn(),
    broadcastMessageUpdate: vi.fn(),
    broadcastStatusChange: vi.fn(),
    sendInitialState: vi.fn(),
    getSubscriberCount: vi.fn(),
  },
}));

describe('GET /status', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return stable status', async () => {
    vi.mocked(agentService.getStatus).mockReturnValue('stable');

    const response = await request(app).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      agent_type: 'claude',
      status: 'stable',
    });
  });

  it('should return running status', async () => {
    vi.mocked(agentService.getStatus).mockReturnValue('running');

    const response = await request(app).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      agent_type: 'claude',
      status: 'running',
    });
  });

  it('should call agentService.getStatus', async () => {
    vi.mocked(agentService.getStatus).mockReturnValue('stable');

    await request(app).get('/status');

    expect(agentService.getStatus).toHaveBeenCalledOnce();
  });
});
