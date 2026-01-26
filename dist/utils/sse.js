import { logger } from './logger.js';
export class SSEClientImpl {
    id;
    res;
    closed = false;
    constructor(id, res) {
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
    send(event, data) {
        if (this.closed) {
            logger.warn(`Attempted to send to closed SSE client ${this.id}`);
            return;
        }
        try {
            const dataString = JSON.stringify(data);
            this.res.write(`event: ${event}\ndata: ${dataString}\n\n`);
        }
        catch (error) {
            logger.error(`Error sending SSE event to client ${this.id}:`, error);
        }
    }
    close() {
        if (!this.closed) {
            this.closed = true;
            this.res.end();
        }
    }
    isClosed() {
        return this.closed;
    }
}
//# sourceMappingURL=sse.js.map