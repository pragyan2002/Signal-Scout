import type { ChatClient, ChatMessage } from '../llm/client.js';
import type { AggregatedSignals, Prospect } from '../types.js';
import { SNIPPET_SYSTEM_PROMPT, buildSnippetUserPrompt } from './prompts.js';

const BANNED_PHRASES = [
  'testament to',
  'resonates with',
  'marks the start of',
  'i noticed',
  'i saw',
  'impressive',
  'excited',
  'love this',
  'great post',
];

function containsBanned(s: string): string | undefined {
  const lower = s.toLowerCase();
  return BANNED_PHRASES.find((p) => lower.includes(p));
}

export interface SnippetGenerator {
  generate(args: {
    prospect: Prospect;
    aggregated: AggregatedSignals;
    icp: string;
    pitch: string;
  }): Promise<string>;
}

export function createSnippetGenerator(llm: ChatClient): SnippetGenerator {
  return {
    async generate(args) {
      const messages: ChatMessage[] = [
        { role: 'system', content: SNIPPET_SYSTEM_PROMPT },
        { role: 'user', content: buildSnippetUserPrompt(args) },
      ];
      const raw = await llm.chat(messages, { temperature: 0.7 });
      const first = cleanSnippet(raw);
      const hit = containsBanned(first);
      if (!hit) return first;
      const retry = await llm.chat(
        [
          ...messages,
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `Your response contains the banned phrase "${hit}". Rewrite the opener without it. One sentence only.`,
          },
        ],
        { temperature: 0.7 },
      );
      return cleanSnippet(retry);
    },
  };
}

function cleanSnippet(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  const firstLine = s.split('\n').find((line) => line.trim().length > 0) ?? s;
  return firstLine.trim();
}
