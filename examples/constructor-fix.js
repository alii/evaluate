import {evaluate} from '../src';

// Simple test to demonstrate the Logger bug and provide a corrected version
const globalObject = {
  console: {
    log: (...args) => console.log('Eval:', ...args),
    error: (...args) => console.error('Eval Error:', ...args),
    warn: (...args) => console.warn('Eval Warning:', ...args)
  },
  Date
};

// Using classic function constructor pattern
const code = `
// Using traditional constructor function
// This is much more likely to work correctly with evaluator
function Logger(name) {
  // Directly store properties on 'this'
  this.name = name;
  this.level = 'info';
  
  this.levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
}

// Explicitly add methods to the prototype
Logger.prototype.setLevel = function(level) {
  if (this.levels[level] !== undefined) {
    this.level = level;
  }
};

Logger.prototype.format = function(level, message) {
  const time = new Date().toISOString().substring(11, 19);
  return \`[\${time}] [\${level.toUpperCase()}] [\${this.name}] \${message}\`;
};

Logger.prototype.debug = function(message) {
  if (this.levels[this.level] <= this.levels.debug) {
    console.log(this.format('debug', message));
  }
};

Logger.prototype.info = function(message) {
  if (this.levels[this.level] <= this.levels.info) {
    console.log(this.format('info', message));
  }
};

Logger.prototype.warn = function(message) {
  if (this.levels[this.level] <= this.levels.warn) {
    console.warn(this.format('warn', message));
  }
};

Logger.prototype.error = function(message) {
  if (this.levels[this.level] <= this.levels.error) {
    console.error(this.format('error', message));
  }
};

// This is a self-executing function that verifies the logger works
(function testLogger() {
  // Create a logger instance without using 'new' to test if that works
  const testLogger = {
    name: "Test",
    level: "info",
    levels: {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    }
  };

  // Borrow methods
  testLogger.format = Logger.prototype.format;
  testLogger.debug = Logger.prototype.debug;

  // Try using the method (should work without 'new')
  testLogger.debug("Testing logger without new");
})();

// Create loggers with proper 'new' operator
const appLogger = new Logger('App');
const userLogger = new Logger('User');

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
    { name: appLogger.name, level: appLogger.level },
    { name: userLogger.name, level: userLogger.level }
  ]
})
`;

(async () => {
  try {
    const result = await evaluate(globalObject, code);
    console.log('Result:', result);
  } catch (err) {
    console.error('Evaluation failed:', err);
  }
})();