import type { SSEClient } from '../types/agent.js';
import type { Message } from '../types/api.js';
export declare class SessionService {
    private subscribers;
    subscribe(client: SSEClient): void;
    unsubscribe(clientId: string): void;
    broadcast(event: string, data: unknown): void;
    broadcastMessageUpdate(message: Message): void;
    broadcastStatusChange(status: 'running' | 'stable'): void;
    sendInitialState(client: SSEClient, messages: Message[], status: 'running' | 'stable'): void;
    getSubscriberCount(): number;
}
export declare const sessionService: SessionService;
//# sourceMappingURL=session.d.ts.map