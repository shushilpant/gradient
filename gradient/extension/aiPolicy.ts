/** Deterministic reading of a syllabus's stated AI rules. Quotes the source sentence; never infers permission. */
export type PolicyStance = 'restricted' | 'conditional' | 'allowed' | 'unstated';
export interface CoursePolicy { stance: PolicyStance; sentence: string | null }

const MENTIONS_AI = /\b(generative ai|artificial intelligence|chat ?gpt|large language models?|llms?|copilot|gemini|claude|ai[- ](tools?|use|usage|assistance|assistants?|generated|policy|collaboration))\b/i;
const RESTRICTS = /\b(prohibit\w*|forbid\w*|ban(ned)?|not (be )?(permitted|allowed)|may not|must not|cannot|can't|is not acceptable|unauthori[sz]ed|academic (dishonesty|misconduct))\b/i;
const CONDITIONS = /\b(disclos\w*|cite|citation|acknowledg\w*|with (prior )?(written )?(permission|authori[sz]ation|approval)|provided that|as long as|only (for|when|if)|exclusively)\b/i;
const ALLOWS = /\b(permitted|allowed|encouraged|welcome|may use|can use|are free to)\b/i;
const RANK: Record<PolicyStance, number> = { unstated: 0, allowed: 1, conditional: 2, restricted: 3 };

function text(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').replace(/\.(\s*\.)+/g, '.').trim();
}

function classify(sentence: string): PolicyStance {
  if (RESTRICTS.test(sentence)) return 'restricted';
  if (ALLOWS.test(sentence)) return CONDITIONS.test(sentence) ? 'conditional' : 'allowed';
  return CONDITIONS.test(sentence) ? 'conditional' : 'unstated';
}

export function readAiPolicy(syllabusHtml: string): CoursePolicy {
  const sentences = text(syllabusHtml).split(/(?<=[.!?])\s+/).map(s => s.replace(/^[.\s]+/, '').trim()).filter(s => s.length > 12 && MENTIONS_AI.test(s));
  let best: CoursePolicy = { stance: 'unstated', sentence: null };
  for (const sentence of sentences) {
    const stance = classify(sentence);
    if (RANK[stance] > RANK[best.stance]) best = { stance, sentence };
  }
  return best;
}
