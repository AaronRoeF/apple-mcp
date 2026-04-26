import { openDB } from './utils/sqlite.js';
import { coreDataToISO } from './utils/dates.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ADDRESS_BOOK_DIR = `${homedir()}/Library/Application Support/AddressBook`;

const log = (...args: unknown[]) => console.error('[apple-contacts]', ...args);

/**
 * Find all populated Contacts SQLite databases. iCloud-synced contacts live under
 * `AddressBook/Sources/<UUID>/AddressBook-v22.abcddb` (one DB per source — iCloud,
 * CardDAV, Exchange, etc.), not the top-level `AddressBook-v22.abcddb` which is
 * the "On My Mac" store and is often empty for iCloud users.
 *
 * We return the largest .abcddb found anywhere in the AddressBook tree as a proxy
 * for "the populated DB." For users with multiple active sources this only covers
 * the largest; full multi-source support would require scanning all DBs and
 * unioning results.
 */
function resolveContactsDB(): string {
  if (!existsSync(ADDRESS_BOOK_DIR)) {
    throw new Error(
      `Apple Contacts directory not found at: ${ADDRESS_BOOK_DIR}\n` +
      'The path may differ on this macOS version.'
    );
  }

  const candidates: string[] = [];
  const topLevel = join(ADDRESS_BOOK_DIR, 'AddressBook-v22.abcddb');
  if (existsSync(topLevel)) candidates.push(topLevel);

  const sourcesDir = join(ADDRESS_BOOK_DIR, 'Sources');
  if (existsSync(sourcesDir)) {
    for (const entry of readdirSync(sourcesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(sourcesDir, entry.name, 'AddressBook-v22.abcddb');
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `No Apple Contacts databases found under: ${ADDRESS_BOOK_DIR}`
    );
  }

  let best: string | null = null;
  let bestSize = 0;
  for (const c of candidates) {
    try {
      const size = statSync(c).size;
      if (size > bestSize) {
        bestSize = size;
        best = c;
      }
    } catch (e) {
      log(`Skipping unreadable candidate ${c}:`, e instanceof Error ? e.message : String(e));
    }
  }

  if (!best) {
    throw new Error(`Found ${candidates.length} candidate DB(s) but none were readable.`);
  }

  log(`Using contacts DB: ${best} (${bestSize} bytes)`);
  return best;
}

/** Tool definitions for Apple Contacts */
export const contactsTools = [
  {
    name: 'apple_contacts_search',
    description: 'Search contacts by name, email, or company.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (matches name, email, or company)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'apple_contacts_get',
    description: 'Get full contact details by ID (Z_PK), including emails and phone numbers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'number', description: 'Contact ID (Z_PK)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'apple_contacts_recent',
    description: 'Get recently modified contacts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: { type: 'number', description: 'Number of recent contacts (default 20)' },
      },
    },
  },
  {
    name: 'apple_contacts_company',
    description: 'List contacts at a specific company.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        company: { type: 'string', description: 'Company/organization name' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['company'],
    },
  },
  {
    name: 'apple_contacts_stats',
    description: 'Contact count and top companies by contact count.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

/** Handle a Contacts tool call. Returns null if tool name not recognized. */
export function handleContactsTool(name: string, args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } | null {
  try {
    switch (name) {
      case 'apple_contacts_search':
        return handleSearch(args);
      case 'apple_contacts_get':
        return handleGet(args);
      case 'apple_contacts_recent':
        return handleRecent(args);
      case 'apple_contacts_company':
        return handleCompany(args);
      case 'apple_contacts_stats':
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

function handleSearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return err('Missing required parameter: query');

  const limit = (args.limit as number) || 20;
  const pattern = `%${query}%`;

  const dbPath = resolveContactsDB();
  const db = openDB(dbPath);
  try {
    const rows = db.prepare(`
      SELECT DISTINCT
        r.Z_PK as id,
        r.ZFIRSTNAME as first_name,
        r.ZLASTNAME as last_name,
        r.ZORGANIZATION as organization,
        r.ZJOBTITLE as job_title,
        r.ZMODIFICATIONDATE as modified
      FROM ZABCDRECORD r
      LEFT JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK
      WHERE (r.ZFIRSTNAME IS NOT NULL OR r.ZLASTNAME IS NOT NULL OR r.ZORGANIZATION IS NOT NULL)
        AND (
          r.ZFIRSTNAME LIKE ?
          OR r.ZLASTNAME LIKE ?
          OR r.ZORGANIZATION LIKE ?
          OR e.ZADDRESS LIKE ?
          OR (COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '')) LIKE ?
        )
      ORDER BY r.ZSORTINGFIRSTNAME ASC, r.ZSORTINGLASTNAME ASC
      LIMIT ?
    `).all(pattern, pattern, pattern, pattern, pattern, limit) as ContactRow[];

    return ok(rows.map(formatContact));
  } finally {
    db.close();
  }
}

function handleGet(args: Record<string, unknown>) {
  const id = args.id as number;
  if (id == null) return err('Missing required parameter: id');

  const dbPath = resolveContactsDB();
  const db = openDB(dbPath);
  try {
    const row = db.prepare(`
      SELECT
        Z_PK as id,
        ZFIRSTNAME as first_name,
        ZLASTNAME as last_name,
        ZORGANIZATION as organization,
        ZJOBTITLE as job_title,
        ZDEPARTMENT as department,
        ZNICKNAME as nickname,
        ZTITLE as prefix,
        ZSUFFIX as suffix,
        ZBIRTHDAY as birthday,
        ZCREATIONDATE as created,
        ZMODIFICATIONDATE as modified
      FROM ZABCDRECORD
      WHERE Z_PK = ?
    `).get(id) as ContactDetailRow | undefined;

    if (!row) return err(`Contact not found with id: ${id}`);

    const emails = db.prepare(`
      SELECT ZADDRESS as address, ZLABEL as label
      FROM ZABCDEMAILADDRESS
      WHERE ZOWNER = ?
      ORDER BY ZORDERINGINDEX ASC
    `).all(id) as Array<{ address: string | null; label: string | null }>;

    const phones = db.prepare(`
      SELECT ZFULLNUMBER as number, ZLABEL as label
      FROM ZABCDPHONENUMBER
      WHERE ZOWNER = ?
      ORDER BY ZORDERINGINDEX ASC
    `).all(id) as Array<{ number: string | null; label: string | null }>;

    return ok({
      id: row.id,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      organization: row.organization || null,
      job_title: row.job_title || null,
      department: row.department || null,
      nickname: row.nickname || null,
      prefix: row.prefix || null,
      suffix: row.suffix || null,
      birthday: row.birthday != null ? coreDataToISO(row.birthday) : null,
      created: row.created != null ? coreDataToISO(row.created) : null,
      modified: row.modified != null ? coreDataToISO(row.modified) : null,
      emails: emails
        .filter(e => e.address)
        .map(e => ({ address: e.address, label: cleanLabel(e.label) })),
      phones: phones
        .filter(p => p.number)
        .map(p => ({ number: p.number, label: cleanLabel(p.label) })),
    });
  } finally {
    db.close();
  }
}

function handleRecent(args: Record<string, unknown>) {
  const count = (args.count as number) || 20;

  const dbPath = resolveContactsDB();
  const db = openDB(dbPath);
  try {
    const rows = db.prepare(`
      SELECT
        Z_PK as id,
        ZFIRSTNAME as first_name,
        ZLASTNAME as last_name,
        ZORGANIZATION as organization,
        ZJOBTITLE as job_title,
        ZMODIFICATIONDATE as modified
      FROM ZABCDRECORD
      WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL
      ORDER BY ZMODIFICATIONDATE DESC
      LIMIT ?
    `).all(count) as ContactRow[];

    return ok(rows.map(formatContact));
  } finally {
    db.close();
  }
}

function handleCompany(args: Record<string, unknown>) {
  const company = args.company as string;
  if (!company) return err('Missing required parameter: company');

  const limit = (args.limit as number) || 50;
  const pattern = `%${company}%`;

  const dbPath = resolveContactsDB();
  const db = openDB(dbPath);
  try {
    const rows = db.prepare(`
      SELECT
        Z_PK as id,
        ZFIRSTNAME as first_name,
        ZLASTNAME as last_name,
        ZORGANIZATION as organization,
        ZJOBTITLE as job_title,
        ZMODIFICATIONDATE as modified
      FROM ZABCDRECORD
      WHERE ZORGANIZATION LIKE ?
      ORDER BY ZSORTINGFIRSTNAME ASC, ZSORTINGLASTNAME ASC
      LIMIT ?
    `).all(pattern, limit) as ContactRow[];

    return ok(rows.map(formatContact));
  } finally {
    db.close();
  }
}

function handleStats() {
  const dbPath = resolveContactsDB();
  const db = openDB(dbPath);
  try {
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM ZABCDRECORD
      WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL
    `).get() as { total: number };

    const companyRows = db.prepare(`
      SELECT
        ZORGANIZATION as company,
        COUNT(*) as count
      FROM ZABCDRECORD
      WHERE ZORGANIZATION IS NOT NULL AND ZORGANIZATION != ''
      GROUP BY ZORGANIZATION
      ORDER BY count DESC
      LIMIT 20
    `).all() as Array<{ company: string; count: number }>;

    const dateRange = db.prepare(`
      SELECT
        MIN(ZCREATIONDATE) as earliest,
        MAX(ZMODIFICATIONDATE) as latest
      FROM ZABCDRECORD
      WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL
    `).get() as { earliest: number | null; latest: number | null };

    return ok({
      total_contacts: totalRow.total,
      top_companies: companyRows,
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

interface ContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  job_title: string | null;
  modified: number | null;
}

interface ContactDetailRow extends ContactRow {
  department: string | null;
  nickname: string | null;
  prefix: string | null;
  suffix: string | null;
  birthday: number | null;
  created: number | null;
}

function formatContact(row: ContactRow) {
  const nameParts = [row.first_name, row.last_name].filter(Boolean);
  return {
    id: row.id,
    name: nameParts.length > 0 ? nameParts.join(' ') : row.organization || '(unnamed)',
    organization: row.organization || null,
    job_title: row.job_title || null,
    modified: row.modified != null ? coreDataToISO(row.modified) : null,
  };
}

/** Clean up Apple's internal label format (e.g. "_$!<Work>!$_" → "Work") */
function cleanLabel(label: string | null): string {
  if (!label) return 'other';
  const match = label.match(/_\$!<(.+?)>!\$_/);
  return match ? match[1].toLowerCase() : label.toLowerCase();
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
