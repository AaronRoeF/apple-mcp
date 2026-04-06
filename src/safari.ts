import { execSync } from 'child_process';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { openDB } from './utils/sqlite.js';
import { coreDataToISO, unixToCoreData } from './utils/dates.js';

const HISTORY_DB_PATH = '~/Library/Safari/History.db';
const BOOKMARKS_PLIST_PATH = '~/Library/Safari/Bookmarks.plist';

const log = (...args: unknown[]) => console.error('[apple-safari]', ...args);

/** Tool definitions for Safari */
export const safariTools = [
  {
    name: 'apple_safari_history',
    description: 'Get recent Safari browsing history. Returns URLs, titles, visit times.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 30)' },
        days: { type: 'number', description: 'How many days back to look (default 7)' },
      },
    },
  },
  {
    name: 'apple_safari_search_history',
    description: 'Search Safari browsing history by URL or page title keyword.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (matches URL, domain, and title)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'apple_safari_bookmarks',
    description: 'List Safari bookmarks. Optionally filter by folder name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: { type: 'string', description: 'Filter by folder name (optional)' },
      },
    },
  },
  {
    name: 'apple_safari_reading_list',
    description: 'Get all items from Safari Reading List.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

/** Handle a Safari tool call. Returns null if tool name not recognized. */
export function handleSafariTool(name: string, args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } | null {
  try {
    switch (name) {
      case 'apple_safari_history':
        return handleHistory(args);
      case 'apple_safari_search_history':
        return handleSearchHistory(args);
      case 'apple_safari_bookmarks':
        return handleBookmarks(args);
      case 'apple_safari_reading_list':
        return handleReadingList();
      default:
        return null;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('Error:', message);

    // Provide a helpful message for Full Disk Access issues
    if (message.includes('SQLITE_CANTOPEN') || message.includes('unable to open database') || message.includes('no such file')) {
      return {
        content: [{ type: 'text', text: `Error: Cannot open Safari History database. This may require Full Disk Access for the terminal app in System Settings > Privacy & Security > Full Disk Access. Original error: ${message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// --- Tool handlers ---

function handleHistory(args: Record<string, unknown>) {
  const limit = (args.limit as number) || 30;
  const days = (args.days as number) || 7;

  const cutoffUnix = Math.floor(Date.now() / 1000) - (days * 86400);
  const cutoffCoreData = unixToCoreData(cutoffUnix);

  const db = openDB(HISTORY_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        hi.url,
        hi.domain_expansion as domain,
        hi.visit_count,
        hv.title,
        hv.visit_time
      FROM history_visits hv
      JOIN history_items hi ON hv.history_item = hi.id
      WHERE hv.visit_time > ?
      ORDER BY hv.visit_time DESC
      LIMIT ?
    `).all(cutoffCoreData, limit) as HistoryRow[];

    return ok(rows.map(formatHistoryRow));
  } finally {
    db.close();
  }
}

function handleSearchHistory(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return err('Missing required parameter: query');

  const limit = (args.limit as number) || 20;
  const pattern = `%${query}%`;

  const db = openDB(HISTORY_DB_PATH);
  try {
    const rows = db.prepare(`
      SELECT
        hi.url,
        hi.domain_expansion as domain,
        hi.visit_count,
        hv.title,
        hv.visit_time
      FROM history_visits hv
      JOIN history_items hi ON hv.history_item = hi.id
      WHERE hi.url LIKE ?
        OR hi.domain_expansion LIKE ?
        OR hv.title LIKE ?
      ORDER BY hv.visit_time DESC
      LIMIT ?
    `).all(pattern, pattern, pattern, limit) as HistoryRow[];

    return ok(rows.map(formatHistoryRow));
  } finally {
    db.close();
  }
}

function handleBookmarks(args: Record<string, unknown>) {
  const folderFilter = args.folder as string | undefined;
  const plistPath = resolvePath(BOOKMARKS_PLIST_PATH);

  if (!existsSync(plistPath)) {
    return err('Safari Bookmarks.plist not found. Safari may not be installed or has no bookmarks.');
  }

  const json = execSync(`plutil -convert json -o - "${plistPath}"`, { encoding: 'utf-8' });
  const data = JSON.parse(json);

  const bookmarks: BookmarkEntry[] = [];
  flattenBookmarks(data, [], bookmarks);

  // Filter out Reading List items
  const filtered = bookmarks
    .filter(b => !b.folderPath.includes('com.apple.ReadingList'))
    .filter(b => !folderFilter || b.folderPath.some(f => f.toLowerCase().includes(folderFilter.toLowerCase())));

  return ok(filtered.map(b => ({
    title: b.title,
    url: b.url,
    folder: b.folderPath.filter(f => f !== 'BookmarksBar' && f !== 'BookmarksMenu' || true).join(' > ') || '(root)',
  })));
}

function handleReadingList() {
  const plistPath = resolvePath(BOOKMARKS_PLIST_PATH);

  if (!existsSync(plistPath)) {
    return err('Safari Bookmarks.plist not found. Safari may not be installed or has no bookmarks.');
  }

  const json = execSync(`plutil -convert json -o - "${plistPath}"`, { encoding: 'utf-8' });
  const data = JSON.parse(json);

  // Find the Reading List folder
  const readingListFolder = findReadingListFolder(data);
  if (!readingListFolder) {
    return ok([]);
  }

  const items: Array<{ title: string; url: string }> = [];
  extractBookmarkItems(readingListFolder, items);

  return ok(items);
}

// --- Helpers ---

interface HistoryRow {
  url: string;
  domain: string | null;
  visit_count: number;
  title: string | null;
  visit_time: number;
}

function formatHistoryRow(row: HistoryRow) {
  return {
    url: row.url,
    domain: row.domain || '',
    title: row.title || '',
    visit_count: row.visit_count,
    visited_at: coreDataToISO(row.visit_time),
  };
}

interface BookmarkEntry {
  title: string;
  url: string;
  folderPath: string[];
}

interface PlistNode {
  WebBookmarkType?: string;
  Title?: string;
  Children?: PlistNode[];
  URLString?: string;
  URIDictionary?: { title?: string };
  ReadingList?: Record<string, unknown>;
}

function flattenBookmarks(node: PlistNode, path: string[], out: BookmarkEntry[]) {
  if (node.WebBookmarkType === 'WebBookmarkTypeLeaf' && node.URLString) {
    out.push({
      title: node.URIDictionary?.title || node.URLString,
      url: node.URLString,
      folderPath: [...path],
    });
    return;
  }

  if (node.Children) {
    const folderName = node.Title || '';
    const newPath = folderName ? [...path, folderName] : path;
    for (const child of node.Children) {
      flattenBookmarks(child, newPath, out);
    }
  }
}

function findReadingListFolder(node: PlistNode): PlistNode | null {
  if (node.Title === 'com.apple.ReadingList') {
    return node;
  }
  if (node.Children) {
    for (const child of node.Children) {
      const found = findReadingListFolder(child);
      if (found) return found;
    }
  }
  return null;
}

function extractBookmarkItems(node: PlistNode, out: Array<{ title: string; url: string }>) {
  if (node.WebBookmarkType === 'WebBookmarkTypeLeaf' && node.URLString) {
    out.push({
      title: node.URIDictionary?.title || node.URLString,
      url: node.URLString,
    });
    return;
  }
  if (node.Children) {
    for (const child of node.Children) {
      extractBookmarkItems(child, out);
    }
  }
}

function resolvePath(path: string): string {
  return path.startsWith('~') ? path.replace('~', homedir()) : path;
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
