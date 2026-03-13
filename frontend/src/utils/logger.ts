const isDev = import.meta.env.DEV;

interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;
  return {
    log: (...args: unknown[]) => { if (isDev) console.log(prefix, ...args); },
    warn: (...args: unknown[]) => { if (isDev) console.warn(prefix, ...args); },
    // error() always logs — errors should be visible in production for debugging
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
