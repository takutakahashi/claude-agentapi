import type { SSEClient } from '../types/agent.js';
import type { Message, InitEvent } from '../types/api.js';
import { logger } from '../utils/logger.js';

const CLIENT_TIMEOUT_MS = parseInt(process.env.CLIENT_TIMEOUT_MS || '300000', 10); // 5 minutes default
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || '60000', 10); // 1 minute default

export class SessionService {
  private subscribers: Map<string, SSEClient> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  subscribe(client: SSEClient): void {
    this.subscribers.set(client.id, client);
    logger.info(`SSE client ${client.id} subscribed (total: ${this.subscribers.size})`);

    // Start cleanup timer if not already running
    if (!this.cleanupTimer) {
      this.startCleanupTimer();
    }
  }

  unsubscribe(clientId: string): void {
    const client = this.subscribers.get(clientId);
    if (client) {
      this.subscribers.delete(clientId);
      logger.info(`SSE client ${clientId} unsubscribed (total: ${this.subscribers.size})`);
    }
  }

  broadcast(event: string, data: unknown): void {
    logger.debug(`Broadcasting event '${event}' to ${this.subscribers.size} clients`);

    // Remove closed clients
    const closedClients: string[] = [];

    this.subscribers.forEach((client, id) => {
      try {
        client.send(event, data);
      } catch (error) {
        logger.error(`Error sending to client ${id}:`, error);
        closedClients.push(id);
      }
    });

    // Clean up closed clients
    closedClients.forEach(id => this.unsubscribe(id));
  }

  broadcastMessageUpdate(message: Message): void {
    this.broadcast('message_update', message);
  }

  broadcastStatusChange(status: 'running' | 'stable'): void {
    this.broadcast('status_change', { status });
  }

  sendInitialState(client: SSEClient, messages: Message[], status: 'running' | 'stable'): void {
    const initEvent: InitEvent = {
      messages,
      status,
    };
    client.send('init', initEvent);
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleClients();
    }, CLEANUP_INTERVAL_MS);
    logger.info(`Started SSE client cleanup timer (interval: ${CLEANUP_INTERVAL_MS}ms, timeout: ${CLIENT_TIMEOUT_MS}ms)`);
  }

  private cleanupStaleClients(): void {
    const now = Date.now();
    const staleClients: string[] = [];

    this.subscribers.forEach((client, id) => {
      // Type guard to check if client has lastActivityTime property
      if ('lastActivityTime' in client && typeof client.lastActivityTime === 'number') {
        if (now - client.lastActivityTime > CLIENT_TIMEOUT_MS) {
          staleClients.push(id);
        }
      }

      // Also check if client is closed
      if ('isClosed' in client && typeof client.isClosed === 'function' && client.isClosed()) {
        staleClients.push(id);
      }
    });

    if (staleClients.length > 0) {
      logger.info(`Cleaning up ${staleClients.length} stale SSE client(s)`);
      staleClients.forEach(id => this.unsubscribe(id));
    }

    // Stop cleanup timer if no subscribers
    if (this.subscribers.size === 0 && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Stopped SSE client cleanup timer (no subscribers)');
    }
  }

  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.subscribers.clear();
    logger.info('SessionService cleaned up');
  }
}

export const sessionService = new SessionService();
