/**
 * CoreData / NSDate epoch starts at 2001-01-01T00:00:00Z.
 * Unix epoch starts at 1970-01-01T00:00:00Z.
 * The offset is the number of seconds between them.
 */
export const CORE_DATA_EPOCH_OFFSET = 978307200;
/** Convert a CoreData timestamp to a Unix timestamp (seconds). */
export function coreDataToUnix(timestamp) {
    return timestamp + CORE_DATA_EPOCH_OFFSET;
}
/** Convert a CoreData timestamp to an ISO 8601 string. */
export function coreDataToISO(timestamp) {
    return new Date(coreDataToUnix(timestamp) * 1000).toISOString();
}
/** Convert a Unix timestamp (seconds) to a CoreData timestamp. */
export function unixToCoreData(timestamp) {
    return timestamp - CORE_DATA_EPOCH_OFFSET;
}
//# sourceMappingURL=dates.js.map