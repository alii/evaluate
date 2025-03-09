import {evaluate} from '../src';

// Logging example - functional approach to avoid evaluator issues with 'this'
const globalObject = {
  console: {
    log: (...args) => console.log('Eval:', ...args),
    error: (...args) => console.error('Eval Error:', ...args),
    warn: (...args) => console.warn('Eval Warning:', ...args)
  },
  Date
};

const code = `
// Define logging levels
const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Format a log message
function formatLogMessage(loggerName, level, message) {
  const time = new Date().toISOString().substring(11, 19);
  return \`[\${time}] [\${level.toUpperCase()}] [\${loggerName}] \${message}\`;
}

// Create logger factory function
function createLogger(name) {
  // Create a logger with initial settings
  const logger = {
    name,
    level: 'info'
  };
  
  // Add methods to the logger
  return {
    // Get the logger name
    getName: () => logger.name,
    
    // Get the current log level
    getLevel: () => logger.level,
    
    // Set the log level
    setLevel: (level) => {
      if (LEVELS[level] !== undefined) {
        logger.level = level;
      }
    },
    
    // Log a debug message
    debug: (message) => {
      if (LEVELS[logger.level] <= LEVELS.debug) {
        console.log(formatLogMessage(logger.name, 'debug', message));
      }
    },
    
    // Log an info message
    info: (message) => {
      if (LEVELS[logger.level] <= LEVELS.info) {
        console.log(formatLogMessage(logger.name, 'info', message));
      }
    },
    
    // Log a warning message
    warn: (message) => {
      if (LEVELS[logger.level] <= LEVELS.warn) {
        console.warn(formatLogMessage(logger.name, 'warn', message));
      }
    },
    
    // Log an error message
    error: (message) => {
      if (LEVELS[logger.level] <= LEVELS.error) {
        console.error(formatLogMessage(logger.name, 'error', message));
      }
    }
  };
}

// Create different loggers
const appLogger = createLogger('App');
const userLogger = createLogger('User');

// Set different log levels
appLogger.setLevel('debug');
userLogger.setLevel('warn');

// Log some messages
appLogger.debug('Starting application');
appLogger.info('Loading configuration');
appLogger.warn('Config file not found, using defaults');
appLogger.error('Failed to connect to database');

userLogger.debug('User clicked button'); // Won't display
userLogger.info('User logged in'); // Won't display
userLogger.warn('Invalid password attempt');
userLogger.error('User account locked');

// Return logger info
({
  loggers: [
    { name: appLogger.getName(), level: appLogger.getLevel() },
    { name: userLogger.getName(), level: userLogger.getLevel() }
  ]
})
`;

console.log(await evaluate(globalObject, code));