export type DetailLevel = 'a_bit' | 'a_bit_more' | 'all_in';

export interface AssistantSettings {
  backendUrl: string;
  reasoningModel: string;
  visionModel: string;
  detailLevel: DetailLevel;
  webResearch: boolean;
}
export interface AssistantHealth {
  studioVersion?: number;
  ok: boolean;
  ollamaConnected: boolean;
  models: string[];
  message?: string;
  pullStates?: Record<string, string>;
  modelDetails?: { name: string; size: number; capabilities: string[]; parameterSize?: string; quantization?: string; digest?: string; remote?: boolean }[];
  recommended?: { reasoningModel: string; visionModel: string; contextLength?: number; reason?: string };
  recommendationReason?: string;
}
export interface StudySource {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
  documentText?: string;
  kind?: 'canvas' | 'web';
}
export interface StudyDiagram {
  title: string;
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label?: string }[];
}
export interface StudyGraph {
  title: string;
  xLabel?: string;
  yLabel?: string;
  points: { label: string; value: number }[];
}
export interface StudyImage { title: string; url: string; alt: string; sourceUrl: string }
export interface RenderedVisual {
  id: string; title: string; kind: 'function' | 'data' | 'diagram';
  mimeType: 'image/png'; data: string; caption: string;
  provenance: { sourceId: string; quote: string };
  verification: 'computed' | 'source-data' | 'conceptual';
}
export interface ParsedBrief {
  summary: string;
  requirements: { id: string; text: string; evidence: string }[];
  missingInformation: string[];
}
export interface AssignmentReview {
  coverage: { requirementId: string; status: 'covered' | 'partial' | 'missing'; evidence: string; notes: string }[];
  limitations: string[];
}
export interface StudyProgress { stage: string; label: string }
export interface StudyPacket {
  finalLatex?: string;
  title: string;
  summary: string;
  markdown: string;
  sampleMarkdown: string;
  sources: StudySource[];
  diagrams: StudyDiagram[];
  graphs: StudyGraph[];
  images: StudyImage[];
  warnings: string[];
  checklist?: string[];
  generatedAt?: string;
  autopilot?: boolean;
  brief?: ParsedBrief | null;
  review?: AssignmentReview | null;
  renderedVisuals?: RenderedVisual[];
}
export interface StudyRequest {
  studio?: boolean;
  autopilot?: boolean;
  assignmentKind?: 'homework' | 'other';
  visualPreferences?: { diagrams: boolean; graphs: boolean; images: boolean };
  webSources?: {title:string;url:string;snippet:string}[];
  course: { id: string; name: string; code: string };
  assignment: { id: string; title: string; description: string; url: string; dueAt: string | null; rubric?: string; submissionTypes?: string[] };
  prompt: string;
  level: DetailLevel;
  mode: 'explain' | 'sample';
  model: string;
  webResearch: boolean;
  resources: { title: string; url: string; text?: string }[];
}
export interface BrowserPlanRequest {
  goal: string;
  url: string;
  title: string;
  text: string;
  screenshot?: string;
  model: string;
}
export interface BrowserAction {
  kind: 'open' | 'find' | 'scroll' | 'read';
  description: string;
  url?: string;
  text?: string;
}
export interface BrowserPlan { summary: string; actions: BrowserAction[]; warnings: string[] }
