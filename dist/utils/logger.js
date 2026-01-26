class Logger {
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }
    info(message, ...args) {
        console.log(this.formatMessage('info', message), ...args);
    }
    warn(message, ...args) {
        console.warn(this.formatMessage('warn', message), ...args);
    }
    error(message, ...args) {
        console.error(this.formatMessage('error', message), ...args);
    }
    debug(message, ...args) {
        if (process.env.DEBUG) {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map