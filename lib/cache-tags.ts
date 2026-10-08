/**
 * Cache tags for the few server-side caches the app keeps (`unstable_cache`).
 *
 * Kept in a plain module so Server Actions can invalidate a tag without
 * importing the data layer that owns the cache.
 */

/**
 * The global player pool shown in the sidebar (name, position, OVR seed, recent
 * form). It is identical for every signed-in viewer, so one entry serves all.
 * Invalidate it whenever a profile or a completed match changes.
 */
export const ROSTER_TAG = "roster";

/** The live season bootstrap check in the root layout. */
export const SEASON_TAG = "season";

/**
 * Safety net for writes that happen outside a Server Action (a new account
 * created by the sign-in flow cannot call `updateTag`), so the roster is never
 * older than this many seconds even if nothing invalidated it.
 */
export const ROSTER_MAX_AGE_SECONDS = 60;
