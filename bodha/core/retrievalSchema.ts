import { z } from 'zod';

export type SourceOrigin = 'course_material' | 'open_source';
export type ItemType = 'page' | 'slide' | 'file' | 'open_source';

export const ContentChunkSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  courseName: z.string().min(1),
  moduleId: z.string().optional(),
  moduleName: z.string().optional(),
  week: z.string(), // e.g. "Week 1", "Week 5", "Supplementary"
  itemType: z.enum(['page', 'slide', 'file', 'open_source']),
  title: z.string().min(1),
  pageOrSlideNumber: z.number().int().positive().optional(),
  url: z.string().url().or(z.string().startsWith('/')),
  content: z.string().min(10),
  keyConcepts: z.array(z.string()),
  citation: z.string().min(1), // e.g. "Week 1, slide 12" or "Week 5, page 2"
  sourceOrigin: z.enum(['course_material', 'open_source']),
  license: z.string().optional(),
  attribution: z.string().optional(),
});

export type ContentChunk = z.infer<typeof ContentChunkSchema>;

export const ConceptRelationshipDiagramSchema = z.object({
  type: z.enum(['mermaid', 'graphviz']),
  title: z.string().min(1),
  description: z.string().min(1),
  code: z.string().min(1),
  svg: z.string().min(1),
  isValid: z.boolean(),
});

export type ConceptRelationshipDiagram = z.infer<typeof ConceptRelationshipDiagramSchema>;

export const RetrievalQuerySchema = z.object({
  query: z.string().min(1),
  courseId: z.string().optional(),
  assignmentId: z.string().optional(),
  topK: z.number().int().positive().default(5),
  minRelevanceScore: z.number().min(0).max(1).default(0.15),
});

export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;
export type RetrievalQueryInput = z.input<typeof RetrievalQuerySchema>;

export const ScoredChunkSchema = z.object({
  chunk: ContentChunkSchema,
  score: z.number(),
  matchedConcepts: z.array(z.string()),
  rank: z.number().int().positive(),
});

export type ScoredChunk = z.infer<typeof ScoredChunkSchema>;

export const RetrievalResultSchema = z.object({
  query: z.string(),
  hasRelevantContent: z.boolean(),
  extractedConcepts: z.array(z.string()),
  courseMaterialChunks: z.array(ScoredChunkSchema),
  supplementaryChunks: z.array(ScoredChunkSchema),
  allRankedChunks: z.array(ScoredChunkSchema),
  drawnFrom: z.object({
    courseMaterials: z.array(z.string()),
    openSources: z.array(z.string()),
  }),
  diagram: ConceptRelationshipDiagramSchema.optional(),
  fallbackMessage: z.string().optional(),
});

export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

