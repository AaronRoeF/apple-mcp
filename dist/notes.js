import { openDB } from './utils/sqlite.js';
import { coreDataToISO } from './utils/dates.js';
import { runJXA } from './utils/jxa.js';
const NOTES_DB_PATH = '~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite';
const log = (...args) => console.error('[apple-notes]', ...args);
/** Tool definitions for Apple Notes */
export const notesTools = [
    {
        name: 'apple_notes_list',
        description: 'List notes with title, snippet, folder name, and dates. Returns a paginated JSON array.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'apple_notes_recent',
        description: 'Get the N most recently modified notes.',
        inputSchema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of recent notes (default 10)' },
            },
        },
    },
    {
        name: 'apple_notes_by_folder',
        description: 'Get all notes in a specific folder by folder name.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
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
            type: 'object',
            properties: {},
        },
    },
];
/** Handle a Notes tool call. Returns null if tool name not recognized. */
export function handleNotesTool(name, args) {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('Error:', message);
        return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            isError: true,
        };
    }
}
// --- Tool handlers ---
function handleList(args) {
    const limit = args.limit || 20;
    const offset = args.offset || 0;
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
    `).all(limit, offset);
        return ok(rows.map(formatNote));
    }
    finally {
        db.close();
    }
}
function handleSearch(args) {
    const query = args.query;
    if (!query)
        return err('Missing required parameter: query');
    const limit = args.limit || 20;
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
    `).all(pattern, pattern, limit);
        return ok(rows.map(formatNote));
    }
    finally {
        db.close();
    }
}
function handleGet(args) {
    const title = args.title;
    if (!title)
        return err('Missing required parameter: title');
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
    `).all();
        return ok(rows);
    }
    finally {
        db.close();
    }
}
function handleRecent(args) {
    const count = args.count || 10;
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
    `).all(count);
        return ok(rows.map(formatNote));
    }
    finally {
        db.close();
    }
}
function handleByFolder(args) {
    const folder = args.folder;
    if (!folder)
        return err('Missing required parameter: folder');
    const limit = args.limit || 50;
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
    `).all(folder, limit);
        return ok(rows.map(formatNote));
    }
    finally {
        db.close();
    }
}
function handleCreate(args) {
    const title = args.title;
    const body = args.body;
    const folder = args.folder || 'Notes';
    if (!title)
        return err('Missing required parameter: title');
    if (!body)
        return err('Missing required parameter: body');
    const escapeForJXA = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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
    `).get();
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
    `).all();
        const dateRange = db.prepare(`
      SELECT
        MIN(ZCREATIONDATE3) as earliest,
        MAX(ZMODIFICATIONDATE1) as latest
      FROM ZICCLOUDSYNCINGOBJECT
      WHERE ZTITLE1 IS NOT NULL
        AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION != 1)
    `).get();
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
    }
    finally {
        db.close();
    }
}
function formatNote(row) {
    return {
        id: row.id,
        title: row.title || '(untitled)',
        snippet: row.snippet || '',
        folder: row.folder || '(unknown)',
        modified: row.modified != null ? coreDataToISO(row.modified) : null,
        created: row.created != null ? coreDataToISO(row.created) : null,
    };
}
function ok(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}
function err(message) {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}
//# sourceMappingURL=notes.js.map