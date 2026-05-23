export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatClient {
  chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>;
}

export function createChatClient(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): ChatClient {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    async chat(messages, callOpts) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: callOpts?.temperature ?? 0.2,
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM ${res.status}: ${await res.text()}`);
      }
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
    },
  };
}
