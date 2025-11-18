// Type declarations for Node.js built-in modules

declare module 'fs/promises' {
  export * from 'fs';
  export const readFile: any;
  export const writeFile: any;
  export const mkdir: any;
  export const readdir: any;
  export const stat: any;
  export const access: any;
  export const unlink: any;
  export const rm: any;
}

declare module 'path' {
  export const join: (...paths: string[]) => string;
  export const resolve: (...paths: string[]) => string;
  export const dirname: (path: string) => string;
  export const basename: (path: string, ext?: string) => string;
  export const extname: (path: string) => string;
  export const relative: (from: string, to: string) => string;
  export const normalize: (path: string) => string;
  export const isAbsolute: (path: string) => boolean;
  export const sep: string;
  export const delimiter: string;
}

declare module 'crypto' {
  export function createHash(algorithm: string): any;
  export function randomBytes(size: number): Buffer;
  export function randomUUID(): string;
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean;
}

declare module 'child_process' {
  export interface ExecOptions {
    cwd?: string;
    env?: any;
    encoding?: string;
    shell?: string;
    timeout?: number;
    maxBuffer?: number;
    killSignal?: string;
    stdio?: string | any[];
  }

  export function spawn(command: string, args?: string[], options?: any): any;
  export function exec(command: string, options?: ExecOptions, callback?: (error: any, stdout: any, stderr: any) => void): any;
  export function exec(command: string, callback?: (error: any, stdout: any, stderr: any) => void): any;
  export function execSync(command: string, options?: ExecOptions): any;
  export function execFile(file: string, args?: string[], options?: any, callback?: (error: any, stdout: any, stderr: any) => void): any;
}

declare module 'http' {
  export interface Server {
    on(event: string, listener: (...args: any[]) => void): this;
    listen(port: number, callback?: () => void): this;
    close(callback?: () => void): void;
  }
  export function createServer(requestListener?: (req: any, res: any) => void): Server;
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: any;
    socket: any;
  }
  export interface ServerResponse {
    writeHead(statusCode: number, headers?: any): void;
    end(data?: any): void;
    write(data: any): void;
  }
}

declare namespace http {
  export interface Server {
    on(event: string, listener: (...args: any[]) => void): this;
    listen(port: number, callback?: () => void): this;
    close(callback?: () => void): void;
  }
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: any;
    socket: any;
  }
  export interface ServerResponse {
    writeHead(statusCode: number, headers?: any): void;
    end(data?: any): void;
    write(data: any): void;
  }
}

declare module 'https' {
  export function request(options: any, callback?: (res: any) => void): any;
  export function get(url: string, callback?: (res: any) => void): any;
}

declare module 'util' {
  export function promisify<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<any>;

  // Special promisify signature for exec
  export function promisify(fn: typeof import('child_process').exec): (command: string, options?: import('child_process').ExecOptions) => Promise<{ stdout: string; stderr: string }>;
}

declare module 'readline' {
  export function createInterface(options: any): any;
}

declare module 'url' {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
}

declare module 'os' {
  export function tmpdir(): string;
  export function homedir(): string;
  export function platform(): string;
  export function type(): string;
  export function arch(): string;
}

declare module 'node:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
  export const mock: any;
}

declare module 'node:assert' {
  export function strictEqual<T>(actual: T, expected: T, message?: string): void;
  export function deepStrictEqual<T>(actual: T, expected: T, message?: string): void;
  export function ok(value: any, message?: string): void;
  export function equal<T>(actual: T, expected: T, message?: string): void;
  export function notEqual<T>(actual: T, expected: T, message?: string): void;
  export function throws(fn: () => void, error?: any, message?: string): void;
  export function rejects(fn: () => Promise<void>, error?: any, message?: string): Promise<void>;
}

declare module 'node:fs' {
  export * from 'fs/promises';
}

declare module 'node:path' {
  export * from 'path';
}

declare module 'node:url' {
  export * from 'url';
}

declare module 'node:os' {
  export * from 'os';
}

declare module 'node:crypto' {
  export * from 'crypto';
}

declare module 'node:child_process' {
  export * from 'child_process';
}

declare module 'events' {
  export class EventEmitter {
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
    removeAllListeners(event?: string | symbol): this;
    listeners(event: string | symbol): Function[];
    eventNames(): Array<string | symbol>;
  }
  export default EventEmitter;
}

declare module 'node:events' {
  export * from 'events';
}

declare module 'fs' {
  export const existsSync: (path: string) => boolean;
  export const readFileSync: (path: string, encoding?: string) => string | Buffer;
  export const writeFileSync: (path: string, data: string | Buffer, options?: any) => void;
  export const readdirSync: (path: string) => string[];
  export const statSync: (path: string) => any;
  export const mkdirSync: (path: string, options?: any) => void;
}

declare module 'node:fs' {
  export * from 'fs';
}
