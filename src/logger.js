// Enhanced logging system per Protocol Rule #1
// Provides structured logging with levels for UI integration

const LOG_LEVELS = {
  DEBUG: { value: 0, label: 'DEBUG', color: '#6b7785' },
  INFO: { value: 1, label: 'INFO', color: '#06b6d4' },
  WARN: { value: 2, label: 'WARN', color: '#f59e0b' },
  ERROR: { value: 3, label: 'ERROR', color: '#ef4444' },
  CRITICAL: { value: 4, label: 'CRITICAL', color: '#991b1b' }
};

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.minLevel = LOG_LEVELS.DEBUG.value;
    this.listeners = [];
  }

  // Add listener for log updates (for UI components)
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Notify all listeners of new log
  notifyListeners(logEntry) {
    this.listeners.forEach(listener => listener(logEntry));
  }

  // Core logging method
  log(level, component, message, data = null) {
    if (level.value < this.minLevel) return;

    const logEntry = {
      timestamp: new Date(),
      level: level.label,
      levelValue: level.value,
      color: level.color,
      component,
      message,
      data,
      id: `${Date.now()}-${Math.random()}`
    };

    this.logs.push(logEntry);
    
    // Keep logs under max size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output for dev
    const style = `color: ${level.color}; font-weight: bold;`;
    console.log(`%c[${level.label}]`, style, `[${component}]`, message, data || '');

    this.notifyListeners(logEntry);
  }

  debug(component, message, data) {
    this.log(LOG_LEVELS.DEBUG, component, message, data);
  }

  info(component, message, data) {
    this.log(LOG_LEVELS.INFO, component, message, data);
  }

  warn(component, message, data) {
    this.log(LOG_LEVELS.WARN, component, message, data);
  }

  error(component, message, data) {
    this.log(LOG_LEVELS.ERROR, component, message, data);
  }

  critical(component, message, data) {
    this.log(LOG_LEVELS.CRITICAL, component, message, data);
  }

  // Get logs with optional filtering
  getLogs(filter = {}) {
    let filtered = [...this.logs];

    if (filter.level) {
      const minLevel = LOG_LEVELS[filter.level]?.value ?? 0;
      filtered = filtered.filter(log => log.levelValue >= minLevel);
    }

    if (filter.component) {
      filtered = filtered.filter(log => log.component === filter.component);
    }

    if (filter.search) {
      const search = filter.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(search) ||
        log.component.toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  // Clear all logs
  clear() {
    this.logs = [];
    this.notifyListeners({ type: 'clear' });
  }

  // Set minimum log level
  setMinLevel(levelName) {
    const level = LOG_LEVELS[levelName];
    if (level) {
      this.minLevel = level.value;
    }
  }
}

// Export singleton instance
export const logger = new Logger();
export { LOG_LEVELS };
