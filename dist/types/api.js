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
export const MessagesResponseBodySchema = z.object({
    $schema: z.string().optional(),
    messages: z.array(MessageSchema),
});
export const ToolStatusResponseBodySchema = z.object({
    $schema: z.string().optional(),
    messages: z.array(MessageSchema),
});
export const PostMessageRequestSchema = z.object({
    content: z.string(),
    type: z.enum(['user', 'raw']),
});
export const PostMessageResponseSchema = z.object({
    ok: z.boolean(),
});
export const StatusResponseSchema = z.object({
    agent_type: z.string(),
    status: z.enum(['running', 'stable']),
});
export const UploadResponseSchema = z.object({
    filePath: z.string(),
    ok: z.boolean(),
});
// Problem+JSON format for error responses
export const ProblemJsonSchema = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string().optional(),
    instance: z.string().optional(),
});
// Action request schemas for various agent actions
export const AnswerQuestionActionSchema = z.object({
    type: z.literal('answer_question'),
    answers: z.record(z.string(), z.string()),
});
export const ApprovePlanActionSchema = z.object({
    type: z.literal('approve_plan'),
    approved: z.boolean(),
});
export const StopAgentActionSchema = z.object({
    type: z.literal('stop_agent'),
});
export const PostActionRequestSchema = z.discriminatedUnion('type', [
    AnswerQuestionActionSchema,
    ApprovePlanActionSchema,
    StopAgentActionSchema,
]);
export const PostActionResponseSchema = z.object({
    ok: z.boolean(),
});
export const PendingActionSchema = z.object({
    type: z.string(),
    tool_use_id: z.string(),
    content: z.unknown(),
});
export const GetActionResponseSchema = z.object({
    pending_actions: z.array(PendingActionSchema),
});
//# sourceMappingURL=api.js.map