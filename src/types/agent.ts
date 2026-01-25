import type { Message } from './api.js';

export type AgentStatus = 'stable' | 'running';

export interface AgentState {
  status: AgentStatus;
  messages: Message[];
}

export interface SSEClient {
  id: string;
  send: (event: string, data: unknown) => void;
  close: () => void;
}
