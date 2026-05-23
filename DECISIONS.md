# Decisions

Append-only log of non-trivial choices made building Signal Scout. Each entry drafted in chat, reviewed, then committed here.

## Two source adapters: fixtures for Twitter/LinkedIn, live API for Bluesky

Ship two `SignalSource` implementations behind one interface. `MockTwitterSource` loads fixture JSON from `fixtures/`, simulating recent Twitter and LinkedIn activity. `BlueskySource` makes live HTTP calls to public AT Protocol endpoint `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed` — no auth, no API key, no rate-limit pain at POC volume.

Adapter pattern = whole architectural argument. Pattern with one implementation = class, not pattern. One mocked + one live source proves interface holds against real API response shape, not data hand-shaped to fit. Bluesky adapter also gives demo something visibly alive: founder runs `npm start`, real posts from real people flow through pipeline.

Considered, rejected three alternatives:

- **Twitter/X paid API.** Basic tier $100/month, overkill for weekend POC. Cost signals "burned money to demo" not "designed around constraint."
- **Nitter or snscrape for Twitter.** Broken/unreliable since Twitter's 2023 API crackdown. Demo dying when public Nitter instance goes down = worse than no live source.
- **Fixtures only, no live source.** Cleanest ship, weakest signal. Reviewer sees one mock implementation, assumes "adapter interface" never tested against reality. Bluesky costs one file, proves seam works.

## OpenRouter with Nemotron Nano Omni 30B (reasoning) free tier for both extraction and snippet generation

Both LLM calls — per-post signal extraction, per-prospect snippet generation — route through OpenRouter using `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`. One client, one model, zero spend.

POC needs to show pipeline produces non-generic output. Reasoning-tuned 30B model gets us there free. Nemotron Nano Omni reasoning mode strong at instruction-following and structured JSON output — what both prompts need. Free tier rate limits generous enough for demo run of 5–10 prospects with ~20 posts each.

Considered, rejected:

- **Llama 3.1 8B or Mistral 7B (free or near-free).** Cheap, fast, but worse at structured JSON extraction and snippets that feel personalized not templated. Whole point of demo = output quality.
- **Claude Haiku 4.5 or GPT-4o-mini (paid).** Better still, full POC run under a dollar. Rejected: using free reasoning model = small signal of taste. "Found free model good enough" reads better in portfolio than "expensed Anthropic credits."
- **Direct Anthropic or OpenAI SDK.** Locks demo to one vendor. OpenRouter lets reader swap models by changing a string — kind of detail technical founders notice.

Fallback documented in README: if model rate-limits during demo, swap `OPENROUTER_MODEL` env var to any other OpenRouter model. Client = thin fetch wrapper, not vendor-coupled.

## No database, flat files only

Config in `config/*.json` and `config/*.md`. Fixtures in `fixtures/`. Output to `output.json` and stdout. No SQLite, no Postgres, no key-value store, no run history beyond whatever user redirects to file.

POC's job = make core idea legible in one read. Database makes reader ask "why?" before "what does it do?" Every file in repo = input, code, or output. No fourth category of "state between runs you must reason about." Pipeline pure: same inputs, same outputs (modulo LLM nondeterminism).

Considered, rejected:

- **SQLite for run history.** Useful in real product to diff this week's signals against last week's, surface change. Out of scope for weekend demo. Pushes "is this a real product?" ahead of "does signal extraction work?" — backwards for POC.
- **JSON files as poor-man's DB (e.g. `runs/2026-05-22.json`).** Tempting middle ground, commits us to schema we'll regret. Ship one-shot pipeline cleanly, let anyone who wants history pipe stdout to file.

## Per-post extraction, then aggregate per prospect

Each post hits LLM individually. Extractor returns `{ intentSignals[], topics[], tone }` for that one post. After all posts for prospect extracted, pure-TS aggregator unions signals, ranks topics by frequency, picks dominant tone, selects single most actionable post as "anchor" for snippet generation.

Per-post extraction = unit that scales, unit that's debuggable. If prospect snippet looks wrong, point at exact post that produced bad signal. Can cache extractions per post URI later without re-architecting. Aggregation = deterministic TypeScript, not another LLM call, so costly nondeterministic step happens once per post, cheap deterministic step happens once per prospect.

Considered, rejected:

- **One LLM call per prospect taking all posts, returning aggregated signals.** Fewer API calls, lower latency, but model sees 20 posts at once and must do both extraction and aggregation in one shot. Quality drops, lose per-post traceability — if snippet cites "hiring for a Rust role" can't easily verify which post said that.
- **Two-stage LLM: extract per post, second LLM call to aggregate.** Aggregation = dumb set/count work. Paying LLM to do `groupBy` silly, adds nondeterminism for no quality gain.

## zod-validated LLM JSON, fail loud on malformed responses

Every LLM response parsed then run through zod schema. If model returns malformed JSON, missing fields, or wrong types, extractor throws with full offending payload in error. No silent fallback to empty object, no "if signals undefined, treat as no signals."

LLM output = boundary between probabilistic and deterministic system. Boundaries deserve validation. Whole pipeline downstream assumes signals = array of known enum values, topics = strings, tone = one of fixed set. Code breaking those assumptions should fail at source, not three functions deep with "cannot read property X of undefined" stack trace. Failing loud makes prompt iteration honest: if prompt regresses, next run errors immediately instead of producing plausible-looking garbage.

Per malformed post, error caught at per-post level — bad post logged, dropped from prospect's pool, pipeline continues. One flaky LLM response should not kill 10-prospect run.

Considered, rejected:

- **Trust LLM's JSON output, parse, move on.** What every tutorial does. Falls apart first time model adds markdown fence or trailing comma. zod gives one source of truth for "what shape do we accept" — validates and types downstream code.
- **Hand-written runtime checks (`if (typeof x.tone !== 'string')`).** Same result, more code, no static types from check. zod gives both free.
- **Retry on malformed response up to N times.** Worth doing in production. Out of scope for weekend POC. Failure mode (drop post, continue) good enough and easier to reason about.

## Platform-tagged prospects, dispatcher picks the adapter

Each entry in `config/prospects.json` carries `platform` field (`"twitter" | "linkedin" | "bluesky"`). Single `dispatch.sourceFor(prospect)` function returns right `SignalSource` instance for that prospect. Pipeline never sees which adapter ran — just calls `fetchRecentPosts` on whatever it gets.

Prospect list = only place that knows what kind of handle each row is. Pipeline shouldn't care. Dispatcher = one switch statement. Adding new source (Mastodon, Farcaster, real Twitter when budget allows) = two lines in switch plus new file. Interface, dispatcher, prospect schema move together.

Considered, rejected:

- **One mega-adapter internally branching on platform.** Same code, worse shape. Mixes Bluesky HTTP client with fixture file IO in one file. Adding third source = editing mega-adapter instead of adding sibling.
- **Caller passes adapter instance per prospect.** Pushes platform-to-adapter mapping out to whoever wires pipeline (today, `index.ts`). Anyone swapping entry point must re-learn mapping. Dispatcher centralizes it.
- **Infer platform from URL or handle shape.** Cute but fragile — `@user` could be Twitter or Bluesky depending on context. Explicit `platform` field costs nothing, removes guesswork.

## Provider-agnostic chat client, default to Cerebras

LLM client now generic OpenAI-compatible `/chat/completions` wrapper parameterized by `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Default `https://api.cerebras.ai/v1` + `llama3.1-8b`. Legacy `OPENROUTER_*` env vars still honored.

OpenRouter free tier (Nemotron) hit daily request cap mid-development. Cerebras free tier = 1M tokens/day with no card, 30 RPM, 8k context — well above what per-post extraction + per-prospect snippet needs. Llama 3.1 8B fast + cheap on Cerebras LPU hardware, adequate for structured JSON extraction and short snippet generation at POC quality bar. Bump to `llama-3.3-70b` via `LLM_MODEL` if output gets templated.

Generalizing client cost ~10 lines: dropped OpenRouter-specific `HTTP-Referer` / `X-Title` headers (decorative on OpenRouter, ignored elsewhere), threaded `baseUrl` through `createChatClient`. Renamed `createOpenRouterClient` → `createChatClient`, file `openrouter.ts` → `client.ts`. Was already the design intent ("swap models by changing a string") — now actually true across providers, not just within OpenRouter's catalog.

Considered, rejected:

- **Stick with OpenRouter, top up $10 to unlock 1000 req/day.** Solves immediate problem, pays for routing layer demo doesn't need. Cerebras direct = free + faster.
- **Vendor SDK (`@cerebras/cerebras_cloud_sdk`).** Locks demo to one vendor again. Whole point of refactor = the opposite.
- **Multi-provider router with fallback chain.** Over-engineered for POC. One provider with `.env` swap covers the actual failure mode (this provider's free tier dries up).

## Throttle + 429 retry in the chat client

Chat client serializes calls through a single promise chain and enforces a minimum gap between requests (default 13s, tunable via `LLM_MIN_INTERVAL_MS`). On `429` or `5xx` it retries up to 3 times, honoring `Retry-After` header and the `"try again in Xs"` body string Cerebras returns. Exponential backoff (2s/4s/8s, capped 30s) as fallback.

Cerebras free tier on `llama3.1-8b` = 5 RPM, enforced as ~1 req/12s. Pipeline issues one LLM call per post + one per prospect, sequentially — but TypeScript "sequential" still bursts in milliseconds, blowing the cap instantly. A 10-prospect run with ~20 posts each = ~210 calls; at 13s/call ≈ 45 min. Slow, but completes without intervention. Daily and per-hour budgets (2400 RPD, 150 RPH, 1M TPD) easily fit a POC run; RPM is the only binding constraint.

Throttle lives in the client wrapper, not the pipeline. Pipeline code stays oblivious to provider rate-limit math. Swap to a paid provider, set `LLM_MIN_INTERVAL_MS=0`, same code runs in a few minutes.

Considered, rejected:

- **Manual `setTimeout` between calls in `index.ts`.** Spreads rate-limit knowledge across the codebase. Future second caller (e.g. snippet retry path) forgets to sleep.
- **`p-throttle` or `bottleneck` library.** Twelve lines avoided by adding a dependency. Throttle here is a single mutex + a timestamp; library would carry features (concurrency, weight) the POC never uses.
- **Parallel calls with a token-bucket limiter.** Would help on providers with higher RPM. On Cerebras free 5 RPM, max useful concurrency = 1. Adds complexity for zero gain at the binding constraint.
- **Just retry on 429, no throttle.** Works but wastes a round-trip per call and depends on every retry-after being honest. Pre-throttling means the happy path is the common path.

## Run the pipeline on GitHub Actions, commit output back to the repo

A scheduled workflow at [.github/workflows/run.yml](.github/workflows/run.yml) runs the pipeline daily at 13:00 UTC, renames `output.json` to `runs/YYYY-MM-DD.json`, uploads it as a 30-day artifact, and commits the file back to `main`. `LLM_API_KEY` lives in repo secrets; everything else uses `.env.example` defaults. `workflow_dispatch` enabled for manual triggers.

A 13s/call throttle plus the 5 RPM Cerebras free-tier cap means a 5-prospect run takes ~25 min — too long to want to babysit locally every day. GHA gives us free compute, a scheduler, and a place to put the key that isn't a laptop. And the runs land somewhere persistent without anyone having to remember.

Committing the file back to the repo deliberately turns git history into run history. The "no database" decision earlier in this log argued every file should be input, code, or output — `runs/2026-05-23.json` is just yesterday's output, dated. Diffing two days of `runs/*.json` shows signal drift without a schema migration. The cost is repo bloat over time, but JSON outputs of ~5–10 prospects compress to a few KB each; 365 days = a few MB at the outside.

Considered, rejected:

- **Artifacts only, no commit-back.** Cleaner repo, but 30-day retention and no `git log` of changes. Loses the time-series view that's the main reason to schedule this at all. Workflow uploads an artifact too, as a belt-and-braces backup.
- **Push outputs to a separate `runs` branch.** Keeps `main` history clean but makes diffing across runs a `git checkout` dance. The volume here is small enough that one branch is fine.
- **External store (S3, Supabase, a gist).** Another credential, another moving part, another thing to explain in the README. Repo storage is free at this scale.
- **Per-prospect matrix jobs to parallelize past the 5 RPM cap.** Cerebras free tier limits are org-level, so matrix jobs would just thrash 429s against each other. Real fix is a paid tier or a different provider, not more concurrency.