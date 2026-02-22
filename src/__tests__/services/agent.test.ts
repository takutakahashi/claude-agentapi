import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Message } from '../../types/api.js';

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock other dependencies
vi.mock('../../services/session.js', () => ({
  sessionService: {
    broadcastMessageUpdate: vi.fn(),
    broadcastStatusChange: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../utils/config.js', () => ({
  resolveConfig: vi.fn().mockResolvedValue({
    workingDirectory: '/test',
    permissionMode: 'default',
  }),
}));

// Import AgentService after mocking
const { AgentService } = await import('../../services/agent.js');

describe('AgentService', () => {
  describe('getMessagesWithPagination', () => {
    let service: InstanceType<typeof AgentService>;

    beforeEach(() => {
      // Create a fresh instance for each test
      service = new AgentService();

      // Manually populate messages for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).messages = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
        time: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
      })) as Message[];
    });

    describe('No pagination (get all messages)', () => {
      it('should return all messages when no options are provided', () => {
        const result = service.getMessagesWithPagination({});

        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('Head/Tail pagination', () => {
      it('should return first n messages when direction=head', () => {
        const result = service.getMessagesWithPagination({
          limit: 5,
          direction: 'head',
        });

        expect(result.messages).toHaveLength(5);
        expect(result.messages[0].id).toBe(0);
        expect(result.messages[4].id).toBe(4);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should return last n messages when direction=tail', () => {
        const result = service.getMessagesWithPagination({
          limit: 5,
          direction: 'tail',
        });

        expect(result.messages).toHaveLength(5);
        expect(result.messages[0].id).toBe(15);
        expect(result.messages[4].id).toBe(19);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should default to tail when direction is not specified', () => {
        const result = service.getMessagesWithPagination({
          limit: 3,
        });

        expect(result.messages).toHaveLength(3);
        expect(result.messages[0].id).toBe(17);
        expect(result.messages[2].id).toBe(19);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should handle limit greater than total messages', () => {
        const result = service.getMessagesWithPagination({
          limit: 100,
          direction: 'head',
        });

        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });

      it('should handle limit equal to total messages', () => {
        const result = service.getMessagesWithPagination({
          limit: 20,
          direction: 'head',
        });

        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('Around pagination', () => {
      it('should return messages around a specific ID', () => {
        const result = service.getMessagesWithPagination({
          around: 10,
          context: 2,
        });

        expect(result.messages).toHaveLength(5); // 2 before + target + 2 after
        expect(result.messages[0].id).toBe(8);
        expect(result.messages[2].id).toBe(10); // Target message
        expect(result.messages[4].id).toBe(12);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should default context to 10 when not specified', () => {
        const result = service.getMessagesWithPagination({
          around: 15,
        });

        // 10 before + target + 4 after (only 4 messages after ID 15)
        expect(result.messages).toHaveLength(15);
        expect(result.messages[0].id).toBe(5);
        expect(result.messages[10].id).toBe(15); // Target message
        expect(result.messages[14].id).toBe(19);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should handle around at the beginning of messages', () => {
        const result = service.getMessagesWithPagination({
          around: 0,
          context: 5,
        });

        // Only 0 + 5 after (no messages before ID 0)
        expect(result.messages).toHaveLength(6);
        expect(result.messages[0].id).toBe(0); // Target message
        expect(result.messages[5].id).toBe(5);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should handle around at the end of messages', () => {
        const result = service.getMessagesWithPagination({
          around: 19,
          context: 5,
        });

        // 5 before + target (no messages after ID 19)
        expect(result.messages).toHaveLength(6);
        expect(result.messages[0].id).toBe(14);
        expect(result.messages[5].id).toBe(19); // Target message
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(true);
      });

      it('should return empty array when ID is not found', () => {
        const result = service.getMessagesWithPagination({
          around: 999,
          context: 5,
        });

        expect(result.messages).toHaveLength(0);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });

      it('should handle context larger than available messages', () => {
        const result = service.getMessagesWithPagination({
          around: 10,
          context: 100,
        });

        // Should return all messages
        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('Cursor-based pagination (after/before)', () => {
      describe('after parameter', () => {
        it('should return messages with ID > after', () => {
          const result = service.getMessagesWithPagination({ after: 10 });

          expect(result.messages).toHaveLength(9); // IDs 11-19
          expect(result.messages[0].id).toBe(11);
          expect(result.messages[8].id).toBe(19);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false); // No more messages after 19
        });

        it('should exclude the cursor message itself', () => {
          const result = service.getMessagesWithPagination({ after: 10 });

          expect(result.messages.every(m => m.id !== 10)).toBe(true);
          expect(result.messages[0].id).toBe(11); // First message is after 10
        });

        it('should work with limit parameter', () => {
          const result = service.getMessagesWithPagination({ after: 5, limit: 3 });

          expect(result.messages).toHaveLength(3); // IDs 6, 7, 8
          expect(result.messages[0].id).toBe(6);
          expect(result.messages[2].id).toBe(8);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(true); // More messages exist after 8
        });

        it('should handle after at the end', () => {
          const result = service.getMessagesWithPagination({ after: 19 });

          expect(result.messages).toHaveLength(0); // No messages after last one
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false);
        });

        it('should return empty when ID not found', () => {
          const result = service.getMessagesWithPagination({ after: 999 });

          expect(result.messages).toHaveLength(0);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false);
        });

        it('should handle after=0 (first message)', () => {
          const result = service.getMessagesWithPagination({ after: 0 });

          expect(result.messages).toHaveLength(19); // IDs 1-19
          expect(result.messages[0].id).toBe(1);
          expect(result.messages[18].id).toBe(19);
          expect(result.hasMore).toBe(false);
        });
      });

      describe('before parameter', () => {
        it('should return messages with ID < before', () => {
          const result = service.getMessagesWithPagination({ before: 10 });

          expect(result.messages).toHaveLength(10); // IDs 0-9
          expect(result.messages[0].id).toBe(0);
          expect(result.messages[9].id).toBe(9);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false); // No more messages before 0
        });

        it('should exclude the cursor message itself', () => {
          const result = service.getMessagesWithPagination({ before: 10 });

          expect(result.messages.every(m => m.id !== 10)).toBe(true);
          expect(result.messages[result.messages.length - 1].id).toBe(9);
        });

        it('should work with limit parameter', () => {
          const result = service.getMessagesWithPagination({ before: 10, limit: 3 });

          expect(result.messages).toHaveLength(3); // IDs 7, 8, 9
          expect(result.messages[0].id).toBe(7);
          expect(result.messages[2].id).toBe(9);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(true); // More messages exist before 7
        });

        it('should handle before at the start', () => {
          const result = service.getMessagesWithPagination({ before: 0 });

          expect(result.messages).toHaveLength(0); // No messages before first one
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false);
        });

        it('should return empty when ID not found', () => {
          const result = service.getMessagesWithPagination({ before: 999 });

          expect(result.messages).toHaveLength(0);
          expect(result.total).toBe(20);
          expect(result.hasMore).toBe(false);
        });

        it('should handle before=19 (last message)', () => {
          const result = service.getMessagesWithPagination({ before: 19 });

          expect(result.messages).toHaveLength(19); // IDs 0-18
          expect(result.messages[0].id).toBe(0);
          expect(result.messages[18].id).toBe(18);
          expect(result.hasMore).toBe(false);
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle empty message list', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any).messages = [];

        const result = service.getMessagesWithPagination({
          limit: 10,
        });

        expect(result.messages).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.hasMore).toBe(false);
      });

      it('should handle single message', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any).messages = [
          {
            id: 0,
            role: 'user',
            content: 'Only message',
            time: new Date().toISOString(),
          },
        ] as Message[];

        const result = service.getMessagesWithPagination({
          limit: 10,
        });

        expect(result.messages).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.hasMore).toBe(false);
      });

      it('should not set hasMore when all messages fit in head direction', () => {
        const result = service.getMessagesWithPagination({
          limit: 20,
          direction: 'head',
        });

        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });

      it('should not set hasMore when all messages fit in tail direction', () => {
        const result = service.getMessagesWithPagination({
          limit: 20,
          direction: 'tail',
        });

        expect(result.messages).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.hasMore).toBe(false);
      });
    });
  });
});
