declare class Logger {
    private formatMessage;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map