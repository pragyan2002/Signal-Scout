import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Post, Prospect } from '../types.js';
import type { SignalSource } from './SignalSource.js';

const FixturePostSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  text: z.string().min(1),
  createdAt: z.string(),
});
const FixtureFileSchema = z.object({
  handle: z.string(),
  posts: z.array(FixturePostSchema),
});

export class MockTwitterSource implements SignalSource {
  readonly name = 'MockTwitterSource';

  constructor(private readonly fixturesRoot: string) {}

  async fetchRecentPosts(prospect: Prospect, sinceDays: number): Promise<Post[]> {
    if (prospect.platform !== 'twitter' && prospect.platform !== 'linkedin') {
      throw new Error(
        `MockTwitterSource cannot handle platform '${prospect.platform}' for ${prospect.handle}`,
      );
    }
    const file = join(this.fixturesRoot, prospect.platform, `${prospect.handle}.json`);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      throw new Error(`Fixture not found for ${prospect.handle}: ${file}`);
    }
    const parsed = FixtureFileSchema.parse(JSON.parse(raw));
    // Fixtures have static dates — skip recency filter so they never age out
    void sinceDays;
    return parsed.posts
      .map((p) => ({
        id: p.id,
        url: p.url,
        text: p.text,
        createdAt: p.createdAt,
        authorHandle: parsed.handle,
      }));
  }
}
