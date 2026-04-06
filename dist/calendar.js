import { openDB } from './utils/sqlite.js';
import { coreDataToISO, unixToCoreData } from './utils/dates.js';
import { existsSync } from 'fs';
import { homedir } from 'os';
const CALENDAR_DB_CANDIDATES = [
    '~/Library/Calendars/Calendar.sqlitedb',
    '~/Library/Group Containers/group.com.apple.CalendarAgent/Calendar.sqlitedb',
    '~/Library/Calendars/Calendar Cache',
];
const log = (...args) => console.error('[apple-calendar]', ...args);
function resolveCalendarDB() {
    for (const candidate of CALENDAR_DB_CANDIDATES) {
        const resolved = candidate.startsWith('~') ? candidate.replace('~', homedir()) : candidate;
        if (existsSync(resolved)) {
            return candidate; // Return the ~ form; openDB handles expansion
        }
    }
    throw new Error('Apple Calendar database not found. Checked:\n' +
        CALENDAR_DB_CANDIDATES.map(p => `  - ${p}`).join('\n') +
        '\n\nCalendar data may be stored in iCloud or the database path may differ on this macOS version.');
}
/** Tool definitions for Apple Calendar */
export const calendarTools = [
    {
        name: 'apple_calendar_today',
        description: "Get today's events across all calendars.",
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'apple_calendar_range',
        description: 'Get events in a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: { type: 'string', description: 'Start date (ISO 8601, e.g. 2025-03-01)' },
                end_date: { type: 'string', description: 'End date (ISO 8601, e.g. 2025-03-31)' },
            },
            required: ['start_date', 'end_date'],
        },
    },
    {
        name: 'apple_calendar_calendars',
        description: 'List all calendars.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'apple_calendar_search',
        description: 'Search events by title.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search keyword for event title' },
                limit: { type: 'number', description: 'Max results (default 20)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'apple_calendar_upcoming',
        description: 'Get next N upcoming events from now.',
        inputSchema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of upcoming events (default 10)' },
            },
        },
    },
];
/** Handle a Calendar tool call. Returns null if tool name not recognized. */
export function handleCalendarTool(name, args) {
    try {
        switch (name) {
            case 'apple_calendar_today':
                return handleToday();
            case 'apple_calendar_range':
                return handleRange(args);
            case 'apple_calendar_calendars':
                return handleCalendars();
            case 'apple_calendar_search':
                return handleSearch(args);
            case 'apple_calendar_upcoming':
                return handleUpcoming(args);
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
function handleToday() {
    const dbPath = resolveCalendarDB();
    const db = openDB(dbPath);
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const startCD = unixToCoreData(startOfDay.getTime() / 1000);
        const endCD = unixToCoreData(endOfDay.getTime() / 1000);
        const rows = db.prepare(`
      SELECT
        ci.Z_PK as id,
        ci.ZTITLE as title,
        ci.ZLOCATION as location,
        ci.ZSTARTDATE as start_date,
        ci.ZENDDATE as end_date,
        ci.ZNOTES as notes,
        c.ZTITLE as calendar_name
      FROM ZCALENDARITEM ci
      LEFT JOIN ZCALENDAR c ON ci.ZCALENDAR = c.Z_PK
      WHERE ci.ZSTARTDATE >= ? AND ci.ZSTARTDATE < ?
      ORDER BY ci.ZSTARTDATE ASC
    `).all(startCD, endCD);
        return ok(rows.map(formatEvent));
    }
    finally {
        db.close();
    }
}
function handleRange(args) {
    const startDate = args.start_date;
    const endDate = args.end_date;
    if (!startDate)
        return err('Missing required parameter: start_date');
    if (!endDate)
        return err('Missing required parameter: end_date');
    const startUnix = new Date(startDate).getTime() / 1000;
    const endUnix = new Date(endDate).getTime() / 1000;
    if (isNaN(startUnix))
        return err('Invalid start_date — use ISO 8601 format (e.g. 2025-03-01)');
    if (isNaN(endUnix))
        return err('Invalid end_date — use ISO 8601 format (e.g. 2025-03-31)');
    // Add a day to end_date to make it inclusive
    const endUnixInclusive = endUnix + 86400;
    const startCD = unixToCoreData(startUnix);
    const endCD = unixToCoreData(endUnixInclusive);
    const dbPath = resolveCalendarDB();
    const db = openDB(dbPath);
    try {
        const rows = db.prepare(`
      SELECT
        ci.Z_PK as id,
        ci.ZTITLE as title,
        ci.ZLOCATION as location,
        ci.ZSTARTDATE as start_date,
        ci.ZENDDATE as end_date,
        ci.ZNOTES as notes,
        c.ZTITLE as calendar_name
      FROM ZCALENDARITEM ci
      LEFT JOIN ZCALENDAR c ON ci.ZCALENDAR = c.Z_PK
      WHERE ci.ZSTARTDATE >= ? AND ci.ZSTARTDATE < ?
      ORDER BY ci.ZSTARTDATE ASC
    `).all(startCD, endCD);
        return ok(rows.map(formatEvent));
    }
    finally {
        db.close();
    }
}
function handleCalendars() {
    const dbPath = resolveCalendarDB();
    const db = openDB(dbPath);
    try {
        const rows = db.prepare(`
      SELECT
        Z_PK as id,
        ZTITLE as name,
        ZCOLOR as color
      FROM ZCALENDAR
      WHERE ZTITLE IS NOT NULL
      ORDER BY ZTITLE ASC
    `).all();
        return ok(rows);
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
    const dbPath = resolveCalendarDB();
    const db = openDB(dbPath);
    try {
        const rows = db.prepare(`
      SELECT
        ci.Z_PK as id,
        ci.ZTITLE as title,
        ci.ZLOCATION as location,
        ci.ZSTARTDATE as start_date,
        ci.ZENDDATE as end_date,
        ci.ZNOTES as notes,
        c.ZTITLE as calendar_name
      FROM ZCALENDARITEM ci
      LEFT JOIN ZCALENDAR c ON ci.ZCALENDAR = c.Z_PK
      WHERE ci.ZTITLE LIKE ?
      ORDER BY ci.ZSTARTDATE DESC
      LIMIT ?
    `).all(pattern, limit);
        return ok(rows.map(formatEvent));
    }
    finally {
        db.close();
    }
}
function handleUpcoming(args) {
    const count = args.count || 10;
    const nowCD = unixToCoreData(Date.now() / 1000);
    const dbPath = resolveCalendarDB();
    const db = openDB(dbPath);
    try {
        const rows = db.prepare(`
      SELECT
        ci.Z_PK as id,
        ci.ZTITLE as title,
        ci.ZLOCATION as location,
        ci.ZSTARTDATE as start_date,
        ci.ZENDDATE as end_date,
        ci.ZNOTES as notes,
        c.ZTITLE as calendar_name
      FROM ZCALENDARITEM ci
      LEFT JOIN ZCALENDAR c ON ci.ZCALENDAR = c.Z_PK
      WHERE ci.ZSTARTDATE >= ?
      ORDER BY ci.ZSTARTDATE ASC
      LIMIT ?
    `).all(nowCD, count);
        return ok(rows.map(formatEvent));
    }
    finally {
        db.close();
    }
}
function formatEvent(row) {
    return {
        id: row.id,
        title: row.title || '(untitled)',
        location: row.location || null,
        start: row.start_date != null ? coreDataToISO(row.start_date) : null,
        end: row.end_date != null ? coreDataToISO(row.end_date) : null,
        notes: row.notes || null,
        calendar: row.calendar_name || '(unknown)',
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
//# sourceMappingURL=calendar.js.map