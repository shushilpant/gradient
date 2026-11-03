import { CanvasAdapter } from './adapter/canvasAdapter.js';
import type { CourseOptimizationInput } from '../core/optimiser.js';
import type { Assignment, Submission } from '../core/schema.js';

/** A fresh, in-memory view of the signed-in student's own Canvas account. */
export interface CanvasSyncIssue { courseId?: string; section: string; message: string }
export interface CanvasResource {
  id: string; type: 'module' | 'page' | 'file'; title: string; url: string;
  source?: 'index' | 'module' | 'course-link';
}
/** Counts describe discovered links, not independently verified file/page permissions. */
export interface CanvasMaterialAccess {
  section: 'Pages' | 'Files';
  status: 'direct' | 'module-links' | 'unavailable';
  count: number;
  reason?: string;
}
export interface CanvasAnnouncement { id: string; title: string; bodyHtml: string; postedAt: string | null; url: string }
export interface CanvasCalendarEvent { id: string; title: string; startAt: string | null; endAt: string | null; url: string }
export interface CanvasLiveAssignment extends Assignment {
  htmlUrl: string;
  descriptionHtml: string;
  submission: Submission | null;
}
export interface CanvasCourseSnapshot {
  id: string;
  name: string;
  code: string;
  url: string;
  syllabusHtml: string;
  input: CourseOptimizationInput;
  currentScore: number | null;
  finalScore: number | null;
  assignments: CanvasLiveAssignment[];
  resources: CanvasResource[];
  materialAccess?: CanvasMaterialAccess[];
  announcements: CanvasAnnouncement[];
  calendarEvents: CanvasCalendarEvent[];
  issues: CanvasSyncIssue[];
}
export interface CanvasSnapshot {
  origin: string;
  syncedAt: string;
  user: { id: string; name: string; shortName: string; avatarUrl?: string };
  courses: CanvasCourseSnapshot[];
  issues: CanvasSyncIssue[];
}
export interface LoadCanvasOptions {
  courseId?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  /** Only configurable outside a browser (tests); browser requests always use its own origin. */
  origin?: string;
}

type RecordData = Record<string, any>;
const adapter = new CanvasAdapter();
const MAX_PAGES = 25;

export class CanvasAuthenticationError extends Error {
  constructor() {
    super('Your Canvas session has expired. Sign in to Canvas, then refresh GRADIENT.');
    this.name = 'CanvasAuthenticationError';
  }
}
class CanvasEndpointError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function message(error: unknown): string {
  if (error instanceof CanvasEndpointError && error.status === 403) return 'Canvas has restricted access to this section.';
  return error instanceof Error ? error.message : 'Canvas could not load this section.';
}
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
function studentEnrollment(course: RecordData): RecordData | undefined {
  return Array.isArray(course.enrollments) ? course.enrollments.find((e: RecordData) =>
    (e.type === 'student' || e.type === 'StudentEnrollment' || e.role === 'StudentEnrollment') &&
    (!e.enrollment_state || e.enrollment_state === 'active')) : undefined;
}
function sameOriginUrl(value: unknown, fallback: string, origin: string): string {
  try {
    const url = new URL(typeof value === 'string' ? value : fallback, origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) ? url.href : new URL(fallback, origin).href;
  } catch { return new URL(fallback, origin).href; }
}

function visibleToStudent(record: RecordData): boolean {
  return record.locked_for_user !== true && record.hidden_for_user !== true &&
    record.published !== false && record.state !== 'locked' &&
    record.content_details?.locked_for_user !== true;
}
function decodeHtmlText(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}
/** Discover only same-origin links returned in this course's own published content. */
function courseLinkedResources(html: string, courseId: string, origin: string): CanvasResource[] {
  const resources: CanvasResource[] = [];
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const [, attributes = '', contents = ''] of anchors) {
    const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!href) continue;
    try {
      const url = new URL(decodeHtmlText(href[1] ?? href[2] ?? ''), origin);
      if (url.origin !== origin) continue;
      const courseFile = url.pathname.match(/^\/courses\/([^/]+)\/files\/(\d+)(?:\/|$)/);
      const globalFile = url.pathname.match(/^\/files\/(\d+)(?:\/|$)/);
      const page = url.pathname.match(/^\/courses\/([^/]+)\/pages\/([^/]+)\/?$/);
      if (courseFile && courseFile[1] !== courseId) continue;
      if (page && page[1] !== courseId) continue;
      if (!courseFile && !globalFile && !page) continue;
      const type = page ? 'page' as const : 'file' as const;
      const contentId = page ? decodeURIComponent(page[2]!) : courseFile?.[2] ?? globalFile?.[1];
      if (!contentId) continue;
      const title = decodeHtmlText(contents.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      resources.push({ id: contentId, type, title: title || (page ? 'Course page' : 'Course file'),
        url: page ? `${origin}/courses/${courseId}/pages/${encodeURIComponent(contentId)}` : `${origin}/courses/${courseId}/files/${contentId}`,
        source: 'course-link' });
    } catch { /* Malformed links are not Canvas resources. */ }
  }
  return resources;
}

/** All requests are GETs, use the current tab's session, and are never cached to disk. */
export async function loadCanvasSnapshot(options: LoadCanvasOptions = {}): Promise<CanvasSnapshot> {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const origin = new URL(browserOrigin ?? options.origin ?? 'https://canvas.instructure.com').origin;
  if (browserOrigin && options.origin && new URL(options.origin).origin !== browserOrigin) {
    throw new Error('Canvas sync must use the current tab’s origin.');
  }
  if (!origin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Error('Canvas sync requires HTTPS.');
  }
  let active = 0;
  const waiters: Array<() => void> = [];
  const get = async (target: string): Promise<{ data: any; headers: Headers }> => {
    const url = new URL(target, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/v1/')) {
      throw new Error('Canvas returned an unsafe pagination URL.');
    }
    if (active >= 4) await new Promise<void>(resolve => waiters.push(resolve));
    else active++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; abort(); }, 20000);
    try {
      let response: Response;
      for (let attempt = 0; ; attempt++) {
        response = await fetch(url.href, {
          method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        const throttled = response.status === 429 || (response.status === 403 && response.headers.get('X-Rate-Limit-Remaining') === '0');
        if (!throttled || attempt >= 2) break;
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const requestedDelay = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
        const delay = Math.min(10000, Math.max(0, Number.isFinite(requestedDelay) ? requestedDelay : 500 * 2 ** attempt));
        await response.body?.cancel();
        options.onProgress?.('Canvas is busy. Retrying your sync…');
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(new DOMException('Canvas sync was cancelled.', 'AbortError')); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, delay);
          controller.signal.addEventListener('abort', cancel, { once: true });
          if (controller.signal.aborted) cancel();
        });
      }
      if (response.status === 401) throw new CanvasAuthenticationError();
      if (!response.ok) {
        // Canvas also represents exhausted rate limits as 403; it is not an instructor restriction.
        const status = response.status === 403 && response.headers.get('X-Rate-Limit-Remaining') === '0' ? 429 : response.status;
        throw new CanvasEndpointError(status, `Canvas returned HTTP ${status}.`);
      }
      let data: any;
      try {
        // Older self-hosted Canvas versions prefix session-authenticated JSON for hijacking protection.
        const body = (await response.text()).replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, '');
        data = JSON.parse(body);
      } catch { throw new CanvasAuthenticationError(); }
      if (data?.errors || data?.status === 'unauthorized') throw new CanvasEndpointError(403, 'Canvas denied access to this section.');
      if (data?.message && !data.id && !Array.isArray(data)) throw new CanvasEndpointError(403, String(data.message));
      return { data, headers: response.headers };
    } catch (error) {
      if (timedOut && !options.signal?.aborted) throw new CanvasEndpointError(0, 'Canvas took too long to respond. Refresh to try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      const nextWaiter = waiters.shift();
      if (nextWaiter) nextWaiter();
      else active--;
    }
  };
  const all = async (path: string): Promise<RecordData[]> => {
    const result: RecordData[] = [];
    let next: string | null = new URL(path, origin).href;
    const visited = new Set<string>();
    for (let page = 0; next && page < MAX_PAGES; page++) {
      if (visited.has(next)) throw new Error('Canvas returned a repeated pagination page.');
      visited.add(next);
      const { data, headers } = await get(next);
      if (!Array.isArray(data)) throw new Error('Canvas returned an unexpected list response.');
      result.push(...data);
      const match = headers.get('Link')?.match(/<([^>]+)>\s*;\s*rel="?next"?/);
      next = match?.[1] ? new URL(match[1], origin).href : null;
    }
    if (next) throw new Error('This Canvas section is too large to sync completely.');
    return result;
  };
  const query = (path: string, params: Record<string, string | string[]> = {}): string => {
    const url = new URL(path, origin);
    url.searchParams.set('per_page', '100');
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
    }
    return url.href;
  };
  options.onProgress?.('Connecting to your Canvas account…');
  const profile = (await get('/api/v1/users/self/profile')).data as RecordData;
  if (!profile?.id) throw new CanvasAuthenticationError();
  const courseList = await all(query('/api/v1/courses', {
    enrollment_type: 'student', enrollment_state: 'active', 'include[]': ['total_scores', 'syllabus_body'],
  }));
  const studentCourses = courseList.filter(c => studentEnrollment(c) && c.workflow_state !== 'deleted');
  studentCourses.sort((a, b) => Number(String(b.id) === options.courseId) - Number(String(a.id) === options.courseId));
  const issues: CanvasSyncIssue[] = [];
  let loaded = 0;
  const loadCourse = async (raw: RecordData): Promise<CanvasCourseSnapshot | null> => {
    const id = String(raw.id);
    const courseIssues: CanvasSyncIssue[] = [];
    const materialFailures = new Map<'Pages' | 'Files', string>();
    const optional = async (section: string, path: string): Promise<RecordData[]> => {
      try { return await all(path); } catch (error) {
        if (error instanceof CanvasAuthenticationError || isAbort(error)) throw error;
        courseIssues.push({ courseId: id, section, message: message(error) });
        return [];
      }
    };
    const materialIndex = async (section: 'Pages' | 'Files', path: string): Promise<RecordData[]> => {
      try { return await all(path); } catch (error) {
        if (error instanceof CanvasAuthenticationError || isAbort(error)) throw error;
        const expected = error instanceof CanvasEndpointError && [403, 404].includes(error.status);
        materialFailures.set(section, expected
          ? `Canvas does not expose this course's ${section} index (HTTP ${error.status}).`
          : message(error));
        if (!expected) courseIssues.push({ courseId: id, section, message: message(error) });
        return [];
      }
    };
    try {
      const prefix = `/api/v1/courses/${encodeURIComponent(id)}`;
      const [groups, assignments, selfSubmissions] = await Promise.all([
        all(query(`${prefix}/assignment_groups`)),
        all(query(`${prefix}/assignments`, { 'include[]': ['submission', 'rubric'] })),
        optional('Submissions', query(`${prefix}/students/submissions`, { 'student_ids[]': 'self', 'include[]': ['rubric_assessment', 'submission_comments'] })),
      ]);
      const normalizedAssignments = adapter.parseAssignments(assignments);
      const byAssignment = new Map(assignments.filter(a => a.submission).map(a => [String(a.id), a.submission]));
      for (const submission of selfSubmissions) byAssignment.set(String(submission.assignment_id), submission);
      // Canvas occasionally emits null excused flags and hides score fields. The adapter normalizes them.
      const normalizedSubmissions = adapter.parseSubmissions([...byAssignment.values()]).map(submission => {
        const source = byAssignment.get(submission.assignmentId);
        if (source?.rubric_assessment && typeof source.rubric_assessment === 'object') {
          submission.rubricAssessment = Object.fromEntries(Object.entries(source.rubric_assessment as Record<string, RecordData>).map(([key, value]) => [key, {
            points: Math.max(0, Number(value.points) || 0), ratingId: value.rating_id == null ? undefined : String(value.rating_id), comments: typeof value.comments === 'string' ? value.comments : undefined,
          }]));
        }
        if (Array.isArray(source?.submission_comments)) {
          submission.submissionComments = source.submission_comments.map((c: RecordData) => ({ authorName: String(c.author_name ?? 'Instructor'), comment: String(c.comment ?? ''), createdAt: c.created_at }));
        }
        return submission;
      });
      const submissionMap = new Map(normalizedSubmissions.map(s => [s.assignmentId, s]));
      const [modules, pages, files, announcements, calendarEvents, enrollments, tabs] = await Promise.all([
        optional('Modules', query(`${prefix}/modules`, { 'include[]': ['items'] })),
        materialIndex('Pages', query(`${prefix}/pages`)),
        materialIndex('Files', query(`${prefix}/files`)),
        optional('Announcements', query('/api/v1/announcements', { 'context_codes[]': `course_${id}` })),
        optional('Calendar', query('/api/v1/calendar_events', { 'context_codes[]': `course_${id}` })),
        optional('Grade totals', query(`${prefix}/enrollments`, { user_id: 'self', 'type[]': 'StudentEnrollment' })),
        // Navigation visibility describes the index, not permissions on individual module items.
        all(query(`${prefix}/tabs`)).catch(error => {
          if (error instanceof CanvasAuthenticationError || isAbort(error)) throw error;
          return [];
        }),
      ]);
      await Promise.all(modules.filter(visibleToStudent).map(async module => {
        if (typeof module.items_count === 'number' && module.items_count > (module.items?.length ?? 0)) {
          module.items = await optional('Module items', query(`${prefix}/modules/${module.id}/items`));
        }
      }));
      const enrollment = enrollments.find(e => String(e.user_id) === String(profile.id) && (e.type === 'StudentEnrollment' || e.role === 'StudentEnrollment')) ?? studentEnrollment(raw) ?? {};
      const resourceMap = new Map<string, CanvasResource>();
      const blockedResourceKeys = new Set<string>();
      const addResource = (key: string, resource: CanvasResource) => {
        if (!blockedResourceKeys.has(key) && !resourceMap.has(key)) resourceMap.set(key, resource);
      };
      const pageKey = (slug: unknown, pageId: unknown) => `page:${String(slug ?? pageId)}`;
      const modulePageSlug = (item: RecordData): unknown => item.page_url ?? (typeof item.html_url === 'string'
        ? new URL(sameOriginUrl(item.html_url, `/courses/${id}/modules/items/${item.id}`, origin)).pathname.match(/\/pages\/([^/]+)\/?$/)?.[1]
        : undefined);
      for (const file of files.filter(f => !visibleToStudent(f))) blockedResourceKeys.add(`file:${file.id}`);
      for (const page of pages.filter(p => !visibleToStudent(p))) blockedResourceKeys.add(pageKey(page.url, page.page_id));
      for (const module of modules) {
        for (const item of Array.isArray(module.items) ? module.items : []) {
          if (visibleToStudent(module) && visibleToStudent(item)) continue;
          if (item.type === 'File' && item.content_id != null) blockedResourceKeys.add(`file:${item.content_id}`);
          if (item.type === 'Page' && modulePageSlug(item)) blockedResourceKeys.add(pageKey(modulePageSlug(item), item.content_id));
        }
      }
      for (const page of pages.filter(visibleToStudent)) {
        addResource(pageKey(page.url, page.page_id), { id: String(page.page_id ?? page.url), type: 'page',
          title: String(page.title ?? 'Page'), url: sameOriginUrl(page.html_url, `/courses/${id}/pages/${encodeURIComponent(page.url ?? '')}`, origin), source: 'index' });
      }
      for (const file of files.filter(visibleToStudent)) {
        addResource(`file:${file.id}`, { id: String(file.id), type: 'file', title: String(file.display_name ?? file.filename ?? 'File'),
          url: `${origin}/courses/${id}/files/${file.id}`, source: 'index' });
      }
      for (const module of modules.filter(visibleToStudent)) {
        addResource(`module:${module.id}`, { id: String(module.id), type: 'module', title: String(module.name ?? 'Module'),
          url: `${origin}/courses/${id}/modules#module_${module.id}`, source: 'module' });
        for (const item of Array.isArray(module.items) ? module.items : []) {
          if (!['Page', 'File'].includes(item.type) || !visibleToStudent(item)) continue;
          const type = item.type === 'File' ? 'file' as const : 'page' as const;
          const slug = modulePageSlug(item);
          const key = type === 'file' ? `file:${item.content_id ?? `module-item-${item.id}`}` : pageKey(slug, item.content_id ?? `module-item-${item.id}`);
          addResource(key, { id: `module-item-${item.id}`, type, title: String(item.title ?? 'Course resource'),
            url: sameOriginUrl(item.html_url, `/courses/${id}/modules/items/${item.id}`, origin), source: 'module' });
        }
      }
      const courseHtml = [raw.syllabus_body, ...assignments.map(a => a.description), ...announcements.map(a => a.message)];
      for (const html of courseHtml) {
        if (typeof html !== 'string') continue;
        for (const resource of courseLinkedResources(html, id, origin)) addResource(`${resource.type}:${resource.id}`, resource);
      }
      const resources = [...resourceMap.values()];
      const materialAccess: CanvasMaterialAccess[] = (['Pages', 'Files'] as const).map(section => {
        const type = section === 'Pages' ? 'page' : 'file';
        const count = resources.filter(r => r.type === type).length;
        const failure = materialFailures.get(section);
        const navigation = tabs.find(t => t.id === section.toLowerCase());
        const reason = failure && navigation?.hidden === true
          ? `The ${section} navigation tab is hidden. ${failure}` : failure;
        return { section, status: failure ? count > 0 ? 'module-links' : 'unavailable' : 'direct', count, reason };
      });
      let courseForAdapter = raw;
      if (Number(raw.grading_standard_id) > 0 && !Array.isArray(raw.grading_standard) && !Array.isArray(raw.grading_scheme)) {
        try {
          const standard = (await get(`${prefix}/grading_standards/${raw.grading_standard_id}`)).data;
          if (Array.isArray(standard?.grading_scheme)) courseForAdapter = { ...raw, grading_scheme: standard.grading_scheme };
        } catch (error) {
          if (error instanceof CanvasAuthenticationError || isAbort(error)) throw error;
          courseIssues.push({ courseId: id, section: 'Grading scheme', message: message(error) });
        }
      }
      const input: CourseOptimizationInput = {
        course: adapter.parseCourse(courseForAdapter, 3), groups: adapter.parseAssignmentGroups(groups),
        assignments: normalizedAssignments, submissions: normalizedSubmissions, priorityWeight: 1,
      };
      return {
        id, name: String(raw.name), code: String(raw.course_code ?? raw.name), url: `${origin}/courses/${id}`,
        syllabusHtml: typeof raw.syllabus_body === 'string' ? raw.syllabus_body : '', input,
        currentScore: numberOrNull(enrollment.grades?.current_score ?? enrollment.computed_current_score),
        finalScore: numberOrNull(enrollment.grades?.final_score ?? enrollment.computed_final_score),
        assignments: normalizedAssignments.map((assignment, i) => ({ ...assignment,
          htmlUrl: sameOriginUrl(assignments[i]?.html_url, `/courses/${id}/assignments/${assignment.id}`, origin),
          descriptionHtml: typeof assignments[i]?.description === 'string' ? assignments[i].description : '',
          submission: submissionMap.get(assignment.id) ?? null,
        })), resources, materialAccess,
        announcements: announcements.map(a => ({ id: String(a.id), title: String(a.title ?? 'Announcement'), bodyHtml: String(a.message ?? ''), postedAt: a.posted_at ?? null, url: sameOriginUrl(a.html_url, `/courses/${id}/discussion_topics/${a.id}`, origin) })),
        calendarEvents: calendarEvents.map(e => ({ id: String(e.id), title: String(e.title ?? 'Calendar event'), startAt: e.start_at ?? null, endAt: e.end_at ?? null, url: sameOriginUrl(e.html_url, `/courses/${id}`, origin) })),
        issues: courseIssues,
      };
    } catch (error) {
      if (error instanceof CanvasAuthenticationError || isAbort(error)) throw error;
      issues.push({ courseId: id, section: String(raw.name ?? 'Course'), message: message(error) });
      return null;
    } finally { loaded++; options.onProgress?.(`Synced ${loaded} of ${studentCourses.length} courses…`); }
  };
  const courses: CanvasCourseSnapshot[] = [];
  // Course work is batched and all HTTP calls share the four-request semaphore above.
  for (let offset = 0; offset < studentCourses.length; offset += 3) {
    const batch = await Promise.all(studentCourses.slice(offset, offset + 3).map(loadCourse));
    courses.push(...batch.filter((c): c is CanvasCourseSnapshot => c !== null));
  }
  return {
    origin, syncedAt: new Date().toISOString(),
    user: { id: String(profile.id), name: String(profile.name ?? 'Canvas student'), shortName: String(profile.short_name ?? profile.name ?? 'Student'), avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined },
    courses, issues,
  };
}
