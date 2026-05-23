import type {
  AggregatedSignals,
  ExtractedPost,
  IntentSignal,
  Tone,
} from '../types.js';

const SIGNAL_PRIORITY: Record<IntentSignal, number> = {
  fundraising: 100,
  hiring: 90,
  launching: 85,
  tool_complaint: 80,
  celebrating_win: 60,
  seeking_advice: 50,
  sharing_learning: 30,
  none: 0,
};

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

function scorePost(p: ExtractedPost): number {
  const best = p.signals.intentSignals.reduce(
    (m, s) => Math.max(m, SIGNAL_PRIORITY[s] ?? 0),
    0,
  );
  const recencyBoost = Math.max(
    0,
    14 - (Date.now() - Date.parse(p.post.createdAt)) / (24 * 60 * 60 * 1000),
  );
  return best + recencyBoost;
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
  const anchor = [...pool].sort((a, b) => scorePost(b) - scorePost(a))[0]!;

  return {
    topSignals,
    topTopics,
    dominantTone: tone,
    anchor,
  };
}
