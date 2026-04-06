import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { notesTools, handleNotesTool } from './notes.js';
import { remindersTools, handleRemindersTool } from './reminders.js';
import { safariTools, handleSafariTool } from './safari.js';
import { calendarTools, handleCalendarTool } from './calendar.js';
import { contactsTools, handleContactsTool } from './contacts.js';

const log = (...args: unknown[]) => console.error('[apple-mcp]', ...args);

// --- Module registry ---
// Each module exports a tools array and a handler function.
// To add a new module (e.g., Reminders, Calendar), import it and
// add its tools/handler here.

interface ToolModule {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  handle: (name: string, args: Record<string, unknown>) => {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  } | null;
}

const modules: ToolModule[] = [
  { tools: notesTools, handle: handleNotesTool },
  { tools: remindersTools, handle: handleRemindersTool },
  { tools: safariTools, handle: handleSafariTool },
  { tools: calendarTools, handle: handleCalendarTool },
  { tools: contactsTools, handle: handleContactsTool },
];

// --- MCP Server ---

const server = new Server(
  { name: 'apple-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: modules.flatMap(m => m.tools),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safeArgs = (args ?? {}) as Record<string, unknown>;

  for (const mod of modules) {
    const result = mod.handle(name, safeArgs);
    if (result !== null) {
      return result;
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// --- Start ---

async function main() {
  log('Starting server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Server ready — 28 tools registered (8 Notes + 6 Reminders + 4 Safari + 5 Calendar + 5 Contacts)');
}

main().catch((error) => {
  log('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
