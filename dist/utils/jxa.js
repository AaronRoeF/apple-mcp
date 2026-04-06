import { execSync } from 'child_process';
const DEFAULT_TIMEOUT = 30_000; // 30 seconds
/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 * Returns stdout as a string.
 * All logging goes to stderr — stdout is reserved for MCP protocol.
 */
export function runJXA(script, timeout = DEFAULT_TIMEOUT) {
    try {
        const result = execSync(`osascript -l JavaScript -e ${escapeShellArg(script)}`, {
            timeout,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return result.trim();
    }
    catch (error) {
        const err = error;
        const stderr = err.stderr?.toString().trim() || '';
        const message = stderr || err.message || 'Unknown JXA error';
        throw new Error(`JXA execution failed: ${message}`);
    }
}
/**
 * Escape a string for safe use as a single shell argument.
 */
function escapeShellArg(arg) {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
}
//# sourceMappingURL=jxa.js.map