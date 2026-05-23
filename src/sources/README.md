# Signal Sources

Every data source implements one interface:

```ts
interface SignalSource {
  readonly name: string;
  fetchRecentPosts(prospect: Prospect, sinceDays: number): Promise<Post[]>;
}
```

Two implementations ship today:

- **`MockTwitterSource`** — reads JSON fixtures from `fixtures/twitter/<handle>.json`
  and `fixtures/linkedin/<handle>.json`. Used for Twitter/X and LinkedIn handles,
  which can't be scraped legally or reliably.
- **`BlueskySource`** — live HTTP calls to `public.api.bsky.app`, no auth.
  Worked example of what a real adapter looks like.

## Adding a new source

1. Implement `SignalSource` in a new file (e.g. `MastodonSource.ts`). Normalize
   the platform's post shape into the shared `Post` type.
2. Add the platform string to `PlatformSchema` in `src/types.ts`.
3. Add a case to the switch in `dispatch.ts`.

The pipeline never sees which adapter ran — it just calls `fetchRecentPosts` on
whatever the dispatcher returns.
