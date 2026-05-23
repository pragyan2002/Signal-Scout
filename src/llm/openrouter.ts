export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterClient {
  chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>;
}

export function createOpenRouterClient(opts: {
  apiKey: string;
  model: string;
}): OpenRouterClient {
  return {
    async chat(messages, callOpts) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/signal-scout',
          'X-Title': 'Signal Scout',
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: callOpts?.temperature ?? 0.2,
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (json.error) {
        throw new Error(`OpenRouter API error: ${json.error.message ?? JSON.stringify(json.error)}`);
      }
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`OpenRouter returned no content: ${JSON.stringify(json).slice(0, 300)}`);
      }
      return content;
    },
  };
}
