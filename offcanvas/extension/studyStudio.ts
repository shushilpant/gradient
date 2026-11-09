import { z } from 'zod';
export interface StudioSource { id: string; title: string; url: string; text: string; kind: 'canvas' | 'web' }
const evidence = { sourceId: z.string(), quote: z.string().min(12).max(2000) };
export const deckSchema = z.object({
  title: z.string().max(200),
  cards: z.array(z.object({ id: z.string(), question: z.string().min(5).max(1000), answer: z.string().min(1).max(2000), options: z.array(z.string().min(1).max(1000)).length(4), explanation: z.string().max(2000), topic: z.string().max(100), ...evidence })).min(1).max(30),
  concepts: z.array(z.object({ id: z.string(), label: z.string().max(120), explanation: z.string().max(1500), parentId: z.string().nullable(), ...evidence })).max(24),
});
export type StudioDeck = z.infer<typeof deckSchema>;
export interface Review { attempts: number; correct: number; interval: number; due: string; lastCorrect: boolean }
export interface StudioData { sources: StudioSource[]; deck: StudioDeck | null; reviews: Record<string, Review> }
export const emptyStudio = (): StudioData => ({ sources: [], deck: null, reviews: {} });
export function parseDeck(markdown: string, sources: StudioSource[]): StudioDeck {
  const raw = markdown.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model returned no complete study-set JSON. Restart the local assistant to enable structured studio generation, then retry. Your sources and previous set are preserved.');
  let value: unknown;
  try { value = JSON.parse(raw.slice(start, end + 1)); }
  catch { throw new Error('The model returned an incomplete study set. Try fewer sources or a narrower topic. Your sources and previous set are preserved.'); }
  const parsed = deckSchema.safeParse(value);
  if (!parsed.success) throw new Error('The model returned an invalid study-set structure. Restart the local assistant and retry with fewer sources. Your previous set is preserved.');
  const deck = parsed.data;
  for (const item of [...deck.cards, ...deck.concepts]) {
    if (!sources.some(source => source.id === item.sourceId && source.text.includes(item.quote))) {
      const sourceNumber = /^S(\d+)$/.exec(item.sourceId);
      const indexedSource = sourceNumber ? sources[Number(sourceNumber[1]) - 1] : undefined;
      if (indexedSource?.text.includes(item.quote)) { item.sourceId = indexedSource.id; continue; }
      const matches = sources.filter(source => source.text.includes(item.quote));
      if (matches.length === 1) item.sourceId = matches[0]!.id;
    }
  }
  const valid = (item: { sourceId: string; quote: string }) => sources.some(source => source.id === item.sourceId && source.text.includes(item.quote));
  deck.cards = deck.cards.filter(card => valid(card) && new Set(card.options).size === 4 && card.options.filter(option => option === card.answer).length === 1);
  deck.cards = deck.cards.map(card => {
    const options = [...card.options];
    let seed = [...card.question].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 17);
    for (let i = options.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [options[i], options[j]] = [options[j]!, options[i]!]; }
    return { ...card, options };
  });
  deck.concepts = deck.concepts.filter(valid);
  if (!deck.cards.length) throw new Error('No questions had verifiable source passages. Your previous set is preserved.');
  if (new Set(deck.cards.map(card => card.id)).size !== deck.cards.length) throw new Error('The model returned duplicate question IDs. Generate again.');
  const ids = new Set(deck.concepts.map(node => node.id));
  if (ids.size !== deck.concepts.length) throw new Error('The concept map has duplicate nodes. Generate again.');
  deck.concepts = deck.concepts.map(node => ({ ...node, parentId: node.parentId && ids.has(node.parentId) && node.parentId !== node.id ? node.parentId : null }));
  return deck;
}
export function reviewCard(previous: Review | undefined, correct: boolean, now = new Date()): Review {
  const interval = correct ? Math.min(30, previous?.lastCorrect ? Math.max(1, previous.interval * 2) : 1) : 0;
  return { attempts: (previous?.attempts ?? 0) + 1, correct: (previous?.correct ?? 0) + Number(correct), interval, lastCorrect: correct, due: new Date(now.getTime() + (correct ? interval * 86400000 : 10 * 60000)).toISOString() };
}
export function practiceOrder(deck: StudioDeck, reviews: Record<string, Review>, now = Date.now()): string[] {
  return [...deck.cards].sort((a, b) => {
    const rank = (id: string) => !reviews[id] ? 1 : Date.parse(reviews[id]!.due) <= now ? 0 : 2;
    return rank(a.id) - rank(b.id) || (reviews[a.id]?.correct ?? 0) / Math.max(1, reviews[a.id]?.attempts ?? 1) - (reviews[b.id]?.correct ?? 0) / Math.max(1, reviews[b.id]?.attempts ?? 1);
  }).map(card => card.id);
}
const sourceSchema = z.object({ id: z.string(), title: z.string(), url: z.string(), text: z.string().max(22000), kind: z.enum(['canvas', 'web']) });
const storeSchema = z.object({ sources: z.array(sourceSchema).max(20), deck: deckSchema.nullable(), reviews: z.record(z.object({ attempts: z.number(), correct: z.number(), interval: z.number(), due: z.string().datetime(), lastCorrect: z.boolean() })) });
export async function loadStudio(key: string): Promise<StudioData> {
  const raw = typeof chrome !== 'undefined' && chrome.storage?.local ? (await chrome.storage.local.get(key))[key] : JSON.parse(localStorage.getItem(key) || 'null');
  const result = storeSchema.safeParse(raw); return result.success ? result.data : emptyStudio();
}
let writes = Promise.resolve();
export async function saveStudio(key: string, data: StudioData): Promise<void> {
  const value = storeSchema.parse(data);
  const write = writes.catch(() => {}).then(async () => { if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [key]: value }); else localStorage.setItem(key, JSON.stringify(value)); });
  writes = write; return write;
}
