import 'dotenv/config';

export interface AppEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
  minIntervalMs: number;
}

const DEFAULT_BASE_URL = 'https://api.cerebras.ai/v1';
const DEFAULT_MODEL = 'llama3.1-8b';
const DEFAULT_MIN_INTERVAL_MS = 13_000;

export function loadEnv(): AppEnv {
  const apiKey =
    process.env.LLM_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '\n  Missing LLM_API_KEY.\n  Copy .env.example to .env and paste a key.\n  Cerebras (default, 1M tokens/day free): https://cloud.cerebras.ai/\n  OpenRouter: https://openrouter.ai/keys\n',
    );
    process.exit(1);
  }
  const baseUrl =
    process.env.LLM_BASE_URL?.trim() ||
    (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : DEFAULT_BASE_URL);
  const model =
    process.env.LLM_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL;
  const minIntervalMs = parsePositiveInt(process.env.LLM_MIN_INTERVAL_MS) ?? DEFAULT_MIN_INTERVAL_MS;
  return { apiKey, baseUrl, model, minIntervalMs };
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
