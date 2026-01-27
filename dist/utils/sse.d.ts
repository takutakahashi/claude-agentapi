import type { Response } from 'express';
import type { SSEClient } from '../types/agent.js';
export declare class SSEClientImpl implements SSEClient {
    readonly id: string;
    private res;
    private closed;
    lastActivityTime: number;
    constructor(id: string, res: Response);
    send(event: string, data: unknown): void;
    close(): void;
    isClosed(): boolean;
}
//# sourceMappingURL=sse.d.ts.map