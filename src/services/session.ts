import type { SSEClient } from '../types/agent.js';
import type { Message, InitEvent } from '../types/api.js';
import { logger } from '../utils/logger.js';

export class SessionService {
  private subscribers: Map<string, SSEClient> = new Map();

  subscribe(client: SSEClient): void {
    this.subscribers.set(client.id, client);
    logger.info(`SSE client ${client.id} subscribed (total: ${this.subscribers.size})`);
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
}

export const sessionService = new SessionService();
