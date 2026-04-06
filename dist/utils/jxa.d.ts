/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 * Returns stdout as a string.
 * All logging goes to stderr — stdout is reserved for MCP protocol.
 */
export declare function runJXA(script: string, timeout?: number): string;
