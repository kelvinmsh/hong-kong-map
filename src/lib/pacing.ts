/** How often this map is willing to call someone else's server. */

/** Minimum time between the starts of two MTR schedule requests, across every tab. */
export const SCHEDULE_GAP_MS = 3_000

/** Open station board. The source itself updates about every 10 seconds. */
export const BOARD_MAX_AGE_MS = 30_000

/** Sampled stations that place the moving trains. A minute of ETA is the source's precision. */
export const TRAIN_MAX_AGE_MS = 120_000

/** Manual refresh. Ignores the board age, but not the source's own update period. */
export const RELOAD_MAX_AGE_MS = 10_000

/** Failed stations are left alone so a down API is not polled in a tight loop. */
export const ERROR_RETRY_MS = 60_000

/** Keep drawing a train from the last good sample, then drop it rather than invent a long dead-reckoning. */
export const SIGHTING_KEEP_MS = 240_000

export const SCHEDULE_DEADLINE_MS = 12_000

export const RATE_LIMIT_FALLBACK_MS = 60_000
export const RATE_LIMIT_MIN_MS = 5_000
export const RATE_LIMIT_MAX_MS = 5 * 60_000

/** Camera locations change rarely. One download covers the rest of the day. */
export const CAMERA_LIST_TTL_MS = 12 * 60 * 60 * 1000
export const CAMERA_LIST_STALE_MS = 7 * 24 * 60 * 60 * 1000

/** Transport Department refreshes snapshots about every two minutes. */
export const SNAPSHOT_SLOT_MS = 120_000
export const SNAPSHOT_RETRY_MS = 30_000
