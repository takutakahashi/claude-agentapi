import { logger } from '../utils/logger.js';
export class SessionService {
    subscribers = new Map();
    subscribe(client) {
        this.subscribers.set(client.id, client);
        logger.info(`SSE client ${client.id} subscribed (total: ${this.subscribers.size})`);
    }
    unsubscribe(clientId) {
        const client = this.subscribers.get(clientId);
        if (client) {
            this.subscribers.delete(clientId);
            logger.info(`SSE client ${clientId} unsubscribed (total: ${this.subscribers.size})`);
        }
    }
    broadcast(event, data) {
        logger.debug(`Broadcasting event '${event}' to ${this.subscribers.size} clients`);
        // Remove closed clients
        const closedClients = [];
        this.subscribers.forEach((client, id) => {
            try {
                client.send(event, data);
            }
            catch (error) {
                logger.error(`Error sending to client ${id}:`, error);
                closedClients.push(id);
            }
        });
        // Clean up closed clients
        closedClients.forEach(id => this.unsubscribe(id));
    }
    broadcastMessageUpdate(message) {
        this.broadcast('message_update', message);
    }
    broadcastStatusChange(status) {
        this.broadcast('status_change', { status });
    }
    sendInitialState(client, messages, status) {
        const initEvent = {
            messages,
            status,
        };
        client.send('init', initEvent);
    }
    getSubscriberCount() {
        return this.subscribers.size;
    }
}
export const sessionService = new SessionService();
//# sourceMappingURL=session.js.map