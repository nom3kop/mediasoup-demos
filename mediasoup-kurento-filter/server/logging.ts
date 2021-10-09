import Debug from "debug";


const APP_NAME = "MediaServer";
const logLevels = ['error', 'warn', 'info', 'log', 'trace'] as const; // Order matters. Highest to lowest.
type LOG_LEVELS = typeof logLevels[number];
const currentLogLevel: LOG_LEVELS = 'info';

const createDebugger = (logLevel: LOG_LEVELS) => {
  const currentLogPriority = logLevels.indexOf(currentLogLevel);
  const logLevelPriority = logLevels.indexOf(logLevel);
  const namespace = APP_NAME + ":" + logLevel;
  const _debugger = Debug(namespace);
  
  if (logLevelPriority <= currentLogPriority) {
    _debugger.enabled = true;  // Enable all log levels below the highest one.
  }

  _debugger.log = (...args) => {
    if (currentLogPriority <= logLevelPriority) {
      Debug.log(...args);
    }
  };

  return _debugger; // Attach new method to the log Function.
}

export const log: Record<LOG_LEVELS, Debug.Debugger> = { // Debugger for each log level
  'error': createDebugger('error'),
  'warn': createDebugger('warn'),
  'info': createDebugger('info'),
  'log':  createDebugger('log'),
  'trace': createDebugger('trace'),
} 

