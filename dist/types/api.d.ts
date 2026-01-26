import { z } from 'zod';
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodNumber;
    role: z.ZodEnum<["user", "assistant", "agent"]>;
    content: z.ZodString;
    time: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<["normal", "question", "plan"]>>;
}, "strip", z.ZodTypeAny, {
    id: number;
    role: "user" | "assistant" | "agent";
    content: string;
    time: string;
    type?: "normal" | "question" | "plan" | undefined;
}, {
    id: number;
    role: "user" | "assistant" | "agent";
    content: string;
    time: string;
    type?: "normal" | "question" | "plan" | undefined;
}>;
export type Message = z.infer<typeof MessageSchema>;
export declare const MessagesResponseBodySchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        role: z.ZodEnum<["user", "assistant", "agent"]>;
        content: z.ZodString;
        time: z.ZodString;
        type: z.ZodOptional<z.ZodEnum<["normal", "question", "plan"]>>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        role: "user" | "assistant" | "agent";
        content: string;
        time: string;
        type?: "normal" | "question" | "plan" | undefined;
    }, {
        id: number;
        role: "user" | "assistant" | "agent";
        content: string;
        time: string;
        type?: "normal" | "question" | "plan" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    messages: {
        id: number;
        role: "user" | "assistant" | "agent";
        content: string;
        time: string;
        type?: "normal" | "question" | "plan" | undefined;
    }[];
    $schema?: string | undefined;
}, {
    messages: {
        id: number;
        role: "user" | "assistant" | "agent";
        content: string;
        time: string;
        type?: "normal" | "question" | "plan" | undefined;
    }[];
    $schema?: string | undefined;
}>;
export type MessagesResponseBody = z.infer<typeof MessagesResponseBodySchema>;
export declare const PostMessageRequestSchema: z.ZodObject<{
    content: z.ZodString;
    type: z.ZodEnum<["user", "raw"]>;
}, "strip", z.ZodTypeAny, {
    type: "user" | "raw";
    content: string;
}, {
    type: "user" | "raw";
    content: string;
}>;
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
export declare const PostMessageResponseSchema: z.ZodObject<{
    ok: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
}, {
    ok: boolean;
}>;
export type PostMessageResponse = z.infer<typeof PostMessageResponseSchema>;
export declare const StatusResponseSchema: z.ZodObject<{
    agent_type: z.ZodString;
    status: z.ZodEnum<["running", "stable"]>;
}, "strip", z.ZodTypeAny, {
    status: "running" | "stable";
    agent_type: string;
}, {
    status: "running" | "stable";
    agent_type: string;
}>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
export declare const UploadResponseSchema: z.ZodObject<{
    filePath: z.ZodString;
    ok: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
    filePath: string;
}, {
    ok: boolean;
    filePath: string;
}>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export declare const ProblemJsonSchema: z.ZodObject<{
    type: z.ZodString;
    title: z.ZodString;
    status: z.ZodNumber;
    detail: z.ZodOptional<z.ZodString>;
    instance: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: number;
    type: string;
    title: string;
    detail?: string | undefined;
    instance?: string | undefined;
}, {
    status: number;
    type: string;
    title: string;
    detail?: string | undefined;
    instance?: string | undefined;
}>;
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
//# sourceMappingURL=api.d.ts.map