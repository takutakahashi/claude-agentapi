import { z } from 'zod';
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodNumber;
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        agent: "agent";
        tool_result: "tool_result";
    }>;
    content: z.ZodString;
    time: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        normal: "normal";
        question: "question";
        plan: "plan";
    }>>;
    toolUseId: z.ZodOptional<z.ZodString>;
    parentToolUseId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        success: "success";
        error: "error";
    }>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Message = z.infer<typeof MessageSchema>;
export declare const MessagesResponseBodySchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
            agent: "agent";
            tool_result: "tool_result";
        }>;
        content: z.ZodString;
        time: z.ZodString;
        type: z.ZodOptional<z.ZodEnum<{
            normal: "normal";
            question: "question";
            plan: "plan";
        }>>;
        toolUseId: z.ZodOptional<z.ZodString>;
        parentToolUseId: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodEnum<{
            success: "success";
            error: "error";
        }>>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type MessagesResponseBody = z.infer<typeof MessagesResponseBodySchema>;
export declare const ToolStatusResponseBodySchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
            agent: "agent";
            tool_result: "tool_result";
        }>;
        content: z.ZodString;
        time: z.ZodString;
        type: z.ZodOptional<z.ZodEnum<{
            normal: "normal";
            question: "question";
            plan: "plan";
        }>>;
        toolUseId: z.ZodOptional<z.ZodString>;
        parentToolUseId: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodEnum<{
            success: "success";
            error: "error";
        }>>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ToolStatusResponseBody = z.infer<typeof ToolStatusResponseBodySchema>;
export declare const PostMessageRequestSchema: z.ZodObject<{
    content: z.ZodString;
    type: z.ZodEnum<{
        user: "user";
        raw: "raw";
    }>;
}, z.core.$strip>;
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
export declare const PostMessageResponseSchema: z.ZodObject<{
    ok: z.ZodBoolean;
}, z.core.$strip>;
export type PostMessageResponse = z.infer<typeof PostMessageResponseSchema>;
export declare const StatusResponseSchema: z.ZodObject<{
    agent_type: z.ZodString;
    status: z.ZodEnum<{
        running: "running";
        stable: "stable";
    }>;
}, z.core.$strip>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
export declare const UploadResponseSchema: z.ZodObject<{
    filePath: z.ZodString;
    ok: z.ZodBoolean;
}, z.core.$strip>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export declare const ProblemJsonSchema: z.ZodObject<{
    type: z.ZodString;
    title: z.ZodString;
    status: z.ZodNumber;
    detail: z.ZodOptional<z.ZodString>;
    instance: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProblemJson = z.infer<typeof ProblemJsonSchema>;
export type SSEEventType = 'init' | 'message_update' | 'status_change';
export interface SSEEvent {
    event: SSEEventType;
    data: unknown;
}
export interface InitEvent {
    messages: Message[];
    status: 'running' | 'stable';
}
export declare const PostActionRequestSchema: z.ZodObject<{
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export type PostActionRequest = z.infer<typeof PostActionRequestSchema>;
export declare const PostActionResponseSchema: z.ZodObject<{
    ok: z.ZodBoolean;
}, z.core.$strip>;
export type PostActionResponse = z.infer<typeof PostActionResponseSchema>;
//# sourceMappingURL=api.d.ts.map