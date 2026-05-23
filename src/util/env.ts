import 'dotenv/config';

export interface AppEnv {
  openrouterApiKey: string;
  model: string;
}

export function loadEnv(): AppEnv {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    console.error(
      '\n  Missing OPENROUTER_API_KEY.\n  Copy .env.example to .env and paste a key from https://openrouter.ai/keys\n',
    );
    process.exit(1);
  }
  const model =
    process.env.OPENROUTER_MODEL?.trim() || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
  return { openrouterApiKey: key, model };
}
