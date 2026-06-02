export const RECENCY_WINDOW_DAYS = 14;

// Cap posts processed per prospect. Prolific accounts (e.g. a Bluesky user with
// dozens of recent posts) would otherwise issue one extraction LLM call each,
// blowing through free-tier rate limits and dropping later prospects' snippets.
// The anchor scorer favors recent + high-signal posts anyway, so the most recent
// N posts retain the signal that matters.
export const MAX_POSTS_PER_PROSPECT = 12;
