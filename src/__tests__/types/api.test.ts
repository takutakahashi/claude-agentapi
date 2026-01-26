import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  MessagesResponseBodySchema,
  PostMessageRequestSchema,
  PostMessageResponseSchema,
  StatusResponseSchema,
  ProblemJsonSchema,
} from '../../types/api.js';

describe('API Types', () => {
  describe('MessageSchema', () => {
    it('should validate a valid message', () => {
      const validMessage = {
        id: 0,
        role: 'user',
        content: 'Hello',
        time: '2024-01-01T00:00:00.000Z',
      };

      const result = MessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should validate message with type', () => {
      const validMessage = {
        id: 1,
        role: 'assistant',
        content: 'Response',
        time: '2024-01-01T00:00:00.000Z',
        type: 'question',
      };

      const result = MessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should validate agent role', () => {
      const validMessage = {
        id: 2,
        role: 'agent',
        content: 'Agent response',
        time: '2024-01-01T00:00:00.000Z',
      };

      const result = MessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const invalidMessage = {
        id: 0,
        role: 'invalid',
        content: 'Hello',
        time: '2024-01-01T00:00:00.000Z',
      };

      const result = MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidMessage = {
        id: 0,
        role: 'user',
      };

      const result = MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('PostMessageRequestSchema', () => {
    it('should validate user message request', () => {
      const validRequest = {
        content: 'Hello',
        type: 'user',
      };

      const result = PostMessageRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate raw message request', () => {
      const validRequest = {
        content: 'raw input',
        type: 'raw',
      };

      const result = PostMessageRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const invalidRequest = {
        content: 'Hello',
        type: 'invalid',
      };

      const result = PostMessageRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('PostMessageResponseSchema', () => {
    it('should validate success response', () => {
      const validResponse = { ok: true };
      const result = PostMessageResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should validate failure response', () => {
      const validResponse = { ok: false };
      const result = PostMessageResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('StatusResponseSchema', () => {
    it('should validate stable status', () => {
      const validStatus = {
        agent_type: 'claude',
        status: 'stable',
      };

      const result = StatusResponseSchema.safeParse(validStatus);
      expect(result.success).toBe(true);
    });

    it('should validate running status', () => {
      const validStatus = {
        agent_type: 'claude',
        status: 'running',
      };

      const result = StatusResponseSchema.safeParse(validStatus);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const invalidStatus = {
        agent_type: 'claude',
        status: 'invalid',
      };

      const result = StatusResponseSchema.safeParse(invalidStatus);
      expect(result.success).toBe(false);
    });
  });

  describe('ProblemJsonSchema', () => {
    it('should validate minimal problem json', () => {
      const validProblem = {
        type: 'about:blank',
        title: 'Error',
        status: 400,
      };

      const result = ProblemJsonSchema.safeParse(validProblem);
      expect(result.success).toBe(true);
    });

    it('should validate problem json with detail', () => {
      const validProblem = {
        type: 'about:blank',
        title: 'Error',
        status: 400,
        detail: 'Detailed error message',
      };

      const result = ProblemJsonSchema.safeParse(validProblem);
      expect(result.success).toBe(true);
    });

    it('should validate problem json with instance', () => {
      const validProblem = {
        type: 'about:blank',
        title: 'Error',
        status: 400,
        instance: '/api/endpoint',
      };

      const result = ProblemJsonSchema.safeParse(validProblem);
      expect(result.success).toBe(true);
    });
  });

  describe('MessagesResponseBodySchema', () => {
    it('should validate messages response with schema', () => {
      const validResponse = {
        $schema: 'https://10.42.2.198:9000/schemas/MessagesResponseBody.json',
        messages: [
          {
            id: 0,
            content: 'Test message',
            role: 'agent',
            time: '2026-01-26T07:56:36.432498007Z',
          },
          {
            id: 1,
            content: 'User message',
            role: 'user',
            time: '2026-01-26T07:56:40.357019866Z',
          },
        ],
      };

      const result = MessagesResponseBodySchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should validate messages response without schema', () => {
      const validResponse = {
        messages: [
          {
            id: 0,
            content: 'Test message',
            role: 'agent',
            time: '2026-01-26T07:56:36.432498007Z',
          },
        ],
      };

      const result = MessagesResponseBodySchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should reject invalid messages array', () => {
      const invalidResponse = {
        messages: 'not an array',
      };

      const result = MessagesResponseBodySchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });
});
