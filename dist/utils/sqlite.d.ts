import Database from 'better-sqlite3';
/**
 * Open a SQLite database in read-only mode.
 * Expands ~ to the user's home directory.
 */
export declare function openDB(path: string): Database.Database;
