import type { AggregatedSignals, Prospect } from '../types.js';

export const SNIPPET_SYSTEM_PROMPT = `You write the opening line of a cold outbound message from a startup founder to a prospect. Your job: prove in one sentence that the sender actually read what the prospect posted.

Rules — non-negotiable:

1. Write ONE sentence. Maximum 30 words. No greeting, no signoff.
2. Reference a SPECIFIC detail from the anchor post — a phrase, a number, a tool name, a quoted observation. Generic references ("I saw you're hiring") are failures.
3. Do not start with "I noticed", "I saw", "Hey", or "Hi". Start with something that earns attention.
4. Do not pitch the product in this line. The opener buys the right to pitch later.
5. Do not flatter. Do not say "great post" or "love this." Engage with the substance.
6. Tone: match the prospect's energy. If they're frustrated, be sharp. If they're celebrating, be warm. If analytical, be precise.
7. Output the sentence ONLY — no quotes, no preamble, no explanation.`;

export function buildSnippetUserPrompt(args: {
  prospect: Prospect;
  aggregated: AggregatedSignals;
  icp: string;
  pitch: string;
}): string {
  const { prospect, aggregated, icp, pitch } = args;
  const a = aggregated.anchor;
  return `PROSPECT
Handle: @${prospect.handle} (${prospect.platform})
${prospect.displayName ? `Name: ${prospect.displayName}\n` : ''}Top intent signals: ${aggregated.topSignals.join(', ') || 'none'}
Top topics: ${aggregated.topTopics.join(', ') || 'none'}
Tone: ${aggregated.dominantTone}

ANCHOR POST (the post your opener must reference):
Posted ${a.post.createdAt}
"""
${a.post.text}
"""

YOUR ICP (who we sell to):
${icp.trim()}

YOUR PRODUCT PITCH (for context — do not pitch in the opener):
${pitch.trim()}

Write the opener now. One sentence. Reference a specific detail from the anchor post.`;
}
