/**
 * CoreData / NSDate epoch starts at 2001-01-01T00:00:00Z.
 * Unix epoch starts at 1970-01-01T00:00:00Z.
 * The offset is the number of seconds between them.
 */
export declare const CORE_DATA_EPOCH_OFFSET = 978307200;
/** Convert a CoreData timestamp to a Unix timestamp (seconds). */
export declare function coreDataToUnix(timestamp: number): number;
/** Convert a CoreData timestamp to an ISO 8601 string. */
export declare function coreDataToISO(timestamp: number): string;
/** Convert a Unix timestamp (seconds) to a CoreData timestamp. */
export declare function unixToCoreData(timestamp: number): number;
