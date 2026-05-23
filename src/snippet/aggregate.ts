import type {
  AggregatedSignals,
  ExtractedPost,
  IntentSignal,
  Tone,
} from '../types.js';

// Keep RECENCY_WINDOW_DAYS in sync with SINCE_DAYS in index.ts
const RECENCY_WINDOW_DAYS = 14;
const THIN_POST_CHARS = 100;
const THIN_POST_PENALTY = 20;

const SIGNAL_PRIORITY: Record<IntentSignal, number> = {
  fundraising: 100,
  launching: 85,
  tool_complaint: 80,
  hiring: 70,
  celebrating_win: 60,
  seeking_advice: 50,
  sharing_learning: 30,
  none: 0,
};

const BROADCAST_HIRE_RE =
  /know anyone|refer(?:ral)?|(?:^|\s)intro(?:\s|$)|tag someone|spread the word|share this|dm me|reach out if you know/i;

function isHiringBroadcast(p: ExtractedPost): boolean {
  return p.signals.intentSignals.includes('hiring') && BROADCAST_HIRE_RE.test(p.post.text);
}

function topN<T>(items: T[], n: number, keyFn: (t: T) => string): T[] {
  const counts = new Map<string, { item: T; count: number; firstIdx: number }>();
  items.forEach((item, idx) => {
    const key = keyFn(item);
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { item, count: 1, firstIdx: idx });
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.firstIdx - b.firstIdx)
    .slice(0, n)
    .map((x) => x.item);
}

function dominantTone(tones: Tone[]): Tone {
  if (tones.length === 0) return 'neutral';
  return topN(tones, 1, (t) => t)[0]!;
}

function scorePost(p: ExtractedPost, nowMs: number): number {
  if (isHiringBroadcast(p)) return 5;
  const best = p.signals.intentSignals.reduce(
    (m, s) => Math.max(m, SIGNAL_PRIORITY[s] ?? 0),
    0,
  );
  const recencyBoost = Math.max(
    0,
    RECENCY_WINDOW_DAYS - (nowMs - Date.parse(p.post.createdAt)) / (24 * 60 * 60 * 1000),
  );
  const thinPenalty = p.post.text.length < THIN_POST_CHARS ? THIN_POST_PENALTY : 0;
  return best + recencyBoost - thinPenalty;
}

export function aggregate(extracted: ExtractedPost[]): AggregatedSignals | null {
  const meaningful = extracted.filter(
    (e) => e.signals.intentSignals.some((s) => s !== 'none') || e.signals.topics.length > 0,
  );
  const pool = meaningful.length > 0 ? meaningful : extracted;
  if (pool.length === 0) return null;

  const allSignals = pool.flatMap((e) =>
    e.signals.intentSignals.filter((s) => s !== 'none'),
  );
  const topSignals = topN(allSignals, 3, (s) => s);
  const topTopics = topN(
    pool.flatMap((e) => e.signals.topics),
    5,
    (t) => t.toLowerCase(),
  );
  const tone = dominantTone(pool.map((e) => e.signals.tone));
  const nowMs = Date.now();
  const anchor = [...pool].sort(
    (a, b) =>
      scorePost(b, nowMs) - scorePost(a, nowMs) ||
      Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt),
  )[0]!;

  return {
    topSignals,
    topTopics,
    dominantTone: tone,
    anchor,
  };
}
