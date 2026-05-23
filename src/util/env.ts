import 'dotenv/config';

export interface AppEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_BASE_URL = 'https://api.cerebras.ai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b';

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
  return { apiKey, baseUrl, model };
}
