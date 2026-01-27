/**
 * @file logger.test.js
 * @description Basic tests for logger functionality
 */

import { logger, LOG_LEVELS } from '../logger.js';

describe('Logger', () => {
  it('should have all required methods', () => {
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it('should log messages without crashing', () => {
    expect(() => logger.info('Test', 'Message')).not.toThrow();
  });

  it('should have LOG_LEVELS exported', () => {
    expect(LOG_LEVELS).toBeDefined();
    expect(LOG_LEVELS.INFO).toBeDefined();
  });
});
