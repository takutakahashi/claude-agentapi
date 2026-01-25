import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSEClientImpl } from '../../utils/sse.js';
import type { Response } from 'express';

describe('SSEClientImpl', () => {
  let mockResponse: Partial<Response>;
  let setHeaderSpy: any;
  let writeSpy: any;
  let endSpy: any;
  let onSpy: any;

  beforeEach(() => {
    setHeaderSpy = vi.fn();
    writeSpy = vi.fn();
    endSpy = vi.fn();
    onSpy = vi.fn();

    mockResponse = {
      setHeader: setHeaderSpy as any,
      write: writeSpy as any,
      end: endSpy as any,
      on: onSpy as any,
    };
  });

  describe('constructor', () => {
    it('should set SSE headers', () => {
      new SSEClientImpl('test-id', mockResponse as Response);

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(setHeaderSpy).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(setHeaderSpy).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });

    it('should register close event handler', () => {
      new SSEClientImpl('test-id', mockResponse as Response);
      expect(onSpy).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('send', () => {
    it('should send SSE event with data', () => {
      const client = new SSEClientImpl('test-id', mockResponse as Response);
      const data = { message: 'test' };

      client.send('test-event', data);

      expect(writeSpy).toHaveBeenCalledWith(
        'event: test-event\ndata: {"message":"test"}\n\n'
      );
    });

    it('should handle complex data objects', () => {
      const client = new SSEClientImpl('test-id', mockResponse as Response);
      const data = { nested: { value: 123 }, array: [1, 2, 3] };

      client.send('complex-event', data);

      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('event: complex-event')
      );
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('"nested":{"value":123}')
      );
    });

    it('should not send if client is closed', () => {
      const client = new SSEClientImpl('test-id', mockResponse as Response);
      client.close();

      client.send('test-event', { data: 'test' });

      // Should have been called only during constructor, not during send
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should end the response', () => {
      const client = new SSEClientImpl('test-id', mockResponse as Response);
      client.close();

      expect(endSpy).toHaveBeenCalled();
    });

    it('should not call end multiple times', () => {
      const client = new SSEClientImpl('test-id', mockResponse as Response);
      client.close();
      client.close();

      expect(endSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('id', () => {
    it('should store and return client id', () => {
      const client = new SSEClientImpl('my-test-id', mockResponse as Response);
      expect(client.id).toBe('my-test-id');
    });
  });
});
