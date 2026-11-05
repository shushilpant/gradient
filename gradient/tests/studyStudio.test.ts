import { describe, it, expect } from 'vitest';
import { parseDeck, reviewCard, practiceOrder } from '../extension/studyStudio.js';
const source = { id: 's1', title: 'Lecture', url: 'https://canvas.example/lecture', text: 'Recursion solves problems by reducing them to smaller instances.', kind: 'canvas' as const };
const raw = { title: 'Recursion', cards: Array.from({length:3}, (_,i) => ({id:`c${i}`, question:`What is recursion ${i}?`, answer:'Smaller instances', options:['Smaller instances','Larger instances','Sorting only','Randomness'], explanation:'It reduces the problem.', topic:'Recursion', sourceId:'s1', quote:source.text})), concepts:[] };
describe('Study studio evidence and review logic', () => {
 it('reports empty, prose-only, and truncated model output without raw JSON errors', () => {
  for (const text of ['', 'Here is a study guide.', '{"title":"unfinished","cards":[{"id":"c1"}']) {
   expect(() => parseDeck(text, [source])).toThrow(/study.set|study set/i);
   expect(() => parseDeck(text, [source])).not.toThrow(/Unexpected end/);
  }
 });
 it('rejects fabricated citations and malformed choices', () => {
  expect(parseDeck(JSON.stringify(raw), [source]).cards).toHaveLength(3);
  const invalid=structuredClone(raw); invalid.cards[0]!.quote='This quote was never in the source.';
  expect(parseDeck(JSON.stringify(invalid),[source]).cards).toHaveLength(2);
  const duplicate=structuredClone(raw); duplicate.cards[0]!.options[1]='Smaller instances';
  expect(parseDeck(JSON.stringify(duplicate),[source]).cards).toHaveLength(2);
  const fabricated=structuredClone(raw); fabricated.cards.forEach(card => { card.quote='Invented evidence that is not in the source.'; });
  expect(()=>parseDeck(JSON.stringify(fabricated),[source])).toThrow(/verifiable/);
 });
 it('brings missed cards back sooner and expands successful review intervals', () => {
  const now=new Date('2026-11-05T12:00:00Z');
  const miss=reviewCard(undefined,false,now); expect(miss.due).toBe('2026-11-05T12:10:00.000Z');
  const first=reviewCard(miss,true,now); expect(first.interval).toBe(1);
  expect(reviewCard(first,true,now).interval).toBe(2);
  const deck=parseDeck(JSON.stringify(raw),[source]);
  expect(practiceOrder(deck, {c2:miss}, now.getTime()+600001)[0]).toBe('c2');
 });
});
