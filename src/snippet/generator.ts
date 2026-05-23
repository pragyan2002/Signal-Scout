import type { OpenRouterClient } from '../llm/openrouter.js';
import type { AggregatedSignals, Prospect } from '../types.js';
import { SNIPPET_SYSTEM_PROMPT, buildSnippetUserPrompt } from './prompts.js';

export interface SnippetGenerator {
  generate(args: {
    prospect: Prospect;
    aggregated: AggregatedSignals;
    icp: string;
    pitch: string;
  }): Promise<string>;
}

export function createSnippetGenerator(llm: OpenRouterClient): SnippetGenerator {
  return {
    async generate(args) {
      const raw = await llm.chat(
        [
          { role: 'system', content: SNIPPET_SYSTEM_PROMPT },
          { role: 'user', content: buildSnippetUserPrompt(args) },
        ],
        { temperature: 0.7 },
      );
      return cleanSnippet(raw);
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
