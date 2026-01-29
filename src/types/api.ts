import { z } from 'zod';

// API Types based on coder/agentapi specification

export const MessageSchema = z.object({
  id: z.number(),
  role: z.enum(['user', 'assistant', 'agent', 'tool_result']),
  content: z.string(),
  time: z.string(), // ISO 8601 timestamp
  type: z.enum(['normal', 'question', 'plan']).optional(),
  // Tool execution tracking fields
  toolUseId: z.string().optional(), // ID of tool_use (for 'agent' role messages)
  parentToolUseId: z.string().optional(), // ID of parent tool_use (for 'tool_result' role messages)
  status: z.enum(['success', 'error']).optional(), // Execution status (for 'tool_result' role messages)
  error: z.string().optional(), // Error message (for 'tool_result' role messages with status='error')
});

export type Message = z.infer<typeof MessageSchema>;

export const MessagesResponseBodySchema = z.object({
  $schema: z.string().optional(),
  messages: z.array(MessageSchema),
});

export type MessagesResponseBody = z.infer<typeof MessagesResponseBodySchema>;

export const ToolStatusResponseBodySchema = z.object({
  $schema: z.string().optional(),
  messages: z.array(MessageSchema),
});

export type ToolStatusResponseBody = z.infer<typeof ToolStatusResponseBodySchema>;

export const PostMessageRequestSchema = z.object({
  content: z.string(),
  type: z.enum(['user', 'raw']),
});

export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;

export const PostMessageResponseSchema = z.object({
  ok: z.boolean(),
});

export type PostMessageResponse = z.infer<typeof PostMessageResponseSchema>;

export const StatusResponseSchema = z.object({
  agent_type: z.string(),
  status: z.enum(['running', 'stable']),
});

export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const UploadResponseSchema = z.object({
  filePath: z.string(),
  ok: z.boolean(),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

// Problem+JSON format for error responses
export const ProblemJsonSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemJson = z.infer<typeof ProblemJsonSchema>;

// SSE Event types
export type SSEEventType = 'init' | 'message_update' | 'status_change';

export interface SSEEvent {
  event: SSEEventType;
  data: unknown;
}

export interface InitEvent {
  messages: Message[];
  status: 'running' | 'stable';
}

// Action request schema for answering AskUserQuestion
export const PostActionRequestSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export type PostActionRequest = z.infer<typeof PostActionRequestSchema>;

export const PostActionResponseSchema = z.object({
  ok: z.boolean(),
});

export type PostActionResponse = z.infer<typeof PostActionResponseSchema>;
