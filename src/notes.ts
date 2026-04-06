import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { openDB } from './utils/sqlite.js';
import { coreDataToISO } from './utils/dates.js';
import { runJXA } from './utils/jxa.js';

const NOTES_DB_PATH = '~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite';

const log = (...args: unknown[]) => console.error('[apple-notes]', ...args);

/** Tool definitions for Apple Notes */
export const notesTools = [
  {
    name: 'apple_notes_list',
    description: 'List notes with title, snippet, folder name, and dates. Returns a paginated JSON array.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max notes to return (default 20)' },
        offset: { type: 'number', description: 'Number of notes to skip (default 0)' },
      },
    },
  },
  {
    name: 'apple_notes_search',
    description: 'Search notes by keyword in title and snippet text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'apple_notes_get',
    description: 'Get the full plaintext body of a note by its exact title. Uses JXA to read from Apple Notes app.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Exact title of the note' },
      },
      required: ['title'],
    },
  },
  {
    name: 'apple_notes_folders',
    description: 'List all Apple Notes folders with note counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'apple_notes_recent',
    description: 'Get the N most recently modified notes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: { type: 'number', description: 'Number of recent notes (default 10)' },
      },
    },
  },
  {
    name: 'apple_notes_by_folder',
    description: 'Get all notes in a specific folder by folder name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: { type: 'string', description: 'Folder name' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['folder'],
    },
  },
  {
    name: 'apple_notes_create',
    description: 'Create a new note in Apple Notes. Uses JXA.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Note title' },
        body: { type: 'string', description: 'Note body text' },
        folder: { type: 'string', description: 'Target folder name (default "Notes")' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'apple_notes_stats',
    description: 'Get aggregate statistics: total notes, notes per folder, date range.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

/** Handle a Notes tool call. Returns null if tool name not recognized. */
export function handleNotesTool(name: string, args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } | null {
  try {
    switch (name) {
      case 'apple_notes_list':
        return handleList(args);
      case 'apple_notes_search':
        return handleSearch(args);
      case 'apple_notes_get':
        return handleGet(args);
      case 'apple_notes_folders':
        return handleFolders();
      case 'apple_notes_recent':
        return handleRecent(args);
      case 'apple_notes_by_folder':
        return handleByFolder(args);
      case 'apple_notes_create':
        return handleCreate(args);
      case 'apple_notes_stats':
        return handleStats();
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

function handleList(args: Record<string, unknown>) {
  const limit = (args.limit as number) || 20;
  const offset = (args.offset as number) || 0;

  const db = openDB(NOTES_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        n.Z_PK as id,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZMODIFICATIONDATE1 as modified,
        n.ZCREATIONDATE3 as created,
        f.ZTITLE2 as folder
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      WHERE n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
      ORDER BY n.ZMODIFICATIONDATE1 DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as NoteRow[];

    return ok(rows.map(formatNote));
  } finally {
    db.close();
  }
}

function handleSearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return err('Missing required parameter: query');

  const limit = (args.limit as number) || 20;
  const pattern = `%${query}%`;

  const db = openDB(NOTES_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        n.Z_PK as id,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZMODIFICATIONDATE1 as modified,
        n.ZCREATIONDATE3 as created,
        f.ZTITLE2 as folder
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      WHERE n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
        AND (n.ZTITLE1 LIKE ? OR n.ZSNIPPET LIKE ?)
      ORDER BY n.ZMODIFICATIONDATE1 DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as NoteRow[];

    return ok(rows.map(formatNote));
  } finally {
    db.close();
  }
}

function handleGet(args: Record<string, unknown>) {
  const title = args.title as string;
  if (!title) return err('Missing required parameter: title');

  // Escape the title for JXA string literal
  const escapedTitle = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

  const script = `
    var app = Application('Notes');
    var matches = app.notes.whose({name: '${escapedTitle}'});
    if (matches.length === 0) {
      JSON.stringify({error: 'No note found with that title'});
    } else {
      var note = matches[0];
      JSON.stringify({
        title: note.name(),
        body: note.plaintext(),
        folder: note.container().name(),
        creationDate: note.creationDate().toISOString(),
        modificationDate: note.modificationDate().toISOString()
      });
    }
  `;

  const result = runJXA(script);
  const parsed = JSON.parse(result);

  if (parsed.error) {
    return err(parsed.error);
  }

  return ok(parsed);
}

function handleFolders() {
  const db = openDB(NOTES_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        f.Z_PK as id,
        f.ZTITLE2 as name,
        COUNT(n.Z_PK) as note_count
      FROM ZICCLOUDSYNCINGOBJECT f
      LEFT JOIN ZICCLOUDSYNCINGOBJECT n
        ON n.ZFOLDER = f.Z_PK
        AND n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
      WHERE f.ZTITLE2 IS NOT NULL
      GROUP BY f.Z_PK, f.ZTITLE2
      ORDER BY note_count DESC
    `).all() as Array<{ id: number; name: string; note_count: number }>;

    return ok(rows);
  } finally {
    db.close();
  }
}

function handleRecent(args: Record<string, unknown>) {
  const count = (args.count as number) || 10;

  const db = openDB(NOTES_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        n.Z_PK as id,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZMODIFICATIONDATE1 as modified,
        n.ZCREATIONDATE3 as created,
        f.ZTITLE2 as folder
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      WHERE n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
      ORDER BY n.ZMODIFICATIONDATE1 DESC
      LIMIT ?
    `).all(count) as NoteRow[];

    return ok(rows.map(formatNote));
  } finally {
    db.close();
  }
}

function handleByFolder(args: Record<string, unknown>) {
  const folder = args.folder as string;
  if (!folder) return err('Missing required parameter: folder');

  const limit = (args.limit as number) || 50;

  const db = openDB(NOTES_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        n.Z_PK as id,
        n.ZTITLE1 as title,
        n.ZSNIPPET as snippet,
        n.ZMODIFICATIONDATE1 as modified,
        n.ZCREATIONDATE3 as created,
        f.ZTITLE2 as folder
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      WHERE n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
        AND f.ZTITLE2 = ?
      ORDER BY n.ZMODIFICATIONDATE1 DESC
      LIMIT ?
    `).all(folder, limit) as NoteRow[];

    return ok(rows.map(formatNote));
  } finally {
    db.close();
  }
}

function handleCreate(args: Record<string, unknown>) {
  const title = args.title as string;
  const body = args.body as string;
  const folder = (args.folder as string) || 'Notes';

  if (!title) return err('Missing required parameter: title');
  if (!body) return err('Missing required parameter: body');

  const escapeForJXA = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const escapedTitle = escapeForJXA(title);
  const escapedBody = escapeForJXA(body);
  const escapedFolder = escapeForJXA(folder);

  const script = `
    var app = Application('Notes');
    var targetFolder = null;
    var folders = app.folders();
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].name() === '${escapedFolder}') {
        targetFolder = folders[i];
        break;
      }
    }
    if (!targetFolder) {
      JSON.stringify({error: 'Folder not found: ${escapedFolder}'});
    } else {
      var note = app.Note({name: '${escapedTitle}', body: '${escapedBody}'});
      targetFolder.notes.push(note);
      JSON.stringify({
        success: true,
        title: '${escapedTitle}',
        folder: '${escapedFolder}'
      });
    }
  `;

  const result = runJXA(script);
  const parsed = JSON.parse(result);

  if (parsed.error) {
    return err(parsed.error);
  }

  return ok(parsed);
}

function handleStats() {
  const db = openDB(NOTES_DB_PATH);
  try {
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM ZICCLOUDSYNCINGOBJECT
      WHERE ZTITLE1 IS NOT NULL
        AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION != 1)
    `).get() as { total: number };

    const folderRows = db.prepare(`
      SELECT
        f.ZTITLE2 as folder,
        COUNT(n.Z_PK) as count
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      WHERE n.ZTITLE1 IS NOT NULL
        AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
      GROUP BY f.ZTITLE2
      ORDER BY count DESC
    `).all() as Array<{ folder: string | null; count: number }>;

    const dateRange = db.prepare(`
      SELECT
        MIN(ZCREATIONDATE3) as earliest,
        MAX(ZMODIFICATIONDATE1) as latest
      FROM ZICCLOUDSYNCINGOBJECT
      WHERE ZTITLE1 IS NOT NULL
        AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION != 1)
    `).get() as { earliest: number | null; latest: number | null };

    return ok({
      total_notes: totalRow.total,
      notes_per_folder: folderRows.map(r => ({
        folder: r.folder || '(unknown)',
        count: r.count,
      })),
      date_range: {
        earliest_created: dateRange.earliest != null ? coreDataToISO(dateRange.earliest) : null,
        latest_modified: dateRange.latest != null ? coreDataToISO(dateRange.latest) : null,
      },
    });
  } finally {
    db.close();
  }
}

// --- Helpers ---

interface NoteRow {
  id: number;
  title: string | null;
  snippet: string | null;
  modified: number | null;
  created: number | null;
  folder: string | null;
}

function formatNote(row: NoteRow) {
  return {
    id: row.id,
    title: row.title || '(untitled)',
    snippet: row.snippet || '',
    folder: row.folder || '(unknown)',
    modified: row.modified != null ? coreDataToISO(row.modified) : null,
    created: row.created != null ? coreDataToISO(row.created) : null,
  };
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
