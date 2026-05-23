# Decisions

Append-only log of non-trivial choices made building Signal Scout. Each entry drafted in chat, reviewed, committed here.

## Two source adapters: fixtures for Twitter/LinkedIn, live API for Bluesky

Ship two `SignalSource` implementations behind one interface. `MockTwitterSource` loads fixture JSON from `fixtures/`, simulates recent Twitter + LinkedIn activity. `BlueskySource` hits live AT Protocol endpoint `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed` — no auth, no key, no rate-limit pain at POC volume.

Adapter pattern = whole architectural argument. One impl = class, not pattern. One mocked + one live proves interface holds against real API shape, not data hand-shaped to fit. Bluesky adapter gives demo something visibly alive: founder runs `npm start`, real posts flow through pipeline.

Rejected three alternatives:

- **Twitter/X paid API.** Basic tier $100/month, overkill for weekend POC. Signals "burned money" not "designed around constraint."
- **Nitter or snscrape for Twitter.** Broken since Twitter 2023 API crackdown. Demo dying when Nitter instance down = worse than no live source.
- **Fixtures only, no live source.** Cleanest ship, weakest signal. Reviewer sees one mock, assumes interface never tested against reality. Bluesky costs one file, proves seam works.

## OpenRouter with Nemotron Nano Omni 30B (reasoning) free tier for both extraction and snippet generation

Both LLM calls — per-post extraction, per-prospect snippet — route through OpenRouter using `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`. One client, one model, zero spend.

POC must show pipeline produces non-generic output. Reasoning-tuned 30B gets us there free. Nemotron Nano Omni reasoning strong at instruction-following + structured JSON — what both prompts need. Free tier rate limits fit demo run of 5–10 prospects, ~20 posts each.

Rejected:

- **Llama 3.1 8B or Mistral 7B (free/near-free).** Cheap, fast, worse at structured JSON + personalized snippets. Demo point = output quality.
- **Claude Haiku 4.5 or GPT-4o-mini (paid).** Better, full run under $1. Rejected: free reasoning model = signal of taste. "Found free model good enough" reads better in portfolio than "expensed Anthropic credits."
- **Direct Anthropic or OpenAI SDK.** Locks demo to one vendor. OpenRouter lets reader swap models by changing string — detail technical founders notice.

Fallback in README: if rate-limited mid-demo, swap `OPENROUTER_MODEL` env var to any other OpenRouter model. Client = thin fetch wrapper, not vendor-coupled.

## No database, flat files only

Config in `config/*.json` and `config/*.md`. Fixtures in `fixtures/`. Output to `output.json` + stdout. No SQLite, no Postgres, no KV, no run history beyond user redirect.

POC job = make core idea legible in one read. Database makes reader ask "why?" before "what does it do?" Every file = input, code, or output. No fourth category of "state between runs." Pipeline pure: same inputs, same outputs (modulo LLM nondeterminism).

Rejected:

- **SQLite for run history.** Useful in real product to diff weeks, surface change. Out of scope for weekend demo. Pushes "real product?" ahead of "does extraction work?" — backwards for POC.
- **JSON files as poor-man's DB (e.g. `runs/2026-05-22.json`).** Tempting middle ground, commits to schema we'll regret. Ship one-shot pipeline cleanly, anyone who wants history pipes stdout to file.

## Per-post extraction, then aggregate per prospect

Each post hits LLM individually. Extractor returns `{ intentSignals[], topics[], tone }` for that post. After all posts extracted, pure-TS aggregator unions signals, ranks topics by frequency, picks dominant tone, selects single most actionable post as "anchor" for snippet.

Per-post = unit that scales, unit that debugs. Bad snippet → point at exact post that produced bad signal. Can cache extractions per post URI later without re-architecting. Aggregation = deterministic TS, not another LLM call. Costly nondeterministic step once per post, cheap deterministic step once per prospect.

Rejected:

- **One LLM call per prospect taking all posts, returning aggregated signals.** Fewer calls, lower latency, but model sees 20 posts at once doing extraction + aggregation in one shot. Quality drops, lose per-post traceability — if snippet cites "hiring for Rust role" can't verify which post said it.
- **Two-stage LLM: extract per post, second LLM call to aggregate.** Aggregation = dumb set/count work. Paying LLM to do `groupBy` silly, adds nondeterminism for no quality gain.

## zod-validated LLM JSON, fail loud on malformed responses

Every LLM response parsed, run through zod schema. Malformed JSON, missing fields, wrong types → extractor throws with full offending payload. No silent fallback to empty object, no "if signals undefined, treat as no signals."

LLM output = boundary between probabilistic + deterministic system. Boundaries deserve validation. Downstream assumes signals = array of known enums, topics = strings, tone = fixed set. Code breaking those should fail at source, not three functions deep with "cannot read property X of undefined." Failing loud makes prompt iteration honest: regression errors immediately instead of producing plausible-looking garbage.

Per malformed post, error caught at per-post level — bad post logged, dropped from pool, pipeline continues. One flaky response should not kill 10-prospect run.

Rejected:

- **Trust LLM JSON, parse, move on.** What every tutorial does. Falls apart first time model adds markdown fence or trailing comma. zod = one source of truth for "what shape do we accept" — validates + types downstream.
- **Hand-written runtime checks (`if (typeof x.tone !== 'string')`).** Same result, more code, no static types. zod gives both free.
- **Retry on malformed up to N times.** Worth doing in production. Out of scope for POC. Drop-post-continue good enough, easier to reason about.

## Platform-tagged prospects, dispatcher picks the adapter

Each entry in `config/prospects.json` carries `platform` field (`"twitter" | "linkedin" | "bluesky"`). Single `dispatch.sourceFor(prospect)` returns right `SignalSource` for that prospect. Pipeline never sees which adapter ran — calls `fetchRecentPosts` on whatever it gets.

Prospect list = only place that knows handle kind. Pipeline shouldn't care. Dispatcher = one switch. New source (Mastodon, Farcaster, real Twitter when budget allows) = two lines in switch plus new file. Interface, dispatcher, prospect schema move together.

Rejected:

- **One mega-adapter internally branching on platform.** Same code, worse shape. Mixes Bluesky HTTP client with fixture file IO in one file. Third source = editing mega-adapter instead of sibling.
- **Caller passes adapter instance per prospect.** Pushes platform-to-adapter mapping to whoever wires pipeline (today, `index.ts`). Anyone swapping entry point must re-learn mapping. Dispatcher centralizes.
- **Infer platform from URL or handle shape.** Cute but fragile — `@user` could be Twitter or Bluesky. Explicit `platform` field costs nothing, removes guesswork.

## Provider-agnostic chat client, default to Cerebras

LLM client now generic OpenAI-compatible `/chat/completions` wrapper parameterized by `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Default `https://api.cerebras.ai/v1` + `llama3.1-8b`. Legacy `OPENROUTER_*` env vars still honored.

OpenRouter free tier (Nemotron) hit daily request cap mid-dev. Cerebras free tier = 1M tokens/day no card, 30 RPM, 8k context — well above per-post extraction + per-prospect snippet needs. Llama 3.1 8B fast + cheap on Cerebras LPU, adequate for structured JSON + short snippet at POC quality. Bump to `llama-3.3-70b` via `LLM_MODEL` if output gets templated.

Generalizing client cost ~10 lines: dropped OpenRouter-specific `HTTP-Referer` / `X-Title` headers (decorative there, ignored elsewhere), threaded `baseUrl` through `createChatClient`. Renamed `createOpenRouterClient` → `createChatClient`, file `openrouter.ts` → `client.ts`. Was already design intent ("swap models by changing string") — now true across providers, not just OpenRouter catalog.

Rejected:

- **Stick with OpenRouter, top up $10 to unlock 1000 req/day.** Solves immediate problem, pays for routing layer demo doesn't need. Cerebras direct = free + faster.
- **Vendor SDK (`@cerebras/cerebras_cloud_sdk`).** Locks demo to one vendor again. Whole point of refactor = opposite.
- **Multi-provider router with fallback chain.** Over-engineered for POC. One provider with `.env` swap covers actual failure mode (this provider's free tier dries up).

## Throttle + 429 retry in the chat client

Chat client serializes calls through single promise chain, enforces minimum gap between requests (default 13s, tunable via `LLM_MIN_INTERVAL_MS`). On `429` or `5xx` retries up to 3 times, honors `Retry-After` header + `"try again in Xs"` body string Cerebras returns. Exponential backoff (2s/4s/8s, capped 30s) as fallback.

Cerebras free tier on `llama3.1-8b` = 5 RPM, enforced as ~1 req/12s. Pipeline issues one LLM call per post + one per prospect, sequentially — but TS "sequential" bursts in milliseconds, blowing cap instantly. 10-prospect run with ~20 posts each = ~210 calls; at 13s/call ≈ 45 min. Slow, completes without intervention. Daily + per-hour budgets (2400 RPD, 150 RPH, 1M TPD) easily fit POC; RPM = only binding constraint.

Throttle lives in client wrapper, not pipeline. Pipeline stays oblivious to rate-limit math. Swap to paid provider, set `LLM_MIN_INTERVAL_MS=0`, same code runs in minutes.

Rejected:

- **Manual `setTimeout` between calls in `index.ts`.** Spreads rate-limit knowledge across codebase. Future second caller (e.g. snippet retry path) forgets to sleep.
- **`p-throttle` or `bottleneck` library.** Twelve lines avoided by adding dependency. Throttle here = single mutex + timestamp; library carries features (concurrency, weight) POC never uses.
- **Parallel calls with token-bucket limiter.** Helps on higher-RPM providers. On Cerebras free 5 RPM, max useful concurrency = 1. Complexity for zero gain at binding constraint.
- **Just retry on 429, no throttle.** Works but wastes round-trip per call, depends on every retry-after being honest. Pre-throttling means happy path = common path.

## Run the pipeline on GitHub Actions, commit output back to the repo

Scheduled workflow at [.github/workflows/run.yml](.github/workflows/run.yml) runs pipeline daily 13:00 UTC, renames `output.json` to `runs/YYYY-MM-DD.json`, uploads as 30-day artifact, commits file back to `main`. `LLM_API_KEY` in repo secrets; rest uses `.env.example` defaults. `workflow_dispatch` enabled for manual triggers.

13s/call throttle plus 5 RPM Cerebras cap means 5-prospect run takes ~25 min — too long to babysit locally daily. GHA = free compute, scheduler, place to put key that isn't a laptop. Runs land somewhere persistent without anyone remembering.

Committing file back deliberately turns git history into run history. "No database" decision argued every file = input, code, or output — `runs/2026-05-23.json` = yesterday's output, dated. Diffing two days of `runs/*.json` shows signal drift without schema migration. Cost = repo bloat over time, but JSON outputs of ~5–10 prospects compress to few KB each; 365 days = few MB max.

Rejected:

- **Artifacts only, no commit-back.** Cleaner repo, but 30-day retention + no `git log` of changes. Loses time-series view = main reason to schedule this. Workflow uploads artifact too, belt-and-braces backup.
- **Push outputs to separate `runs` branch.** Keeps `main` clean but makes cross-run diffing a `git checkout` dance. Volume small enough that one branch fine.
- **External store (S3, Supabase, gist).** Another credential, moving part, README explanation. Repo storage free at this scale.
- **Per-prospect matrix jobs to parallelize past 5 RPM cap.** Cerebras free tier limits org-level, matrix jobs would thrash 429s against each other. Real fix = paid tier or different provider, not more concurrency.

## Tighten snippet generation prompt — specificity and peer tone

Snippet prompt produced corporate openers echoing prospect's words. Specific claim rule too weak — model passed surface check (mentions number/detail) without substance check (claim must only work for this exact post, not similar posts).

Updated `SNIPPET_SYSTEM_PROMPT` in `src/snippet/prompts.ts`:

- Word cap 30 → 25. Forces compression, kills filler faster than any other rule.
- Explicit rule: don't restate prospect's words. Make own point about what they did or what it means.
- Banned phrases: "testament to", "resonates with", "marks the start of", "I noticed", "I saw", "impressive", "excited", "love this", "great post".
- Tone rule rewritten: "smart peer, not salesperson — write like you read the post and had honest reaction, not like you're warming someone up to pitch them."
- Bad/good example pair added directly in system prompt. Concrete contrast beats description of contrast.

Rejected:

- **Keep 30-word cap.** Under 25 forces compression that eliminates filler faster than any other rule.
- **Move examples to user prompt.** System prompt always present, cheapest enforcement. User prompt grows with anchor post content.