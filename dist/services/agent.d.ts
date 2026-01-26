import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
export declare class AgentService {
    private query;
    private inputStreamManager;
    private queryProcessorPromise;
    private status;
    private messages;
    private messageIdCounter;
    initialize(): Promise<void>;
    /**
     * Apply optional configuration to query options
     */
    private applyOptionalConfig;
    private processQuery;
    sendMessage(content: string): Promise<void>;
    private processSDKMessage;
    private handleSystemMessage;
    private logMcpServerStatus;
    private handleToolUse;
    private formatToolUse;
    private formatQuestion;
    private formatPlan;
    private recordResultMetrics;
    private recordToolMetrics;
    private detectLanguageFromInput;
    private recordWriteToolMetrics;
    private addMessage;
    private generateMessageId;
    private setStatus;
    getStatus(): AgentStatus;
    getMessages(): Message[];
    cleanup(): Promise<void>;
}
export declare const agentService: AgentService;
//# sourceMappingURL=agent.d.ts.map