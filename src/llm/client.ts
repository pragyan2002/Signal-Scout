export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatClient {
  chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>;
}

export interface ChatClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Minimum gap between requests (ms). Default 13000 = safe under Cerebras free 5 RPM. */
  minIntervalMs?: number;
  /** Max retries on 429 / 5xx. Default 3. */
  maxRetries?: number;
}

export function createChatClient(opts: ChatClientOptions): ChatClient {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const minIntervalMs = opts.minIntervalMs ?? 13_000;
  const maxRetries = opts.maxRetries ?? 3;

  // Serialize all calls through a single promise chain so concurrent callers
  // don't independently breach the per-minute rate limit.
  let gate: Promise<void> = Promise.resolve();
  let lastCallAt = 0;

  async function callOnce(messages: ChatMessage[], temperature: number): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: opts.model, messages, temperature }),
    });
  }

  return {
    async chat(messages, callOpts) {
      const temperature = callOpts?.temperature ?? 0.2;

      const turn = gate.then(async () => {
        const wait = lastCallAt + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);

        let attempt = 0;
        while (true) {
          lastCallAt = Date.now();
          const res = await callOnce(messages, temperature);
          if (res.ok) return parseChat(res);

          const body = await res.text();
          const retryable = res.status === 429 || res.status >= 500;
          if (!retryable || attempt >= maxRetries) {
            throw new Error(`LLM ${res.status}: ${body}`);
          }
          const backoff = retryDelayMs(res, body, attempt);
          attempt += 1;
          await sleep(backoff);
        }
      });

      // Update the gate so the next chat() call waits behind this one.
      gate = turn.then(
        () => undefined,
        () => undefined,
      );
      return turn;
    },
  };
}

async function parseChat(res: Response): Promise<string> {
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (json.error) {
    throw new Error(`LLM API error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`LLM returned no content: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return content;
}

function retryDelayMs(res: Response, body: string, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 60_000);
  }
  // Cerebras sometimes embeds the wait in the body: "Please try again in 6.231s"
  const match = body.match(/try again in ([\d.]+)s/i);
  if (match) {
    const secs = Number(match[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000 + 500, 60_000);
  }
  // Exponential backoff fallback: 2s, 4s, 8s, capped at 30s.
  return Math.min(2_000 * 2 ** attempt, 30_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
