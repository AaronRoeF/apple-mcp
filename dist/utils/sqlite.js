import Database from 'better-sqlite3';
import { homedir } from 'os';
/**
 * Open a SQLite database in read-only mode.
 * Expands ~ to the user's home directory.
 */
export function openDB(path) {
    const resolved = path.startsWith('~') ? path.replace('~', homedir()) : path;
    return new Database(resolved, { readonly: true, fileMustExist: true });
}
//# sourceMappingURL=sqlite.js.map