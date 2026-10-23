// Test setup for Node 20: supabase-js needs a global WebSocket (native only from Node 22) and a URL/key at import time.
// Import this FIRST in node:test files that pull in modules which create the Supabase client. No network is used.
const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === "undefined") {
  g.WebSocket = class WebSocketStub {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    readyState = 3; onopen = null; onclose = null; onerror = null; onmessage = null;
    constructor(public url: string) {}
    send() {} close() {} addEventListener() {} removeEventListener() {}
  };
}
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
export {};
