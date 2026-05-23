# Signal Scout

> A proof-of-concept that reads what prospects post in public, extracts the
> signals worth acting on, and writes the opening line of a cold message that
> sounds like a human paid attention.

## The problem

Outbound sales is broken at the small-team end. A solo founder or a two-person
GTM crew can't research every prospect by hand, so they default to templated
emails that get deleted in 0.3 seconds. The bigger tools that promise
"AI personalization" mostly produce variations of *"I noticed you're a CEO!"* —
which is not personalization, it's plagiarism of your job title.

The premise of Signal Scout is that the personalization problem is actually a
**listening** problem. Prospects are already telling you what they care about,
what they're building, what they're frustrated with — in tweets, posts, and
public threads. The opener almost writes itself if you've actually read the
last two weeks of what they said.

This repo is a small, end-to-end demo of that loop: monitor prospects, extract
intent signals from their recent activity, and generate one grounded outbound
opener per prospect. It runs in a single command.

## What it does

```
config/prospects.json
        │
        ▼
┌──────────────────────┐    fixtures/   ┌──────────────────────┐
│  SignalSource layer  │ ◄────────────  │  MockTwitterSource    │
│  (dispatcher picks   │                │  (Twitter, LinkedIn)  │
│   adapter by         │                └──────────────────────┘
│   platform field)    │
│                      │   public AT    ┌──────────────────────┐
│                      │ ◄────────────  │  BlueskySource        │
└──────────┬───────────┘   Protocol     │  (live, no auth)      │
           │                            └──────────────────────┘
           ▼
┌──────────────────────┐
│  SignalExtractor     │   per-post LLM call → { intentSignals, topics, tone }
│  (zod-validated)     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Aggregator (TS)     │   union signals, rank topics, pick anchor post
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  SnippetGenerator    │   one-sentence opener grounded in the anchor post
└──────────┬───────────┘
           ▼
    terminal table + output.json
```

Every prospect ends up with:

- A **top intent signal** (hiring, fundraising, launching, tool complaint,
  celebrating a win, etc.)
- A **dominant tone** for their recent activity
- A **personalized opener** that references a specific recent post — not the
  prospect's job title, not their company name, the actual thing they said
- The **anchor post** that the opener references, so you can verify the
  grounding by eye

## Running it

Requires Node 20+ and an LLM API key. Default provider is
[Cerebras](https://cloud.cerebras.ai/) (1M tokens/day free, no card).
Any OpenAI-compatible chat-completions endpoint works — see
`.env.example` for Groq and OpenRouter base URLs.

```bash
npm install
cp .env.example .env
# paste your Cerebras key into .env
npm start
```

You will see a terminal table of prospects with their signals and snippets,
and the same data written to `output.json`.

### Configuration

- `config/prospects.json` — the list of prospects. Each entry has a `handle`,
  `platform` (`"twitter" | "linkedin" | "bluesky"`), and `profileUrl`.
- `config/icp.md` — your ICP description. Edit freely in prose.
- `config/pitch.md` — your product pitch. Edit freely in prose.

To change provider or model, set `LLM_BASE_URL` and `LLM_MODEL` in `.env`.
Any OpenAI-compatible `/chat/completions` endpoint works (Cerebras, Groq,
OpenRouter, etc). Default is Cerebras `llama3.1-8b`.

### Scheduled runs

[.github/workflows/run.yml](.github/workflows/run.yml) runs the pipeline daily
on GitHub Actions, writes the result to `runs/YYYY-MM-DD.json`, and commits it
back to the repo. Set the `LLM_API_KEY` repo secret to enable it, or trigger it
manually via the Actions tab (`workflow_dispatch`). The git history of `runs/`
is the run history — there is still no database.

## The two data sources, and why

Real outbound tools need real sources. This POC ships two implementations of
the same `SignalSource` interface to prove the seam works against more than
one shape of reality:

- **`MockTwitterSource`** — reads JSON fixtures from `fixtures/twitter/` and
  `fixtures/linkedin/`. Twitter's free API was killed in 2023 and scraping
  it via Nitter has been unreliable since. LinkedIn forbids scraping outright.
  Fixtures let us demonstrate the pipeline against those platforms honestly,
  without pretending we have access we don't.
- **`BlueskySource`** — live HTTP calls to `public.api.bsky.app`, no auth,
  no API key, no rate-limit headaches at POC volume. This is the worked
  example: a real social network, real recent posts, parsed and normalized
  into the same `Post` shape the rest of the pipeline consumes.

Adding a third source (Mastodon, Farcaster, real Twitter if you have a paid
key) is one new file in [src/sources/](src/sources/) plus two lines in
[src/sources/dispatch.ts](src/sources/dispatch.ts). See
[src/sources/README.md](src/sources/README.md).

## What this isn't

This is a proof-of-concept, not a product. Deliberately out of scope:

- Sending email or any outbound delivery
- A web UI
- A database or run history
- Multi-tenant auth
- Scheduling, cron, or background workers
- Real Twitter/X or LinkedIn scraping (see above)

The point is to make the **signal → snippet** loop legible in a single pass of
the codebase. Productizing it would add database history, retries, multi-source
fan-in per prospect, snippet A/B grading, and so on — none of which clarify
the core idea.

## Design notes

The architectural choices and the reasoning behind them live in
[DECISIONS.md](DECISIONS.md). It's an append-only log written as you would
explain it to a technical founder over coffee — what we chose, why, and what
we considered and rejected.

The short version:

- **Two source adapters behind one interface.** Mock for Twitter/LinkedIn,
  live for Bluesky. An interface with only one implementation is not a
  pattern, it's a class.
- **Per-post extraction, then aggregate.** Each post hits the LLM
  independently; aggregation is pure TypeScript. Per-post traceability for
  every signal that ends up in the snippet.
- **zod-validated LLM JSON.** The boundary between probabilistic and
  deterministic code gets validated. If the model returns garbage, we fail
  loud at the source instead of three functions deep.
- **No database.** Every file in this repo is input, code, or output. There
  is no fourth category.
- **OpenAI-compatible HTTP, not a vendor SDK.** Swap providers (Cerebras,
  Groq, OpenRouter, …) by changing `LLM_BASE_URL` + `LLM_MODEL` in `.env`.

## Repo layout

```
signal-scout/
├── README.md                  this file
├── DECISIONS.md               narrative log of design choices
├── config/                    prospects + ICP + pitch
├── fixtures/                  realistic mocked Twitter / LinkedIn posts
└── src/
    ├── index.ts               pipeline entry point
    ├── types.ts               shared types + zod schemas
    ├── sources/               SignalSource interface + adapters
    ├── extract/               per-post LLM extraction
    ├── snippet/               aggregation + snippet generation
    ├── render/                terminal table + output.json
    ├── llm/                   thin OpenAI-compatible chat client
    └── util/                  env loading, safe JSON parsing
```

## License

MIT.
