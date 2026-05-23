import { writeFile } from 'node:fs/promises';
import type { ProspectResult } from '../types.js';

export async function writeJsonOutput(
  path: string,
  results: ProspectResult[],
  meta: { model: string },
): Promise<void> {
  const payload = {
    generatedAt: new Date().toISOString(),
    model: meta.model,
    results: results.map((r) => ({
      prospect: r.prospect,
      postsFetched: r.postsFetched,
      postsExtracted: r.postsExtracted,
      aggregated: r.aggregated && {
        topSignals: r.aggregated.topSignals,
        topTopics: r.aggregated.topTopics,
        dominantTone: r.aggregated.dominantTone,
        anchor: {
          post: r.aggregated.anchor.post,
          signals: r.aggregated.anchor.signals,
        },
      },
      snippet: r.snippet,
      error: r.error ?? null,
    })),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
}
