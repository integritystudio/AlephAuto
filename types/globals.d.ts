// Global type declarations for Node.js
/// <reference types="node" />

declare global {
  const process: NodeJS.Process;
  const Buffer: BufferConstructor;
  const __dirname: string;
  const __filename: string;

  // Extended Error interface for Node.js errors
  interface Error {
    code?: string | number;
    stdout?: string;
    stderr?: string;
    errno?: number;
    syscall?: string;
    path?: string;
  }

  // EventEmitter for extending classes
  class EventEmitter {
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
    removeAllListeners(event?: string | symbol): this;
    listeners(event: string | symbol): Function[];
    eventNames(): Array<string | symbol>;
  }
}

export {};
