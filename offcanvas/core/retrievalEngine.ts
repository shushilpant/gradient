import {
  type ContentChunk,
  type RetrievalQuery,
  type RetrievalQueryInput,
  type RetrievalResult,
  type ScoredChunk,
} from './retrievalSchema.js';

export type { RetrievalResult, RetrievalQuery, RetrievalQueryInput, ScoredChunk, ContentChunk };
import { generateConceptDiagram } from './diagramGenerator.js';
import rawMaterials from '../sandbox/fixtures/course_materials.json';

// In-memory corpus of course materials and pre-indexed open corpus
export const DEFAULT_CORPUS: ContentChunk[] = rawMaterials as ContentChunk[];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'what', 'which', 'who', 'how', 'why', 'when', 'where',
  'can', 'could', 'should', 'would', 'do', 'does', 'did', 'having', 'been',
  'this', 'these', 'those', 'their', 'there', 'they', 'we', 'our', 'you', 'your'
]);

/**
 * Tokenizes text into normalized word tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Extracts key domain concepts from an assignment name, description, or student query.
 */
export function extractKeyConcepts(queryOrText: string): string[] {
  const normalized = queryOrText.toLowerCase();
  const concepts: string[] = [];

  const CONCEPT_VOCABULARY: Record<string, string[]> = {
    'asymptotic notation': ['asymptotic', 'big-o', 'big o', 'upper bound', 'omega', 'theta', 'tight bound'],
    'Master Theorem': ['master theorem', 'divide and conquer recurrence', 'critical exponent'],
    'recurrence relation': ['recurrence', 'recursive call', 'recursion tree', 't(n)'],
    'loop invariants': ['loop invariant', 'induction on loop', 'maintenance condition'],
    'MergeSort': ['mergesort', 'merge sort', 'linear merge', 'inversion count'],
    'dynamic programming': ['dynamic programming', 'dp', 'tabulation', 'memoization', 'overlapping subproblems'],
    'optimal substructure': ['optimal substructure', 'subproblem optimality', 'greedy choice'],
    'knapsack problem': ['knapsack', '0/1 knapsack', 'pseudo-polynomial'],
    'graph traversals': ['bfs', 'dfs', 'breadth-first', 'depth-first', 'traversal'],
    'Dijkstra algorithm': ['dijkstra', 'shortest path', 'min-heap priority'],
    'greedy algorithms': ['greedy', 'exchange argument', 'interval scheduling'],
    'empirical benchmarking': ['empirical', 'benchmark', 'wall-clock', 'perf_counter', 'timing trial', 'variance'],
    'software engineering': ['edge case', 'unit test', 'modularity', 'pure function'],
    'mathematical induction': ['induction', 'inductive step', 'base case', 'strong induction'],
    'characteristic equation': ['characteristic equation', 'linear recurrence', 'roots'],
    'microscopy': ['microscope', 'microscopy', 'numerical aperture', 'magnification'],
    'enzyme kinetics': ['enzyme', 'michaelis-menten', 'km', 'vmax', 'competitive inhibition', 'lineweaver-burk'],
    'sorting lower bound': ['comparison sort', 'decision tree', 'stirling approximation', 'omega(n log n)'],
  };

  for (const [canonical, variants] of Object.entries(CONCEPT_VOCABULARY)) {
    for (const v of variants) {
      if (normalized.includes(v)) {
        if (!concepts.includes(canonical)) {
          concepts.push(canonical);
        }
        break;
      }
    }
  }

  // If no canonical concepts matched, use top unique non-stopwords
  if (concepts.length === 0) {
    const tokens = tokenize(queryOrText);
    const unique = Array.from(new Set(tokens)).slice(0, 4);
    concepts.push(...unique);
  }

  return concepts;
}

/**
 * Computes BM25-inspired term frequency and concept match score between query and chunk.
 */
export function scoreChunk(
  queryTokens: string[],
  extractedConcepts: string[],
  chunk: ContentChunk,
  targetCourseId?: string
): { score: number; matchedConcepts: string[] } {
  const chunkTextTokens = tokenize(chunk.content + ' ' + chunk.title);
  const chunkTokenSet = new Set(chunkTextTokens);

  let termMatches = 0;
  for (const qt of queryTokens) {
    if (chunkTokenSet.has(qt)) {
      termMatches++;
    } else {
      // Partial prefix matching for roots
      for (const ct of chunkTokenSet) {
        if (ct.startsWith(qt) || qt.startsWith(ct)) {
          termMatches += 0.5;
          break;
        }
      }
    }
  }

  const tfScore = queryTokens.length > 0 ? termMatches / queryTokens.length : 0;

  // Concept matching bonus
  const matchedConcepts: string[] = [];
  const chunkConcepts = chunk.keyConcepts.map((c) => c.toLowerCase());

  for (const ec of extractedConcepts) {
    const ecLower = ec.toLowerCase();
    const hasConceptMatch = chunkConcepts.some(
      (cc) => cc.includes(ecLower) || ecLower.includes(cc)
    );
    if (hasConceptMatch) {
      matchedConcepts.push(ec);
    }
  }

  const conceptScore =
    extractedConcepts.length > 0 ? matchedConcepts.length / extractedConcepts.length : 0;

  // Course specificity boost
  let courseBoost = 1.0;
  if (targetCourseId && chunk.courseId === targetCourseId) {
    courseBoost = 1.25;
  }

  // Course Materials vs Open Source Priority:
  // Course materials receive a 1.2x weight to ensure course materials rank above supplementary open sources
  const originBoost = chunk.sourceOrigin === 'course_material' ? 1.2 : 0.85;

  const compositeScore = (tfScore * 0.45 + conceptScore * 0.55) * courseBoost * originBoost;

  return {
    score: Math.min(compositeScore, 1.0),
    matchedConcepts,
  };
}

/**
 * Executes grounded retrieval over course content and allowlisted open corpus.
 */
export function retrieveCourseContent(
  queryInput: RetrievalQueryInput,
  corpus: ContentChunk[] = DEFAULT_CORPUS
): RetrievalResult {
  const queryText = queryInput.query.trim();
  const topK = queryInput.topK ?? 5;
  const minScore = queryInput.minRelevanceScore ?? 0.15;
  const targetCourseId = queryInput.courseId;

  const queryTokens = tokenize(queryText);
  const extractedConcepts = extractKeyConcepts(queryText);

  if (queryTokens.length === 0 && extractedConcepts.length === 0) {
    return {
      query: queryText,
      hasRelevantContent: false,
      extractedConcepts: [],
      courseMaterialChunks: [],
      supplementaryChunks: [],
      allRankedChunks: [],
      drawnFrom: { courseMaterials: [], openSources: [] },
      fallbackMessage: 'No search terms provided.',
    };
  }

  const scored: Array<{ chunk: ContentChunk; score: number; matchedConcepts: string[] }> = [];

  for (const chunk of corpus) {
    // If target course specified, skip chunks from other specific Canvas courses (but keep open sources)
    if (targetCourseId && chunk.courseId !== 'open' && chunk.courseId !== targetCourseId) {
      continue;
    }

    const { score, matchedConcepts } = scoreChunk(
      queryTokens,
      extractedConcepts,
      chunk,
      targetCourseId
    );

    if (score >= minScore) {
      scored.push({ chunk, score, matchedConcepts });
    }
  }

  // Sort: course materials first (descending score), then open sources (descending score)
  scored.sort((a, b) => {
    if (a.chunk.sourceOrigin !== b.chunk.sourceOrigin) {
      return a.chunk.sourceOrigin === 'course_material' ? -1 : 1;
    }
    return b.score - a.score;
  });

  const rankedChunks: ScoredChunk[] = scored.slice(0, topK).map((item, idx) => ({
    chunk: item.chunk,
    score: Math.round(item.score * 100) / 100,
    matchedConcepts: item.matchedConcepts,
    rank: idx + 1,
  }));

  const courseMaterialChunks = rankedChunks.filter(
    (c) => c.chunk.sourceOrigin === 'course_material'
  );
  const supplementaryChunks = rankedChunks.filter(
    (c) => c.chunk.sourceOrigin === 'open_source'
  );

  const hasRelevantContent = rankedChunks.length > 0;

  // Unique source summaries
  const drawnCourseMaterials = Array.from(
    new Set(courseMaterialChunks.map((c) => `${c.chunk.courseName}: ${c.chunk.citation} (${c.chunk.title})`))
  );

  const drawnOpenSources = Array.from(
    new Set(
      supplementaryChunks.map(
        (c) => `${c.chunk.courseName} [${c.chunk.license ?? 'Open Source'}]`
      )
    )
  );

  // Generate concept relationship diagram if relevant
  const diagram = hasRelevantContent
    ? generateConceptDiagram([...extractedConcepts, queryText]) ?? undefined
    : undefined;

  return {
    query: queryText,
    hasRelevantContent,
    extractedConcepts,
    courseMaterialChunks,
    supplementaryChunks,
    allRankedChunks: rankedChunks,
    drawnFrom: {
      courseMaterials: drawnCourseMaterials,
      openSources: drawnOpenSources,
    },
    diagram,
    fallbackMessage: hasRelevantContent
      ? undefined
      : `No relevant course materials found for "${queryText}". Please consult your instructor or TA during office hours.`,
  };
}

