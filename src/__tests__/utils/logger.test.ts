import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../utils/logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test message')
      );
    });

    it('should include timestamp in log', () => {
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] warning message')
      );
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] error message')
      );
    });
  });

  describe('debug', () => {
    it('should log debug messages when DEBUG is set', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';

      logger.debug('debug message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] debug message')
      );

      process.env.DEBUG = originalDebug;
    });

    it('should not log debug messages when DEBUG is not set', () => {
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;

      logger.debug('debug message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();

      process.env.DEBUG = originalDebug;
    });
  });
});
