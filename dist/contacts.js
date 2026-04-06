import { openDB } from './utils/sqlite.js';
import { coreDataToISO } from './utils/dates.js';
import { existsSync } from 'fs';
import { homedir } from 'os';
const CONTACTS_DB_PATH = '~/Library/Application Support/AddressBook/AddressBook-v22.abcddb';
const log = (...args) => console.error('[apple-contacts]', ...args);
function resolveContactsDB() {
    const resolved = CONTACTS_DB_PATH.replace('~', homedir());
    if (!existsSync(resolved)) {
        throw new Error(`Apple Contacts database not found at: ${CONTACTS_DB_PATH}\n` +
            'The database path may differ on this macOS version or contacts may be synced differently.');
    }
    return CONTACTS_DB_PATH;
}
/** Tool definitions for Apple Contacts */
export const contactsTools = [
    {
        name: 'apple_contacts_search',
        description: 'Search contacts by name, email, or company.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
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
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of recent contacts (default 20)' },
            },
        },
    },
    {
        name: 'apple_contacts_company',
        description: 'List contacts at a specific company.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
            properties: {},
        },
    },
];
/** Handle a Contacts tool call. Returns null if tool name not recognized. */
export function handleContactsTool(name, args) {
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
function handleSearch(args) {
    const query = args.query;
    if (!query)
        return err('Missing required parameter: query');
    const limit = args.limit || 20;
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
        )
      ORDER BY r.ZSORTINGFIRSTNAME ASC, r.ZSORTINGLASTNAME ASC
      LIMIT ?
    `).all(pattern, pattern, pattern, pattern, limit);
        return ok(rows.map(formatContact));
    }
    finally {
        db.close();
    }
}
function handleGet(args) {
    const id = args.id;
    if (id == null)
        return err('Missing required parameter: id');
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
    `).get(id);
        if (!row)
            return err(`Contact not found with id: ${id}`);
        const emails = db.prepare(`
      SELECT ZADDRESS as address, ZLABEL as label
      FROM ZABCDEMAILADDRESS
      WHERE ZOWNER = ?
      ORDER BY ZORDERINGINDEX ASC
    `).all(id);
        const phones = db.prepare(`
      SELECT ZFULLNUMBER as number, ZLABEL as label
      FROM ZABCDPHONENUMBER
      WHERE ZOWNER = ?
      ORDER BY ZORDERINGINDEX ASC
    `).all(id);
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
    }
    finally {
        db.close();
    }
}
function handleRecent(args) {
    const count = args.count || 20;
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
    `).all(count);
        return ok(rows.map(formatContact));
    }
    finally {
        db.close();
    }
}
function handleCompany(args) {
    const company = args.company;
    if (!company)
        return err('Missing required parameter: company');
    const limit = args.limit || 50;
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
    `).all(pattern, limit);
        return ok(rows.map(formatContact));
    }
    finally {
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
    `).get();
        const companyRows = db.prepare(`
      SELECT
        ZORGANIZATION as company,
        COUNT(*) as count
      FROM ZABCDRECORD
      WHERE ZORGANIZATION IS NOT NULL AND ZORGANIZATION != ''
      GROUP BY ZORGANIZATION
      ORDER BY count DESC
      LIMIT 20
    `).all();
        const dateRange = db.prepare(`
      SELECT
        MIN(ZCREATIONDATE) as earliest,
        MAX(ZMODIFICATIONDATE) as latest
      FROM ZABCDRECORD
      WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL
    `).get();
        return ok({
            total_contacts: totalRow.total,
            top_companies: companyRows,
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
function formatContact(row) {
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
function cleanLabel(label) {
    if (!label)
        return 'other';
    const match = label.match(/_\$!<(.+?)>!\$_/);
    return match ? match[1].toLowerCase() : label.toLowerCase();
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
//# sourceMappingURL=contacts.js.map