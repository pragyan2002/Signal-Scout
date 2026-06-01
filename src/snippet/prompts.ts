import type { AggregatedSignals, Prospect } from '../types.js';

export const SNIPPET_SYSTEM_PROMPT = `You write the opening line of a cold outbound message from a startup founder to a prospect.

Before writing, complete this internal check (do NOT include it in your output):
State in one sentence exactly what the prospect did or said — the specific action, claim, or frustration, not a paraphrase or generalization. Then ask: does your opener directly reference that thing WITHOUT repeating their exact words, phrases, or numbers? If not, rewrite until it does.

Rules — non-negotiable:

1. ONE sentence. Under 25 words. No greeting, no signoff.
2. Make a specific CLAIM or OBSERVATION that only works for this exact post. If it could apply to any founder who posted something similar, it's wrong.
3. Do NOT restate what the prospect said. Do not echo their exact words, phrases, or numbers back. Reference the meaning and implication — not the phrasing.
4. Banned phrases: "testament to", "resonates with", "marks the start of", "I noticed", "I saw", "impressive", "excited", "love this", "great post".
5. Tone: smart peer, not salesperson. Write like you read the post and had an honest reaction — not like you're warming someone up to pitch them.
6. Do not pitch the product in this line.
7. Output the sentence ONLY — no quotes, no preamble, no explanation.

<example>
Post: "Just pushed the migration we'd been dreading for 8 months. Turned out the dread was the whole problem — took 4 hours."
Bad opener: "You've been dreading this migration for 8 months and finally shipped it in 4 hours." (echoes their numbers)
Good opener: "Dreading a migration for 8 months and shipping it in 4 hours suggests the real bottleneck was the decision, not the work."
</example>`;

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

If the anchor post does not contain enough specific detail to make a grounded observation, write a simpler honest sentence about what the prospect did. Never invent details not present in the post text. Do not infer outcomes, implications, or next steps not explicitly stated in the post. Fabricating specifics is worse than being plain.

Write the opener now. One sentence. Reference a specific detail from the anchor post.`;
}
