import type { Message } from '../types/api.js';
import type { AgentStatus } from '../types/agent.js';
export declare class AgentService {
    private query;
    private inputStreamManager;
    private queryProcessorPromise;
    private status;
    private messages;
    private activeToolExecutions;
    private messageIdCounter;
    private pendingQuestionToolUseId;
    initialize(): Promise<void>;
    private processQuery;
    sendMessage(content: string): Promise<void>;
    sendAction(answers: Record<string, string>): Promise<void>;
    private processSDKMessage;
    private handleSystemMessage;
    private handleToolUse;
    private formatToolUse;
    private formatQuestion;
    private formatPlan;
    private recordResultMetrics;
    private recordToolMetrics;
    private addMessage;
    private generateMessageId;
    private setStatus;
    getStatus(): AgentStatus;
    getMessages(): Message[];
    getActiveToolExecutions(): Message[];
    cleanup(): Promise<void>;
}
export declare const agentService: AgentService;
//# sourceMappingURL=agent.d.ts.map