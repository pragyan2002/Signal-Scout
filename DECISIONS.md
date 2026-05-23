# Decisions

Append-only log of non-trivial choices made while building Signal Scout. Each entry
is drafted in chat, reviewed, then committed here.

## Two source adapters: fixtures for Twitter/LinkedIn, live API for Bluesky

We ship two `SignalSource` implementations behind one interface. `MockTwitterSource`
loads realistic fixture JSON from `fixtures/`, simulating recent Twitter and LinkedIn
activity. `BlueskySource` makes live HTTP calls to the public AT Protocol endpoint
`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed` — no auth required,
no API key, no rate-limit pain at POC volume.

We did this because the adapter pattern is the whole architectural argument of the
project, and a pattern with only one implementation is not a pattern, it's a class.
Having one mocked source and one live source proves the interface holds up against
a real API response shape, not just data we hand-shaped to fit. The Bluesky adapter
also gives the demo something visibly alive: when a founder runs `npm start`, real
posts from real people flow through the pipeline.

We considered and rejected three alternatives:

- **Twitter/X paid API.** Basic tier is $100/month, overkill for a weekend POC,
  and the cost signals "I burned money to demo this" rather than "I designed
  around a constraint."
- **Nitter or snscrape for Twitter.** Both have been broken or unreliable since
  Twitter's 2023 API crackdown. A demo that dies the week a public Nitter instance
  goes down is worse than no live source at all.
- **Fixtures only, no live source.** Cleanest to ship but weakest signal. A
  reviewer reading the repo sees one mock implementation and reasonably assumes
  the "adapter interface" was never tested against reality. Adding Bluesky costs
  one file and proves the seam works.

## OpenRouter with Nemotron Nano Omni 30B (reasoning) free tier for both extraction and snippet generation

Both LLM calls — per-post signal extraction and per-prospect snippet generation —
route through OpenRouter using `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`.
One client, one model, zero spend.

We did this because the POC needs to demonstrate that the pipeline produces
non-generic output, and a reasoning-tuned 30B model gets us there without paying.
Nemotron Nano Omni's reasoning mode is strong at instruction-following and
structured JSON output — exactly what both prompts need. Free tier rate limits
exist but are generous enough for a demo run of 5–10 prospects with ~20 posts
each.

We considered and rejected:

- **Llama 3.1 8B or Mistral 7B (also free or near-free).** Cheap and fast but
  noticeably worse at structured JSON extraction and at writing snippets that
  feel personalized rather than templated. The whole point of the demo is
  output quality.
- **Claude Haiku 4.5 or GPT-4o-mini (paid).** Better still, and total cost for
  a full POC run is under a dollar. Rejected because using a free reasoning
  model is itself a small signal of taste — "I found a free model that's good
  enough" reads better in a portfolio piece than "I expensed Anthropic credits."
- **Direct Anthropic or OpenAI SDK.** Locks the demo to one vendor. OpenRouter
  lets a reader swap models by changing a string, which is the kind of detail
  technical founders notice.

Fallback documented in README: if the model rate-limits during a demo, swap the
`OPENROUTER_MODEL` env var to any other OpenRouter model. The client is a thin
fetch wrapper, not vendor-coupled.

## No database, flat files only

Config in `config/*.json` and `config/*.md`. Fixtures in `fixtures/`. Output to
`output.json` and stdout. No SQLite, no Postgres, no key-value store, no run
history beyond whatever the user redirects to a file.

We did this because a POC's job is to make the core idea legible in one read,
and a database makes the reader ask "why?" before they ask "what does it do?"
Every file in the repo is either input, code, or output — there's no fourth
category of "state that lives between runs and you have to reason about." The
pipeline is pure: same inputs, same outputs (modulo LLM nondeterminism).

We considered and rejected:

- **SQLite for run history.** Useful in a real product so you can diff this
  week's signals against last week's and surface change. Out of scope for a
  weekend demo. Adding it would push the "is this a real product?" question
  ahead of the "does the signal extraction actually work?" question, which is
  backwards for a POC.
- **JSON files as a poor-man's DB (e.g. `runs/2026-05-22.json`).** Tempting
  middle ground but commits us to a schema we'll regret. Better to ship the
  one-shot pipeline cleanly and let anyone who wants history pipe stdout to a
  file.

## Per-post extraction, then aggregate per prospect

Each post hits the LLM individually. The extractor returns
`{ intentSignals[], topics[], tone }` for that one post. After all posts for a
prospect are extracted, a pure-TS aggregator unions the signals, ranks topics by
frequency, picks the dominant tone, and selects the single most actionable post
as the "anchor" for snippet generation.

We did this because per-post extraction is the unit that scales and the unit
that's debuggable. If the snippet for a prospect looks wrong, we can point at
the exact post that produced the bad signal. We can also cache extractions per
post URI in the future without re-architecting. Aggregation is deterministic
TypeScript, not another LLM call, so the costly nondeterministic step happens
once per post and the cheap deterministic step happens once per prospect.

We considered and rejected:

- **One LLM call per prospect that takes all posts and returns aggregated
  signals.** Fewer API calls and lower latency, but the model sees 20 posts at
  once and has to do both extraction and aggregation in one shot. Quality drops,
  and you lose per-post traceability — if the snippet cites "hiring for a Rust
  role" you can't easily verify which post said that.
- **Two-stage LLM: extract per post, then a second LLM call to aggregate.**
  Aggregation is dumb set/count work. Paying an LLM to do `groupBy` is silly
  and adds nondeterminism for no quality gain.

## zod-validated LLM JSON, fail loud on malformed responses

Every LLM response is parsed and then run through a zod schema. If the model
returns malformed JSON, missing fields, or wrong types, the extractor throws
with the full offending payload included in the error. No silent fallback to
an empty object, no "if signals undefined, treat as no signals."

We did this because LLM output is the boundary between a probabilistic system
and a deterministic one, and boundaries deserve validation. The whole pipeline
downstream assumes signals are an array of known enum values, topics are
strings, tone is one of a fixed set — code that breaks those assumptions should
fail at the source, not three functions deep with a "cannot read property X of
undefined" stack trace. Failing loud also makes prompt iteration honest: if the
prompt regresses, the next run errors immediately instead of producing
plausible-looking garbage.

Per malformed post, the error is caught at the per-post level — the bad post
is logged, dropped from that prospect's pool, and the pipeline continues. One
flaky LLM response should not kill a 10-prospect run.

We considered and rejected:

- **Trust the LLM's JSON output, parse, move on.** What every tutorial does.
  Falls apart the first time the model adds a markdown fence or a trailing
  comma. zod gives us one source of truth for "what shape do we accept" that
  both validates and types the downstream code.
- **Hand-written runtime checks (`if (typeof x.tone !== 'string')`).** Same
  end result, more code, no static types derived from the check. zod gives
  both for free.
- **Retry on malformed response up to N times.** Worth doing in production.
  Out of scope for a weekend POC; the failure mode (drop the post, continue)
  is good enough and easier to reason about.

## Platform-tagged prospects, dispatcher picks the adapter

Each entry in `config/prospects.json` carries a `platform` field
(`"twitter" | "linkedin" | "bluesky"`). A single `dispatch.sourceFor(prospect)`
function returns the right `SignalSource` instance for that prospect. The
pipeline never sees which adapter ran — it just calls `fetchRecentPosts` on
whatever it gets back.

We did this because the prospect list is the only place that knows what kind
of handle each row is, and the pipeline shouldn't care. The dispatcher is one
switch statement; adding a new source (Mastodon, Farcaster, real Twitter when
budget allows) is two lines in the switch plus a new file. The interface,
the dispatcher, and the prospect schema move together.

We considered and rejected:

- **One mega-adapter that internally branches on platform.** Same code, worse
  shape. Mixes Bluesky's HTTP client with fixture file IO in one file. Adding
  a third source means editing the mega-adapter rather than adding a sibling.
- **Caller passes adapter instance per prospect.** Pushes the platform-to-adapter
  mapping out to whoever wires the pipeline (today, `index.ts`). Means anyone
  swapping the entry point has to re-learn that mapping. The dispatcher
  centralizes it.
- **Infer platform from URL or handle shape.** Cute but fragile — `@user` could
  be either Twitter or Bluesky depending on context. Explicit `platform` field
  costs nothing and removes guesswork.
