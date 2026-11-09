import type { CanvasCourseSnapshot, CanvasSnapshot } from './liveCanvas.js';
import { assignmentMaterials, readCanvasMaterials, type StudyMaterial } from './canvasMaterials.js';

export interface AcademicEvidence {
  courseId: string; courseCode: string; kind: 'course' | 'syllabus' | 'resource' | 'assignment' | 'rubric';
  title: string; url: string; excerpt: string;
}
export interface ResearchInterest { topic: string; courses: string[]; evidence: AcademicEvidence[] }
export interface ResearchSkill { name: string; status: 'demonstrated' | 'inferred'; evidence: AcademicEvidence[] }
export interface AcademicPreferences { researchInterests: string[]; courseCreditHours: Record<string, number>; weeklyStudyHours?: number; gradePointScale?: Record<string, number> }
export interface SyllabusContext { text: string; topics: string[]; learningObjectives: string[] }
export interface AcademicContext {
  accountKey: string; snapshot: CanvasSnapshot; courses: CanvasCourseSnapshot[];
  assignments: { courseId: string; assignment: CanvasCourseSnapshot['assignments'][number] }[];
  preferences: AcademicPreferences;
  syllabi: Map<string, SyllabusContext>;
  research: { interests: ResearchInterest[]; skills: ResearchSkill[] };
  /** Permission-checked text stays in memory, scoped to this sync and account. */
  materials: Map<string, StudyMaterial>;
}
export const RESEARCH_FIELDS = [
  ['computer science', /\b(?:computer science|computer engineering|computer architecture|programming|software development|data structures|algorithms?)\b/i],
  ['machine learning', /\b(?:machine learning|artificial intelligence|neural networks?|deep learning)\b/i],
  ['biology', /\b(?:biology|molecular biology|cell biology|genetics|genomics)\b/i],
  ['chemistry', /\b(?:chemistry|chemical reactions?|organic chemistry|biochemistry)\b/i],
  ['mathematics', /\b(?:mathematics|calculus|linear algebra|abstract algebra|discrete mathematics|probability)\b/i],
  ['physics', /\b(?:physics|quantum mechanics|classical mechanics|electromagnetism)\b/i],
  ['engineering', /\b(?:engineering|circuits|robotics|materials science)\b/i],
  ['environmental science', /\b(?:environmental science|ecology|ecosystems?|climate change|oceanography)\b/i],
  ['psychology', /\b(?:psychology|cognitive science|behavioral science|neuroscience)\b/i],
  ['algorithms', /\balgorithms?\b|\bdata structures\b/i],
  ['robotics', /\brobotics\b|\brobot programming\b/i],
  ['data science', /\b(?:data science|data analysis|statistical analysis)\b/i],
  ['genetics', /\b(?:genetics|genomics)\b/i],
  ['neuroscience', /\bneuroscience\b|\bneural circuitry\b/i],
  ['materials science', /\b(?:materials science|nanomaterials|nanotechnology)\b/i],
  ['bioinformatics', /\b(?:bioinformatics|computational biology)\b/i],
  ['scientific computing', /\b(?:scientific computing|numerical simulation)\b/i],
  ['climate science', /\b(?:climate science|climate change|atmospheric science)\b/i],
  ['cybersecurity', /\b(?:cybersecurity|computer security|cryptography)\b/i],
  ['human-computer interaction', /\bhuman.computer interaction\b|\buser experience research\b/i],
] as const;
const SKILLS = [
  ['Python', /\bPython\b/i], ['Data analysis', /data analysis|statistical analysis/i],
  ['Machine learning', /machine learning|neural network/i], ['Laboratory techniques', /laboratory techniques|lab techniques|pipetting|chromatography/i],
  ['Microscopy', /microscopy|microscope/i], ['Fieldwork', /fieldwork|field work/i], ['Robotics', /robotics|robot programming/i],
  ['Scientific computing', /scientific computing|numerical simulation/i], ['Research communication', /poster presentation|research presentation|scientific writing/i],
] as const;
const contextListeners = new WeakMap<AcademicContext, Set<() => void>>();
export function subscribeAcademicContext(context: AcademicContext, listener: () => void): () => void {
  let listeners = contextListeners.get(context);
  if (!listeners) { listeners = new Set(); contextListeners.set(context, listeners); }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Deterministic extraction; content mentions establish exposure, never proficiency. */
export function academicText(html: string): string {
  return html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&nbsp;|&#160;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}
/** Only explicitly labelled objectives are extracted; missing objectives stay empty. */
export function syllabusContext(html: string): SyllabusContext {
  const text = academicText(html);
  const safe = html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const heading = safe.match(/<h[1-6]\b[^>]*>[^<]*(?:learning|course)\s+(?:objectives|outcomes)[\s\S]*?<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/i)?.[1];
  const labelled = safe.match(/(?:learning|course)\s+(?:objectives|outcomes)\s*:\s*([\s\S]*?)(?:<\/p>|<br\s*\/?>|$)/i)?.[1];
  const section = heading ?? labelled ?? '';
  const list = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => academicText(match[1] ?? '')).filter(Boolean);
  return { text, topics: RESEARCH_FIELDS.filter(([,pattern]) => substantiveMatch(text, pattern)).map(([topic]) => topic),
    learningObjectives: (list.length ? list : section ? [academicText(section)] : []).slice(0, 12).map(item => item.slice(0, 1500)) };
}
function excerpt(text: string, pattern: RegExp): string {
  const relevant = text.split(/(?<=[.!?;])\s+|\n+/).find(sentence => substantiveMatch(sentence, pattern)) ?? text;
  const match = pattern.exec(relevant);
  return relevant.slice(Math.max(0, (match?.index ?? 0) - 80), Math.min(relevant.length, (match?.index ?? 0) + 240));
}
function evidenceFor(context: AcademicContext): { evidence: AcademicEvidence; assessed: boolean }[] {
  return context.courses.flatMap(course => {
    const evidence: { evidence: AcademicEvidence; assessed: boolean }[] = [];
    const add = (kind: AcademicEvidence['kind'], title: string, url: string, text: string, assessed = false) => {
      const plain = academicText(text); if (plain) evidence.push({ evidence: { courseId: course.id, courseCode: course.code, kind, title, url, excerpt: plain }, assessed });
    };
    add('course', course.name, course.url, course.name);
    add('syllabus', `${course.code} syllabus`, course.url + '/assignments/syllabus', context.syllabi.get(course.id)?.text ?? '');
    for (const resource of course.resources ?? []) {
      const material = context.materials.get(`${course.id}|${resource.url}`);
      if (material?.text) add('resource', material.title, material.url, material.text);
    }
    for (const assignment of course.assignments ?? []) {
      add('assignment', assignment.name, assignment.htmlUrl, `${assignment.name} ${assignment.descriptionHtml}`);
      for (const criterion of assignment.rubric ?? []) {
        const assessment = assignment.submission?.rubricAssessment?.[criterion.id];
        // Only a fully scored instructor rubric criterion is labelled demonstrated coursework evidence.
        // This does not claim independent mastery or research readiness.
        const assessed = criterion.points > 0 && !!assessment && assessment.points >= criterion.points;
        add('rubric', `${assignment.name}: ${academicText(criterion.description)}${assessed ? ` (${assessment!.points}/${criterion.points} rubric points)` : ''}`,
          assignment.htmlUrl, criterion.description, assessed);
      }
    }
    return evidence;
  });
}
/** A word occurrence alone is not evidence of a course's academic focus. */
function substantiveMatch(text: string, pattern: RegExp): boolean {
  return text.split(/(?<=[.!?;])\s+|\n+/).some(sentence => {
    if (/\b(?:for example|e\.g\.|such as|examples? (?:include|from)|bibliography|academic integrity|technical requirements|system requirements|computer access|learning management system|software installation)\b/i.test(sentence)) return false;
    const clean = sentence.replace(/\bgenetic (?:algorithms?|programming|optimization)\b/gi, 'optimization')
      .replace(/\b(?:development|programming|computing|execution|learning) environments?\b/gi, 'workspace');
    return pattern.test(clean);
  });
}
function supportedSources(sources: ReturnType<typeof evidenceFor>, pattern: RegExp) {
  const matches = sources.filter(source => substantiveMatch(source.evidence.excerpt, pattern));
  // A title, short course description, or explicitly labelled objective establishes focus.
  // Other body mentions need independent documents from the same course to corroborate them.
  return matches.filter(source => {
    const e = source.evidence;
    if (source.assessed || substantiveMatch(e.title, pattern) || e.kind === 'course') return true;
    if (e.kind === 'resource' && e.excerpt.length < 500) return true;
    if (e.kind === 'syllabus' && (e.excerpt.length < 500 || /(?:learning|course) (?:objectives|outcomes|topics|content)[^.!?]*$/i.test(e.excerpt.slice(0, e.excerpt.search(pattern))))) return true;
    return new Set(matches.filter(other => other.evidence.courseId === e.courseId).map(other => other.evidence.url)).size >= 2;
  });
}
export function refreshResearchProfile(context: AcademicContext): AcademicContext['research'] {
  const sources = evidenceFor(context);
  const interests = RESEARCH_FIELDS.flatMap(([topic, pattern]) => {
    const evidence = supportedSources(sources, pattern).slice(0, 12).map(source => ({ ...source.evidence, excerpt: excerpt(source.evidence.excerpt, pattern) }));
    return evidence.length ? [{ topic, courses: [...new Set(evidence.map(item => item.courseCode))], evidence }] : [];
  });
  const skills = SKILLS.flatMap(([name, pattern]) => {
    const matches = supportedSources(sources, pattern);
    const assessed = matches.filter(source => source.assessed);
    const selected = assessed.length ? assessed : matches;
    return selected.length ? [{ name, status: assessed.length ? 'demonstrated' as const : 'inferred' as const,
      evidence: selected.slice(0, 8).map(source => ({ ...source.evidence, excerpt: excerpt(source.evidence.excerpt, pattern) })) }] : [];
  });
  context.research = { interests, skills };
  contextListeners.get(context)?.forEach(listener => listener());
  return context.research;
}
const contexts = new WeakMap<CanvasSnapshot, AcademicContext>();
let activeContext: AcademicContext | null = null;
export function getAcademicContext(snapshot: CanvasSnapshot): AcademicContext {
  let context = contexts.get(snapshot);
  if (!context) {
    context = { accountKey: `${snapshot.origin}|${snapshot.user?.id ?? ''}`, snapshot, courses: snapshot.courses,
      assignments: snapshot.courses.flatMap(course => (course.assignments ?? []).map(assignment => ({ courseId: course.id, assignment }))),
      preferences: { researchInterests: [], courseCreditHours: {} }, syllabi: new Map(snapshot.courses.map(course => [course.id, syllabusContext(course.syllabusHtml ?? '')])),
      research: { interests: [], skills: [] }, materials: new Map() };
    refreshResearchProfile(context); contexts.set(snapshot, context);
  }
  return context;
}
/** Call with null at refresh start: old account text and late results are invalid immediately. */
export function activateAcademicContext(snapshot: CanvasSnapshot | null): AcademicContext | null {
  const next = snapshot ? getAcademicContext(snapshot) : null;
  if (next !== activeContext && activeContext) { activeContext.materials.clear(); refreshResearchProfile(activeContext); }
  activeContext = next; return next;
}
export function getActiveAcademicContext(): AcademicContext | null { return activeContext; }

type ExtractFile = Parameters<typeof readCanvasMaterials>[3];
export async function readAcademicMaterials(context: AcademicContext, courseId: string, resources: StudyMaterial[], extract: ExtractFile, signal?: AbortSignal): Promise<Awaited<ReturnType<typeof readCanvasMaterials>>> {
  const current = () => { signal?.throwIfAborted(); if (activeContext !== context) throw new DOMException('Academic account context changed. Refresh and try again.', 'AbortError'); };
  current();
  const course = context.courses.find(item => item.id === courseId);
  if (!course) throw new Error('This course is outside the active academic account.');
  const permitted = new Set([...course.resources.map(item => item.url), ...course.assignments.flatMap(assignment => assignmentMaterials(assignment.descriptionHtml, context.snapshot.origin, courseId).map(item => item.url))]);
  const selected = resources.slice(0, 12).map(resource => {
    if (!permitted.has(resource.url)) return { title: resource.title, url: resource.url };
    return context.materials.get(`${courseId}|${resource.url}`) ?? { title: resource.title, url: resource.url };
  });
  // Unlisted links remain references, and cannot cause an authenticated fetch.
  const readable = selected.filter(resource => permitted.has(resource.url));
  const loaded = await readCanvasMaterials(readable, context.snapshot.origin, courseId, extract, signal);
  current();
  for (const material of loaded.resources) if (material.text) {
    context.materials.set(`${courseId}|${material.url}`, material);
    if (context.materials.size > 96) context.materials.delete(context.materials.keys().next().value!);
  }
  refreshResearchProfile(context);
  const byUrl = new Map(loaded.resources.map(resource => [resource.url, resource]));
  return { resources: selected.map(resource => byUrl.get(resource.url) ?? resource), warnings: loaded.warnings };
}
