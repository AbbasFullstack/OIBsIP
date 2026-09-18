// Minimal level-prefixed logger. Keeps output consistent across modules and
// makes it easy to swap in a real logger later without touching call sites.
const ts = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[${ts()}] [info]`, ...args),
  warn: (...args) => console.warn(`[${ts()}] [warn]`, ...args),
  error: (...args) => console.error(`[${ts()}] [error]`, ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${ts()}] [debug]`, ...args);
    }
  },
};

export default logger;