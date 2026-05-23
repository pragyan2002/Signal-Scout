import type { Post } from '../types.js';

export const EXTRACTION_SYSTEM_PROMPT = `You analyze a single social media post by a startup founder or engineering leader and extract signals useful for sales outreach.

Return JSON ONLY. No commentary, no markdown fences. The JSON must match exactly:

{
  "intentSignals": string[],   // zero or more of: "hiring", "fundraising", "launching", "tool_complaint", "celebrating_win", "seeking_advice", "sharing_learning", "none"
  "topics": string[],          // 0-5 short topic tags, lowercase, 1-3 words each (e.g. "outbound sales", "devops", "fundraising")
  "tone": string               // exactly one of: "excited", "frustrated", "analytical", "reflective", "celebratory", "neutral"
}

Rules:
- Only emit intentSignals that are clearly evidenced in the post. When in doubt, omit. If nothing applies, return ["none"].
- "hiring" means the author is actively looking to hire — not "we grew the team."
- "fundraising" means raising or just-raised, including announcing a round.
- "launching" means shipping a product or new feature publicly.
- "tool_complaint" means expressing dissatisfaction with a specific tool, vendor, or category of software.
- "celebrating_win" is for traction wins (revenue, customers, milestones), not for shipping a product (that's "launching").
- Topics describe what the post is ABOUT, not the emotion. Avoid generic words like "business" or "startup".`;

export function buildExtractionUserPrompt(post: Post): string {
  return `Post by @${post.authorHandle} on ${post.createdAt}:\n\n${post.text}`;
}
