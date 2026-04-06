import { runJXA } from './utils/jxa.js';

const log = (...args: unknown[]) => console.error('[apple-reminders]', ...args);

/** Tool definitions for Apple Reminders */
export const remindersTools = [
  {
    name: 'apple_reminders_lists',
    description: 'List all reminder lists with reminder counts. Returns a JSON array of {name, count}.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'apple_reminders_list',
    description: 'Get all reminders in a specific list. Returns name, completed, due date, priority, and notes for each.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        list_name: { type: 'string', description: 'Name of the reminder list' },
        include_completed: { type: 'boolean', description: 'Include completed reminders (default false)' },
      },
      required: ['list_name'],
    },
  },
  {
    name: 'apple_reminders_due',
    description: 'Get reminders due today, this week, or overdue. Only returns incomplete reminders.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        range: { type: 'string', description: 'Date range: "today", "week", or "overdue" (default "today")' },
      },
    },
  },
  {
    name: 'apple_reminders_search',
    description: 'Search reminders by keyword across all lists (case-insensitive name match).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        include_completed: { type: 'boolean', description: 'Include completed reminders (default false)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'apple_reminders_create',
    description: 'Create a new reminder in Apple Reminders.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Reminder name/title' },
        list_name: { type: 'string', description: 'Target list name (default: first list)' },
        due_date: { type: 'string', description: 'Due date as ISO 8601 string (optional)' },
        priority: { type: 'string', description: 'Priority: "high", "medium", "low", or "none" (default "none")' },
        body: { type: 'string', description: 'Notes/body text (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'apple_reminders_complete',
    description: 'Mark a reminder as complete by name. Optionally narrow search to a specific list.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Reminder name to mark complete' },
        list_name: { type: 'string', description: 'List name to narrow search (optional)' },
      },
      required: ['name'],
    },
  },
];

/** Handle a Reminders tool call. Returns null if tool name not recognized. */
export function handleRemindersTool(name: string, args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } | null {
  try {
    switch (name) {
      case 'apple_reminders_lists':
        return handleLists();
      case 'apple_reminders_list':
        return handleList(args);
      case 'apple_reminders_due':
        return handleDue(args);
      case 'apple_reminders_search':
        return handleSearch(args);
      case 'apple_reminders_create':
        return handleCreate(args);
      case 'apple_reminders_complete':
        return handleComplete(args);
      default:
        return null;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('Error:', message);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// --- Tool handlers ---

function handleLists() {
  const script = `
    var app = Application('Reminders');
    var lists = app.lists();
    var result = [];
    for (var i = 0; i < lists.length; i++) {
      result.push({
        name: lists[i].name(),
        count: lists[i].reminders.length
      });
    }
    JSON.stringify(result);
  `;

  const result = runJXA(script);
  return ok(JSON.parse(result));
}

function handleList(args: Record<string, unknown>) {
  const listName = args.list_name as string;
  if (!listName) return err('Missing required parameter: list_name');

  const includeCompleted = (args.include_completed as boolean) || false;
  const escapedName = escapeForJXA(listName);

  const script = `
    var app = Application('Reminders');
    var lists = app.lists.whose({name: '${escapedName}'});
    if (lists.length === 0) {
      JSON.stringify({error: 'List not found: ${escapedName}'});
    } else {
      var list = lists[0];
      var reminders = list.reminders();
      var result = [];
      for (var i = 0; i < reminders.length; i++) {
        var r = reminders[i];
        var isCompleted = r.completed();
        if (!${includeCompleted} && isCompleted) continue;
        var dueDate = r.dueDate();
        var pri = r.priority();
        var priLabel = pri === 1 ? 'high' : pri === 5 ? 'medium' : pri === 9 ? 'low' : 'none';
        result.push({
          name: r.name(),
          completed: isCompleted,
          due_date: dueDate ? dueDate.toISOString() : null,
          priority: priLabel,
          body: r.body() || null
        });
      }
      JSON.stringify(result);
    }
  `;

  const result = runJXA(script);
  const parsed = JSON.parse(result);
  if (parsed.error) return err(parsed.error);
  return ok(parsed);
}

function handleDue(args: Record<string, unknown>) {
  const range = (args.range as string) || 'today';

  if (!['today', 'week', 'overdue'].includes(range)) {
    return err('Invalid range. Must be "today", "week", or "overdue".');
  }

  const script = `
    var app = Application('Reminders');
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    var weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    var range = '${range}';

    var result = [];
    var lists = app.lists();
    for (var li = 0; li < lists.length; li++) {
      var reminders = lists[li].reminders();
      for (var ri = 0; ri < reminders.length; ri++) {
        var r = reminders[ri];
        if (r.completed()) continue;
        var dueDate = r.dueDate();
        if (!dueDate) continue;

        var include = false;
        if (range === 'today') {
          include = (dueDate >= todayStart && dueDate <= todayEnd);
        } else if (range === 'week') {
          include = (dueDate >= todayStart && dueDate < weekEnd);
        } else if (range === 'overdue') {
          include = (dueDate < todayStart);
        }

        if (include) {
          var pri = r.priority();
          var priLabel = pri === 1 ? 'high' : pri === 5 ? 'medium' : pri === 9 ? 'low' : 'none';
          result.push({
            name: r.name(),
            list: lists[li].name(),
            due_date: dueDate.toISOString(),
            priority: priLabel,
            body: r.body() || null
          });
        }
      }
    }
    JSON.stringify(result);
  `;

  const result = runJXA(script);
  return ok(JSON.parse(result));
}

function handleSearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return err('Missing required parameter: query');

  const includeCompleted = (args.include_completed as boolean) || false;
  const escapedQuery = escapeForJXA(query);

  const script = `
    var app = Application('Reminders');
    var query = '${escapedQuery}'.toLowerCase();
    var result = [];
    var lists = app.lists();
    for (var li = 0; li < lists.length; li++) {
      var reminders = lists[li].reminders();
      for (var ri = 0; ri < reminders.length; ri++) {
        var r = reminders[ri];
        var isCompleted = r.completed();
        if (!${includeCompleted} && isCompleted) continue;
        var name = r.name();
        if (name && name.toLowerCase().indexOf(query) !== -1) {
          var dueDate = r.dueDate();
          var pri = r.priority();
          var priLabel = pri === 1 ? 'high' : pri === 5 ? 'medium' : pri === 9 ? 'low' : 'none';
          result.push({
            name: name,
            list: lists[li].name(),
            completed: isCompleted,
            due_date: dueDate ? dueDate.toISOString() : null,
            priority: priLabel,
            body: r.body() || null
          });
        }
      }
    }
    JSON.stringify(result);
  `;

  const result = runJXA(script);
  return ok(JSON.parse(result));
}

function handleCreate(args: Record<string, unknown>) {
  const name = args.name as string;
  if (!name) return err('Missing required parameter: name');

  const listName = args.list_name as string | undefined;
  const dueDate = args.due_date as string | undefined;
  const priority = (args.priority as string) || 'none';
  const body = args.body as string | undefined;

  const priorityMap: Record<string, number> = { high: 1, medium: 5, low: 9, none: 0 };
  const priorityNum = priorityMap[priority];
  if (priorityNum === undefined) {
    return err('Invalid priority. Must be "high", "medium", "low", or "none".');
  }

  const escapedName = escapeForJXA(name);
  const escapedListName = listName ? escapeForJXA(listName) : null;
  const escapedBody = body ? escapeForJXA(body) : null;

  const script = `
    var app = Application('Reminders');
    var targetList;
    ${escapedListName
      ? `var matchedLists = app.lists.whose({name: '${escapedListName}'});
         if (matchedLists.length === 0) {
           JSON.stringify({error: 'List not found: ${escapedListName}'});
         } else {
           targetList = matchedLists[0];
         }`
      : `targetList = app.defaultList();`
    }
    if (targetList) {
      var props = {name: '${escapedName}', priority: ${priorityNum}};
      ${escapedBody ? `props.body = '${escapedBody}';` : ''}
      var r = app.Reminder(props);
      targetList.reminders.push(r);
      ${dueDate ? `r.dueDate = new Date('${escapeForJXA(dueDate)}');` : ''}
      JSON.stringify({
        success: true,
        name: r.name(),
        list: targetList.name(),
        due_date: ${dueDate ? `r.dueDate().toISOString()` : 'null'},
        priority: '${priority}'
      });
    }
  `;

  const result = runJXA(script);
  const parsed = JSON.parse(result);
  if (parsed.error) return err(parsed.error);
  return ok(parsed);
}

function handleComplete(args: Record<string, unknown>) {
  const name = args.name as string;
  if (!name) return err('Missing required parameter: name');

  const listName = args.list_name as string | undefined;
  const escapedName = escapeForJXA(name);
  const escapedListName = listName ? escapeForJXA(listName) : null;

  const script = `
    var app = Application('Reminders');
    var found = false;
    var lists = app.lists();
    for (var li = 0; li < lists.length; li++) {
      ${escapedListName ? `if (lists[li].name() !== '${escapedListName}') continue;` : ''}
      var reminders = lists[li].reminders();
      for (var ri = 0; ri < reminders.length; ri++) {
        var r = reminders[ri];
        if (r.name() === '${escapedName}' && !r.completed()) {
          r.completed = true;
          found = true;
          JSON.stringify({
            success: true,
            name: r.name(),
            list: lists[li].name()
          });
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      JSON.stringify({error: 'Reminder not found: ${escapedName}'});
    }
  `;

  const result = runJXA(script);
  const parsed = JSON.parse(result);
  if (parsed.error) return err(parsed.error);
  return ok(parsed);
}

// --- Helpers ---

function escapeForJXA(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
