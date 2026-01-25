import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from '../../services/session.js';
import type { SSEClient } from '../../types/agent.js';
import type { Message } from '../../types/api.js';

describe('SessionService', () => {
  let sessionService: SessionService;
  let mockClient: SSEClient;

  beforeEach(() => {
    sessionService = new SessionService();
    mockClient = {
      id: 'test-client-1',
      send: vi.fn(),
      close: vi.fn(),
    };
  });

  describe('subscribe', () => {
    it('should add client to subscribers', () => {
      sessionService.subscribe(mockClient);
      expect(sessionService.getSubscriberCount()).toBe(1);
    });

    it('should handle multiple subscriptions', () => {
      const mockClient2: SSEClient = {
        id: 'test-client-2',
        send: vi.fn(),
        close: vi.fn(),
      };

      sessionService.subscribe(mockClient);
      sessionService.subscribe(mockClient2);

      expect(sessionService.getSubscriberCount()).toBe(2);
    });
  });

  describe('unsubscribe', () => {
    it('should remove client from subscribers', () => {
      sessionService.subscribe(mockClient);
      sessionService.unsubscribe(mockClient.id);

      expect(sessionService.getSubscriberCount()).toBe(0);
    });

    it('should handle unsubscribing non-existent client', () => {
      sessionService.unsubscribe('non-existent');
      expect(sessionService.getSubscriberCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send event to all subscribers', () => {
      const mockClient2: SSEClient = {
        id: 'test-client-2',
        send: vi.fn(),
        close: vi.fn(),
      };

      sessionService.subscribe(mockClient);
      sessionService.subscribe(mockClient2);

      const testData = { message: 'test' };
      sessionService.broadcast('test-event', testData);

      expect(mockClient.send).toHaveBeenCalledWith('test-event', testData);
      expect(mockClient2.send).toHaveBeenCalledWith('test-event', testData);
    });

    it('should not throw when client send fails', () => {
      mockClient.send = vi.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });

      sessionService.subscribe(mockClient);

      expect(() => {
        sessionService.broadcast('test-event', {});
      }).not.toThrow();
    });
  });

  describe('broadcastMessageUpdate', () => {
    it('should broadcast message_update event', () => {
      sessionService.subscribe(mockClient);

      const message: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        time: '2024-01-01T00:00:00.000Z',
      };

      sessionService.broadcastMessageUpdate(message);

      expect(mockClient.send).toHaveBeenCalledWith('message_update', message);
    });
  });

  describe('broadcastStatusChange', () => {
    it('should broadcast status_change event', () => {
      sessionService.subscribe(mockClient);

      sessionService.broadcastStatusChange('running');

      expect(mockClient.send).toHaveBeenCalledWith('status_change', {
        status: 'running',
      });
    });
  });

  describe('sendInitialState', () => {
    it('should send init event to client', () => {
      const messages: Message[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          time: '2024-01-01T00:00:00.000Z',
        },
      ];

      sessionService.sendInitialState(mockClient, messages, 'stable');

      expect(mockClient.send).toHaveBeenCalledWith('init', {
        messages,
        status: 'stable',
      });
    });
  });

  describe('getSubscriberCount', () => {
    it('should return correct subscriber count', () => {
      expect(sessionService.getSubscriberCount()).toBe(0);

      sessionService.subscribe(mockClient);
      expect(sessionService.getSubscriberCount()).toBe(1);

      const mockClient2: SSEClient = {
        id: 'test-client-2',
        send: vi.fn(),
        close: vi.fn(),
      };
      sessionService.subscribe(mockClient2);
      expect(sessionService.getSubscriberCount()).toBe(2);

      sessionService.unsubscribe(mockClient.id);
      expect(sessionService.getSubscriberCount()).toBe(1);
    });
  });
});
