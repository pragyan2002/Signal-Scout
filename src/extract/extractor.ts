import { ExtractedSignalsSchema, type ExtractedSignals, type Post } from '../types.js';
import type { ChatClient } from '../llm/client.js';
import { extractJsonObject } from '../util/json.js';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './prompts.js';

export interface Extractor {
  extract(post: Post): Promise<ExtractedSignals>;
}

export function createExtractor(llm: ChatClient): Extractor {
  return {
    async extract(post) {
      const raw = await llm.chat(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildExtractionUserPrompt(post) },
        ],
        { temperature: 0.1 },
      );
      const parsed = extractJsonObject(raw);
      return ExtractedSignalsSchema.parse(parsed);
    },
  };
}
