import {evaluate} from '../src';

// Logging example
const globalObject = {
  console: {
    log: (...args) => console.log('Eval:', ...args),
    error: (...args) => console.error('Eval Error:', ...args),
    warn: (...args) => console.warn('Eval Warning:', ...args)
  },
  Date
};

const code = `
// Simple logger with levels
class Logger {
  constructor(name) {
    this.name = name;
    this.level = 'info'; // default level
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }
  
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.level = level;
    }
  }
  
  format(level, message) {
    const time = new Date().toISOString().substring(11, 19);
    return \`[\${time}] [\${level.toUpperCase()}] [\${this.name}] \${message}\`;
  }
  
  debug(message) {
    if (this.levels.debug >= this.levels[this.level]) {
      console.log(this.format('debug', message));
    }
  }
  
  info(message) {
    if (this.levels.info >= this.levels[this.level]) {
      console.log(this.format('info', message));
    }
  }
  
  warn(message) {
    if (this.levels.warn >= this.levels[this.level]) {
      console.warn(this.format('warn', message));
    }
  }
  
  error(message) {
    if (this.levels.error >= this.levels[this.level]) {
      console.error(this.format('error', message));
    }
  }
}

// Create different loggers
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
{
  loggers: [
    { name: appLogger.name, level: appLogger.level },
    { name: userLogger.name, level: userLogger.level }
  ]
}
`;

console.log(await evaluate(globalObject, code));