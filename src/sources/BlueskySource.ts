import { z } from 'zod';
import type { Post, Prospect } from '../types.js';
import type { SignalSource } from './SignalSource.js';

const BSKY_ENDPOINT = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';

const BskyPostRecordSchema = z.object({
  text: z.string(),
  createdAt: z.string(),
});

const BskyPostSchema = z.object({
  uri: z.string(),
  author: z.object({
    handle: z.string(),
  }),
  record: BskyPostRecordSchema,
});

const BskyFeedItemSchema = z.object({
  post: BskyPostSchema,
  reason: z.unknown().optional(),
  reply: z.unknown().optional(),
});

const BskyFeedResponseSchema = z.object({
  feed: z.array(BskyFeedItemSchema),
});

function uriToWebUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop() ?? '';
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

export class BlueskySource implements SignalSource {
  readonly name = 'BlueskySource';

  async fetchRecentPosts(prospect: Prospect, sinceDays: number): Promise<Post[]> {
    if (prospect.platform !== 'bluesky') {
      throw new Error(
        `BlueskySource cannot handle platform '${prospect.platform}' for ${prospect.handle}`,
      );
    }
    const url = `${BSKY_ENDPOINT}?actor=${encodeURIComponent(prospect.handle)}&limit=50&filter=posts_no_replies`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Bluesky API ${res.status} for ${prospect.handle}: ${await res.text()}`);
    }
    const json = (await res.json()) as unknown;
    const parsed = BskyFeedResponseSchema.parse(json);
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return parsed.feed
      .filter((item) => item.reason === undefined)
      .map((item) => item.post)
      .filter((p) => Date.parse(p.record.createdAt) >= cutoff)
      .filter((p) => p.record.text.trim().length > 0)
      .map((p) => ({
        id: p.uri,
        url: uriToWebUrl(p.uri, p.author.handle),
        text: p.record.text,
        createdAt: p.record.createdAt,
        authorHandle: p.author.handle,
      }));
  }
}
