import type { Response } from 'express';
import type { SSEClient } from '../types/agent.js';
import { logger } from './logger.js';

export class SSEClientImpl implements SSEClient {
  public readonly id: string;
  private res: Response;
  private closed: boolean = false;
  public lastActivityTime: number = Date.now();

  constructor(id: string, res: Response) {
    this.id = id;
    this.res = res;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Handle client disconnect
    res.on('close', () => {
      this.closed = true;
      logger.debug(`SSE client ${this.id} disconnected`);
    });
  }

  send(event: string, data: unknown): void {
    if (this.closed) {
      logger.warn(`Attempted to send to closed SSE client ${this.id}`);
      return;
    }

    try {
      const dataString = JSON.stringify(data);
      this.res.write(`event: ${event}\ndata: ${dataString}\n\n`);
      this.lastActivityTime = Date.now();
    } catch (error) {
      logger.error(`Error sending SSE event to client ${this.id}:`, error);
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.res.end();
    }
  }

  isClosed(): boolean {
    return this.closed;
  }
}
