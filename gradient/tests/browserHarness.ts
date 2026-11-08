import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const CANVAS_ORIGIN = 'https://canvas.instructure.com';
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../sandbox/fixtures/sandbox_all_courses.json'), 'utf8')) as Array<Record<string, any>>;

export function launchBrowser(): Promise<Browser> {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({ headless: true, ...(fs.existsSync(macChrome) ? { executablePath: macChrome } : {}) });
}

export function bundle(name = 'content'): string {
  const file = path.resolve(__dirname, `${name === 'legacy' ? '../.test-build/legacy.js' : `../dist/extension/${name}.js`}`);
  if (!fs.existsSync(file)) throw new Error(`Build missing: ${file}. Run npm run build first.`);
  return fs.readFileSync(file, 'utf8');
}

export interface MockCanvasOptions {
  legacy?: boolean;
  workflowMode?: 'manual' | 'auto' | null;
  url?: string;
  denied?: boolean;
  resourceDenied?: boolean;
  pagesDenied?: boolean;
  filesServerError?: boolean;
  html?: string;
  fixedTime?: string;
  configureData?: (courses: Array<Record<string, any>>) => void;
}

/** Network is fully intercepted; real-session code must consume these API responses. */
export async function mockCanvas(browser: Browser, options: MockCanvasOptions = {}): Promise<{page: Page; requests: Array<{path: string; method: string}>}> {
  const page = await browser.newPage({ timezoneId: 'America/Chicago' });
  if (options.fixedTime) await page.clock.setFixedTime(new Date(options.fixedTime));
  const fixtures = structuredClone(fixture);
  options.configureData?.(fixtures);
  const requests: Array<{path: string; method: string}> = [];
  const courses = fixtures.map((item, index) => ({ ...item.course, name: index === 0 ? 'Live Systems Lab' : item.course.name, course_code: index === 0 ? 'LIVE-101' : item.course.course_code, enrollments: [{ ...item.enrollment, type: 'student', role: 'StudentEnrollment' }] }));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== CANVAS_ORIGIN) return route.abort();
    if (!url.pathname.startsWith('/api/')) {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><title>Canvas course</title></head><body><main id="canvas-original">${options.html ?? 'Original Canvas course content'}</main></body></html>` });
    }
    requests.push({ path: url.pathname + url.search, method: request.method() });
    if (options.denied) return route.fulfill({ status: 401, json: { errors: [{ message: 'not authenticated' }] } });
    if (url.pathname === '/api/v1/users/self/profile' || url.pathname === '/api/v1/users/self') return route.fulfill({ json: { id: 9991, name: 'Jordan Lee', short_name: 'Jordan' } });
    if (url.pathname === '/api/v1/courses') return route.fulfill({ json: courses });
    const courseMatch = url.pathname.match(/^\/api\/v1\/courses\/(\d+)(.*)$/);
    const courseIndex = fixtures.findIndex(item => String(item.course.id) === courseMatch?.[1]);
    const item = fixtures[courseIndex];
    const endpoint = courseMatch?.[2];
    if (item) {
      if (!endpoint) return route.fulfill({ json: courses[courseIndex] });
      if (endpoint === '/assignment_groups') return route.fulfill({ json: item.assignment_groups });
      if (endpoint === '/assignments') return route.fulfill({ json: item.assignments.map((assignment: any) => ({ ...assignment, html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/assignments/${assignment.id}`, submission: item.submissions.find((submission: any) => submission.assignment_id === assignment.id) })) });
      if (endpoint === '/students/submissions') return route.fulfill({ json: item.submissions });
      if (endpoint === '/enrollments') return route.fulfill({ json: [item.enrollment] });
      if (endpoint === '/modules') return route.fulfill({ json: [{ id: 70, name: 'Week one', items: [
        { id: 701, content_id: 701, title: 'Signals study guide', type: 'Page', page_url: 'signals-study-guide', html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/pages/signals-study-guide` },
        { id: 702, content_id: 81, title: 'Module lecture notes.pdf', type: 'File', html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/modules/items/702` },
        { id: 703, content_id: 82, title: 'Locked exam answers.pdf', type: 'File', locked_for_user: true, html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/modules/items/703` },
      ] }] });
      if (endpoint === '/pages' && options.pagesDenied) return route.fulfill({ status: 404, json: { message: 'That page has been disabled for this course' } });
      if (endpoint === '/pages') return route.fulfill({ json: [{ page_id: 701, title: 'Signals study guide', url: 'signals-study-guide', html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/pages/signals-study-guide` }] });
      if (endpoint === '/files' && options.filesServerError) return route.fulfill({ status: 500, json: { errors: [{ message: 'Canvas file service is temporarily unavailable' }] } });
      if (endpoint === '/files' && options.resourceDenied) return route.fulfill({ status: 403, json: { errors: [{ message: 'Access denied' }] } });
      if (endpoint === '/files') return route.fulfill({ json: [{ id: 81, display_name: 'Lecture notes.pdf', html_url: `${CANVAS_ORIGIN}/courses/${item.course.id}/files/81`, url: `${CANVAS_ORIGIN}/files/81/download` }] });
    }
    if (url.pathname === '/api/v1/users/self/enrollments') return route.fulfill({ json: fixtures.map(item => item.enrollment) });
    if (url.pathname === '/api/v1/announcements') return route.fulfill({ json: [{ id: 91, title: 'Office hours this week', message: '<p>Tuesday at noon.</p>', posted_at: '2026-11-01T12:00:00Z', html_url: `${CANVAS_ORIGIN}/courses/99001/discussion_topics/91` }] });
    if (url.pathname === '/api/v1/calendar_events') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { errors: [{ message: 'Unsupported mocked endpoint' }] } });
  });
  await page.goto(options.url ?? `${CANVAS_ORIGIN}/courses/99001`);
  await page.evaluate(bundle(options.legacy ? 'legacy' : 'content'));
  if (options.legacy && options.workflowMode !== null && !/\/quizzes\/.*\/take/.test(options.url || '') && !/quiz_timer|submit_quiz_form/.test(options.html || '') && !options.url?.includes('notinstructure')) {
    await page.getByRole('button', {name: options.workflowMode === 'auto' ? 'Use auto mode' : 'Use manual mode', exact:true}).click({timeout:3000}).catch(()=>{});
  }
  return { page, requests };
}

export async function waitForLoaded(page: Page): Promise<void> {
  await page.getByText('Live Systems Lab', { exact: false }).first().waitFor({ timeout: 15000 });
}
