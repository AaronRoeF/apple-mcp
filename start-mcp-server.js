#!/usr/bin/env node

// All logging goes to stderr — stdout is reserved for MCP protocol
const log = (...args) => console.error(...args);

log('[apple-mcp] Starting...');

import('./dist/index.js').catch((error) => {
  log('[apple-mcp] Fatal:', error.message);
  process.exit(1);
});
