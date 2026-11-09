import type { StudyPacket } from './assistantTypes.js';

export interface ComputerConfig {
  browserMode?: 'window';
  sandboxOrigin: string;
  engine: string;
  isolation: string;
  available: boolean;
  browserAvailable: boolean;
  message: string;
}
export interface ComputerSessionRequest {
  origin: string;
  goal: string;
  reasoningModel: string;
  visionModel: string;
  maxSteps?: number;
  webResearch?: boolean;
}
export interface ComputerStep {
  number: number;
  action: 'observe' | 'open' | 'scroll' | 'read' | 'generate';
  url: string;
  reason: string;
  screenshot?: string;
}
export interface ComputerSession {
  id: string;
  demo?: boolean;
  status: 'running' | 'complete' | 'cancelled' | 'error';
  stage: string;
  label: string;
  steps: ComputerStep[];
  packet?: StudyPacket;
  artifacts?: {name: string; url: string}[];
  error?: string;
  createdAt?: string;
}
