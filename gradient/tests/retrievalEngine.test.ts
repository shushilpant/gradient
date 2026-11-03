import { describe, it, expect } from 'vitest';
import {
  retrieveCourseContent,
  extractKeyConcepts,
} from '../core/retrievalEngine.js';

describe('Stage 8: Course-Grounded Retrieval Engine', () => {
  it('extracts key domain concepts from assignment queries', () => {
    const concepts1 = extractKeyConcepts('Homework 1: Algorithm Complexity & Big-O notation');
    expect(concepts1).toContain('asymptotic notation');

    const concepts2 = extractKeyConcepts('HW 2: Divide and Conquer and Master Theorem recurrences');
    expect(concepts2).toContain('Master Theorem');
    expect(concepts2).toContain('recurrence relation');

    const concepts3 = extractKeyConcepts('HW 3: Dynamic Programming tabulation and memoization table');
    expect(concepts3).toContain('dynamic programming');
  });

  it('ranks course materials higher than open educational resources for the same topic', () => {
    const res = retrieveCourseContent({
      query: 'recurrence relations and recursion tree',
      courseId: '99001',
      topK: 5,
    });

    expect(res.hasRelevantContent).toBe(true);
    expect(res.courseMaterialChunks.length).toBeGreaterThan(0);

    // First ranked chunk MUST be from the student's own course materials
    const topChunk = res.allRankedChunks[0]?.chunk;
    expect(topChunk?.sourceOrigin).toBe('course_material');
    expect(topChunk?.courseId).toBe('99001');
  });

  it('formats citations as "Week X, slide Y" or "Week X, page Y" and preserves Canvas URLs', () => {
    const res = retrieveCourseContent({
      query: 'formal Big-O limit definition and tight bounds',
      courseId: '99001',
    });

    expect(res.courseMaterialChunks.length).toBeGreaterThan(0);
    const top = res.courseMaterialChunks[0]!.chunk;
    expect(top.citation).toMatch(/Week \d+, (slide|page) \d+/);
    expect(top.url).toMatch(/^https:\/\/canvas\.instructure\.com\/courses\/99001\//);
  });

  it('includes license and attribution for allowlisted open sources', () => {
    const res = retrieveCourseContent({
      query: 'comparison sort lower bound decision tree',
      topK: 6,
    });

    expect(res.supplementaryChunks.length).toBeGreaterThan(0);
    const openChunk = res.supplementaryChunks[0]!.chunk;
    expect(openChunk.sourceOrigin).toBe('open_source');
    expect(openChunk.license).toBeDefined();
    expect(openChunk.attribution).toBeDefined();
    expect(res.drawnFrom.openSources.length).toBeGreaterThan(0);
  });

  it('returns hasRelevantContent = false and clear fallback message on completely irrelevant queries', () => {
    const res = retrieveCourseContent({
      query: 'gourmet pastry and sourdough bread fermentation recipes',
      courseId: '99001',
    });

    expect(res.hasRelevantContent).toBe(false);
    expect(res.allRankedChunks.length).toBe(0);
    expect(res.courseMaterialChunks.length).toBe(0);
    expect(res.drawnFrom.courseMaterials.length).toBe(0);
    expect(res.fallbackMessage).toContain('No relevant course materials found');
  });

  it('associates validated Mermaid diagram with retrieved technical topics', () => {
    const res = retrieveCourseContent({
      query: 'Dynamic Programming tabulation state space design',
      courseId: '99001',
    });

    expect(res.diagram).toBeDefined();
    expect(res.diagram?.type).toBe('mermaid');
    expect(res.diagram?.isValid).toBe(true);
    expect(res.diagram?.svg).toContain('<svg');
    expect(res.diagram?.code).toContain('flowchart');
  });
});

