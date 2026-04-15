/** KV TTL for `activity:batch:*` keys. Keep in sync with 30-day batch scans (e.g. admin anonymizer, activity-log GET). */
export const ACTIVITY_BATCH_KV_TTL_SECONDS = 2592000;
