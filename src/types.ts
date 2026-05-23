import { z } from 'zod';

export const PlatformSchema = z.enum(['twitter', 'linkedin', 'bluesky']);
export type Platform = z.infer<typeof PlatformSchema>;

export const ProspectSchema = z.object({
  handle: z.string().min(1),
  platform: PlatformSchema,
  profileUrl: z.string().url(),
  displayName: z.string().optional(),
});
export type Prospect = z.infer<typeof ProspectSchema>;

export const ProspectListSchema = z.array(ProspectSchema);

export interface Post {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  authorHandle: string;
}

export const IntentSignalSchema = z.enum([
  'hiring',
  'fundraising',
  'launching',
  'tool_complaint',
  'celebrating_win',
  'seeking_advice',
  'sharing_learning',
  'none',
]);
export type IntentSignal = z.infer<typeof IntentSignalSchema>;

export const ToneSchema = z.enum([
  'excited',
  'frustrated',
  'analytical',
  'reflective',
  'celebratory',
  'neutral',
]);
export type Tone = z.infer<typeof ToneSchema>;

export const ExtractedSignalsSchema = z.object({
  intentSignals: z.array(IntentSignalSchema).max(5),
  topics: z.array(z.string().min(1).max(40)).max(8),
  tone: ToneSchema,
});
export type ExtractedSignals = z.infer<typeof ExtractedSignalsSchema>;

export interface ExtractedPost {
  post: Post;
  signals: ExtractedSignals;
}

export interface AggregatedSignals {
  topSignals: IntentSignal[];
  topTopics: string[];
  dominantTone: Tone;
  anchor: ExtractedPost;
}

export interface ProspectResult {
  prospect: Prospect;
  postsFetched: number;
  postsExtracted: number;
  aggregated: AggregatedSignals | null;
  snippet: string | null;
  error?: string;
}
