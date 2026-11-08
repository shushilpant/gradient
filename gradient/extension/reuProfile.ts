import type { CanvasSnapshot } from './liveCanvas.js';
import { getAcademicContext } from './academicContext.js';
export { RESEARCH_FIELDS } from './academicContext.js';
/** Compatibility adapter for callers; extraction is shared across the academic workspace. */
export function researchProfile(snapshot: CanvasSnapshot) {
  return getAcademicContext(snapshot).research.interests;
}
