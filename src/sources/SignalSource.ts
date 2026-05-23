import type { Post, Prospect } from '../types.js';

export interface SignalSource {
  readonly name: string;
  fetchRecentPosts(prospect: Prospect, sinceDays: number): Promise<Post[]>;
}
