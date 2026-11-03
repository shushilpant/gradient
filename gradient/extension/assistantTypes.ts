export type DetailLevel = 'a_bit' | 'a_bit_more' | 'all_in';

export interface AssistantSettings {
  backendUrl: string;
  reasoningModel: string;
  visionModel: string;
  detailLevel: DetailLevel;
  webResearch: boolean;
}
export interface AssistantHealth {
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
export interface StudyPacket {
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
}
export interface StudyRequest {
  course: { id: string; name: string; code: string };
  assignment: { id: string; title: string; description: string; url: string; dueAt: string | null; rubric?: string };
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
