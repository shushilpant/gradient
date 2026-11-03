import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasAuthenticationError, loadCanvasSnapshot } from '../extension/liveCanvas.js';

const origin = 'https://school.instructure.com';
const course = {
  id: 42, name: 'Systems', course_code: 'CS 201', apply_assignment_group_weights: false,
  syllabus_body: '<p>Course syllabus</p>', workflow_state: 'available',
  enrollments: [{ type: 'student', enrollment_state: 'active', computed_current_score: 90, computed_final_score: 45 }],
};
const assignment = { id: 8, name: 'Project', points_possible: 100, assignment_group_id: 5, due_at: '2026-11-10T18:00:00Z',
  description: '<p>Build a system</p>', html_url: `${origin}/courses/42/assignments/8`,
  submission: { assignment_id: 8, score: null, excused: null, workflow_state: 'submitted', posted_at: null } };

type Handler = (url: URL) => Response | undefined;
function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function mockApi(override?: Handler) {
  const mock = vi.fn(async (target: string, init: RequestInit) => {
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('error');
    const url = new URL(target);
    expect(url.origin).toBe(origin);
    const custom = override?.(url);
    if (custom) return custom;
    if (url.pathname.endsWith('/profile')) return json({ id: 7, name: 'Ada Student', short_name: 'Ada' });
    if (url.pathname === '/api/v1/courses') return json([course]);
    if (url.pathname.endsWith('/assignment_groups')) return json([{ id: 5, name: 'Projects', group_weight: 0, rules: {} }]);
    if (url.pathname.endsWith('/assignments')) return json([assignment]);
    if (url.pathname.endsWith('/students/submissions')) return json([{ assignment_id: 8, score: 90, excused: null, workflow_state: 'graded', posted_at: '2026-11-01T12:00:00Z' }]);
    if (url.pathname.endsWith('/enrollments')) return json([{ type: 'StudentEnrollment', user_id: 7, grades: { current_score: 90, final_score: 45 } }]);
    return json([]);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
afterEach(() => vi.unstubAllGlobals());

describe('Authenticated live Canvas sync', () => {
  it('loads only student courses with the active session and uses fresh scores from self submissions', async () => {
    const mock = mockApi(url => url.pathname === '/api/v1/courses' ? json([
      course, { ...course, id: 99, enrollments: [{ type: 'ta', enrollment_state: 'active' }] },
      { ...course, id: 100, enrollments: [{ type: 'teacher', enrollment_state: 'active' }] },
    ]) : undefined);
    const result = await loadCanvasSnapshot({ origin });
    expect(result.user.name).toBe('Ada Student');
    expect(result.courses.map(c => c.id)).toEqual(['42']);
    expect(result.courses[0]?.input.submissions[0]).toMatchObject({ score: 90, excused: false, posted: true });
    expect(result.courses[0]?.assignments[0]?.submission?.score).toBe(90);
    expect(result.courses[0]?.currentScore).toBe(90);
    const assignmentUrl = new URL(mock.mock.calls.find(([url]) => new URL(url).pathname.endsWith('/assignments'))![0]);
    expect(assignmentUrl.searchParams.getAll('include[]')).toEqual(['submission', 'rubric']);
    expect(mock.mock.calls.some(([url]) => /\/courses\/(99|100)\//.test(url))).toBe(false);
  });

  it('follows Canvas Link pagination without dropping assignments', async () => {
    mockApi(url => {
      if (url.pathname.endsWith('/assignments')) {
        return url.searchParams.get('page') === '2'
          ? json([{ ...assignment, id: 9 }])
          : json([assignment], 200, { Link: `<${origin}/api/v1/courses/42/assignments?page=2>; rel="next"` });
      }
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses[0]?.assignments.map(a => a.id)).toEqual(['8', '9']);
  });

  it('records denied and disabled optional sections and preserves real course data', async () => {
    mockApi(url => {
      if (url.pathname.endsWith('/files')) return json({ errors: [{ message: 'restricted' }] }, 403);
      if (url.pathname.endsWith('/pages')) return json({ message: 'That page has been disabled for this course' });
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]?.issues).toEqual([]);
    expect(result.courses[0]?.materialAccess).toEqual([
      { section: 'Pages', status: 'unavailable', count: 0, reason: expect.stringContaining('HTTP 403') },
      { section: 'Files', status: 'unavailable', count: 0, reason: expect.stringContaining('HTTP 403') },
    ]);
    expect(result.courses[0]?.assignments[0]?.name).toBe('Project');
  });

  it('recovers module file links when Files index is restricted and Pages index is disabled', async () => {
    mockApi(url => {
      if (url.pathname.endsWith('/files')) return json({ errors: ['restricted'] }, 403);
      if (url.pathname.endsWith('/pages')) return json({ errors: ['disabled'] }, 404);
      if (url.pathname.endsWith('/tabs')) return json([{ id: 'pages', hidden: true }, { id: 'files', hidden: true }]);
      if (url.pathname.endsWith('/modules')) return json([{ id: 2, name: 'Week one', items: [
        { id: 21, type: 'File', content_id: 71, title: 'Lecture notes', html_url: `${origin}/courses/42/modules/items/21` },
        { id: 22, type: 'Page', content_id: 72, page_url: 'week-one', title: 'Week one guide', html_url: `${origin}/courses/42/pages/week-one` },
      ] }]);
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    const synced = result.courses[0]!;
    expect(synced.issues).toEqual([]);
    expect(synced.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'file', title: 'Lecture notes', url: `${origin}/courses/42/modules/items/21`, source: 'module' }),
      expect.objectContaining({ type: 'page', title: 'Week one guide', source: 'module' }),
    ]));
    expect(synced.materialAccess).toEqual([
      { section: 'Pages', status: 'module-links', count: 1, reason: expect.stringContaining('HTTP 404') },
      { section: 'Files', status: 'module-links', count: 1, reason: expect.stringContaining('HTTP 403') },
    ]);
  });

  it('deduplicates direct indexes and module links and excludes locked course content', async () => {
    mockApi(url => {
      if (url.pathname === '/api/v1/courses') return json([{ ...course, syllabus_body: '<a href="/courses/42/files/90">Locked file link</a><a href="/courses/42/files/91">Hidden file link</a><a href="/courses/42/pages/locked-guide">Locked page link</a>' }]);
      if (url.pathname.endsWith('/files')) return json([{ id: 71, display_name: 'Lecture notes' }, { id: 90, display_name: 'Locked file', locked_for_user: true }]);
      if (url.pathname.endsWith('/pages')) return json([{ page_id: 72, url: 'week-one', title: 'Week one guide' }]);
      if (url.pathname.endsWith('/modules')) return json([
        { id: 2, name: 'Week one', items: [
          { id: 21, type: 'File', content_id: 71, title: 'Lecture notes again' },
          { id: 22, type: 'Page', content_id: 72, page_url: 'week-one', title: 'Week one guide again' },
          { id: 23, type: 'File', content_id: 91, title: 'Hidden file', hidden_for_user: true },
          { id: 24, type: 'Page', page_url: 'locked-guide', title: 'Locked guide', content_details: { locked_for_user: true } },
        ] },
        { id: 3, name: 'Locked module', locked_for_user: true, items_count: 10, items: [] },
      ]);
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    const resources = result.courses[0]!.resources;
    expect(resources.filter(r => r.type === 'file')).toHaveLength(1);
    expect(resources.filter(r => r.type === 'page')).toHaveLength(1);
    expect(resources.map(r => r.title)).not.toContain('Locked module');
    expect(result.courses[0]!.materialAccess?.map(a => a.status)).toEqual(['direct', 'direct']);
  });

  it('recovers same-origin syllabus and assignment links without following foreign or other-course links', async () => {
    const mock = mockApi(url => {
      if (url.pathname === '/api/v1/courses') return json([{ ...course, syllabus_body: `<a href="/courses/42/files/71/download?wrap=1">Course syllabus.pdf</a>` }]);
      if (url.pathname.endsWith('/files') || url.pathname.endsWith('/pages')) return json({ errors: ['restricted'] }, 403);
      if (url.pathname.endsWith('/assignments')) return json([{ ...assignment, description: `<a href="${origin}/files/71/download">Duplicate syllabus</a><a href="/courses/42/pages/project-guide">Project &amp; guide</a><a href="https://foreign.example/files/99">Foreign file</a><a href="/courses/999/files/100">Other course</a><a href="javascript:alert(1)">Unsafe</a>` }]);
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    const resources = result.courses[0]!.resources;
    expect(resources).toHaveLength(2);
    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'file', title: 'Course syllabus.pdf', source: 'course-link' }),
      expect.objectContaining({ type: 'page', title: 'Project & guide', source: 'course-link' }),
    ]));
    expect(mock.mock.calls.every(([url]) => new URL(url).origin === origin)).toBe(true);
    expect(result.courses[0]!.materialAccess?.every(a => a.status === 'module-links' && a.count === 1)).toBe(true);
  });

  it('keeps unexpected server failures visible even when a module link is recovered', async () => {
    mockApi(url => {
      if (url.pathname.endsWith('/files')) return json({ errors: ['server unavailable'] }, 500);
      if (url.pathname.endsWith('/modules')) return json([{ id: 2, name: 'Week one', items: [{ id: 21, type: 'File', content_id: 71, title: 'Lecture notes' }] }]);
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses[0]!.issues).toEqual([{ courseId: '42', section: 'Files', message: 'Canvas returned HTTP 500.' }]);
    expect(result.courses[0]!.materialAccess).toContainEqual({ section: 'Files', status: 'module-links', count: 1, reason: 'Canvas returned HTTP 500.' });
  });

  it('does not re-add known locked index records through unflagged module items or HTML links', async () => {
    mockApi(url => {
      if (url.pathname === '/api/v1/courses') return json([{ ...course, syllabus_body: '<a href="/courses/42/files/81">Locked file link</a><a href="/courses/42/pages/locked-page">Locked page link</a>' }]);
      if (url.pathname.endsWith('/files')) return json([{ id: 81, display_name: 'Locked file', locked_for_user: true }]);
      if (url.pathname.endsWith('/pages')) return json([{ page_id: 82, url: 'locked-page', title: 'Locked page', hidden_for_user: true }]);
      if (url.pathname.endsWith('/modules')) return json([
        { id: 2, name: 'Week one', items: [
          { id: 21, type: 'File', content_id: 81, title: 'Unflagged module file' },
          { id: 22, type: 'Page', content_id: 82, page_url: 'locked-page', title: 'Unflagged module page' },
        ] },
        { id: 3, name: 'Locked module', locked_for_user: true, items: [{ id: 31, type: 'File', content_id: 91, title: 'Locked module file' }] },
      ]);
      if (url.pathname.endsWith('/assignments')) return json([{ ...assignment, description: '<a href="/courses/42/files/91">Locked module file link</a>' }]);
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses[0]!.resources.filter(r => r.type !== 'module')).toEqual([]);
  });

  it('retains exhausted Canvas 403 throttling as a sync failure instead of an instructor restriction', async () => {
    let attempts = 0;
    mockApi(url => {
      if (url.pathname.endsWith('/files')) {
        attempts++;
        return json({ errors: ['throttled'] }, 403, { 'X-Rate-Limit-Remaining': '0', 'Retry-After': '0' });
      }
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(attempts).toBe(3);
    expect(result.courses[0]!.issues).toEqual([{ courseId: '42', section: 'Files', message: 'Canvas returned HTTP 429.' }]);
    expect(result.courses[0]!.materialAccess).toContainEqual({ section: 'Files', status: 'unavailable', count: 0, reason: 'Canvas returned HTTP 429.' });
  });

  it('rejects an expired session and never substitutes demo fixtures', async () => {
    const mock = mockApi(() => json({ errors: ['login'] }, 401));
    await expect(loadCanvasSnapshot({ origin })).rejects.toBeInstanceOf(CanvasAuthenticationError);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not send session requests to foreign pagination URLs', async () => {
    const mock = mockApi(url => url.pathname === '/api/v1/courses'
      ? json([course], 200, { Link: '<https://foreign.example/api/v1/courses?page=2>; rel="next"' })
      : undefined);
    await expect(loadCanvasSnapshot({ origin })).rejects.toThrow('unsafe pagination');
    expect(mock.mock.calls.every(([url]) => new URL(url).origin === origin)).toBe(true);
  });

  it('keeps course failures visible without fabricating course data', async () => {
    mockApi(url => url.pathname.endsWith('/assignments') ? json({ error: 'locked' }, 403) : undefined);
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses).toEqual([]);
    expect(result.issues).toEqual([{ courseId: '42', section: 'Systems', message: 'Canvas has restricted access to this section.' }]);
  });

  it('does not reuse a previous account snapshot or network response', async () => {
    const mock = mockApi();
    const first = await loadCanvasSnapshot({ origin });
    mockApi(url => {
      if (url.pathname.endsWith('/profile')) return json({ id: 123, name: 'Other student' });
      if (url.pathname === '/api/v1/courses') return json([]);
      return undefined;
    });
    const second = await loadCanvasSnapshot({ origin });
    expect(first.courses).toHaveLength(1);
    expect(second.user.id).toBe('123');
    expect(second.courses).toHaveLength(0);
    expect(mock).toHaveBeenCalled();
  });
  it('caps concurrent requests while syncing multiple courses', async () => {
    const base = mockApi(url => url.pathname === '/api/v1/courses'
      ? json([course, { ...course, id: 43 }, { ...course, id: 44 }]) : undefined);
    let active = 0;
    let maximum = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      try { return await base(url, init); } finally { active--; }
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses).toHaveLength(3);
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it('retries a throttled response at most twice using Retry-After', async () => {
    let attempts = 0;
    mockApi(url => {
      if (url.pathname.endsWith('/profile')) {
        attempts++;
        if (attempts < 3) return json({ error: 'throttled' }, 429, { 'Retry-After': '0' });
      }
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(attempts).toBe(3);
    expect(result.user.id).toBe('7');
  });

  it('stops retrying persistent throttling after three total attempts', async () => {
    const mock = mockApi(() => json({ error: 'throttled' }, 429, { 'Retry-After': '0' }));
    await expect(loadCanvasSnapshot({ origin })).rejects.toThrow('HTTP 429');
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('loads a configured Canvas grading standard without unsupported include values', async () => {
    const mock = mockApi(url => {
      if (url.pathname === '/api/v1/courses') return json([{ ...course, grading_standard_id: 4 }]);
      if (url.pathname.endsWith('/grading_standards/4')) return json({ id: 4, grading_scheme: [{ name: 'Pass', value: 0.7 }, { name: 'Fail', value: 0 }] });
      return undefined;
    });
    const result = await loadCanvasSnapshot({ origin });
    expect(result.courses[0]?.input.course.gradingScheme).toEqual([{ letter: 'Pass', minPct: 70 }, { letter: 'Fail', minPct: 0 }]);
    const groupUrl = new URL(mock.mock.calls.find(([url]) => new URL(url).pathname.endsWith('/assignment_groups'))![0]);
    expect(groupUrl.searchParams.get('include[]')).toBeNull();
  });

  it('reads legacy Canvas anti-hijacking JSON prefixes as data', async () => {
    mockApi(url => url.pathname.endsWith('/profile')
      ? new Response('while(1);' + JSON.stringify({ id: 7, name: 'Ada Student' }), { headers: { 'Content-Type': 'application/json' } })
      : undefined);
    const result = await loadCanvasSnapshot({ origin });
    expect(result.user.id).toBe('7');
  });

});
