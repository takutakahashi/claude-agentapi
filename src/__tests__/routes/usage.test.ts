import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import usageRouter from '../../routes/usage.js';
import * as metricsModule from '../../services/metrics.js';
import * as agentModule from '../../services/agent.js';

// Mock the modules
vi.mock('../../services/metrics.js', () => ({
  getMetricsService: vi.fn(),
}));

vi.mock('../../services/agent.js', () => ({
  agentService: {
    getStatus: vi.fn(),
    getMessages: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GET /usage', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(usageRouter);

    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should return usage statistics when metrics service is available', async () => {
    // Mock metrics service
    const mockMetricsService = {
      getUsageStats: vi.fn().mockReturnValue({
        sessionId: 'test-session',
        tokens: {
          input: 1000,
          output: 500,
          cacheRead: 200,
          cacheCreation: 100,
          total: 1800,
        },
        cost: {
          totalUsd: 0.05,
        },
      }),
    };

    (metricsModule.getMetricsService as ReturnType<typeof vi.fn>).mockReturnValue(mockMetricsService as never);
    (agentModule.agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');
    (agentModule.agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 1, role: 'user', content: 'test', time: '2024-01-01T00:00:00Z', type: 'normal' },
    ] as never);

    const response = await request(app).get('/usage');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tokens: {
        input: 1000,
        output: 500,
        cacheRead: 200,
        cacheCreation: 100,
        total: 1800,
      },
      cost: {
        totalUsd: 0.05,
      },
      session: {
        id: 'test-session',
        status: 'stable',
        messageCount: 1,
      },
    });
  });

  it('should return zero stats when metrics service is not available', async () => {
    (metricsModule.getMetricsService as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (agentModule.agentService.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('stable');
    (agentModule.agentService.getMessages as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 1, role: 'user', content: 'test', time: '2024-01-01T00:00:00Z', type: 'normal' },
      { id: 2, role: 'assistant', content: 'response', time: '2024-01-01T00:00:01Z', type: 'normal' },
    ] as never);

    const response = await request(app).get('/usage');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
        total: 0,
      },
      cost: {
        totalUsd: 0,
      },
      session: {
        id: 'default',
        status: 'stable',
        messageCount: 2,
      },
    });
  });

  it('should handle errors gracefully', async () => {
    (metricsModule.getMetricsService as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Metrics service error');
    });

    const response = await request(app).get('/usage');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: 'Metrics service error',
    });
  });
});
