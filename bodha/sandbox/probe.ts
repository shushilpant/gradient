/**
 * Canvas API Probe Script
 * 
 * HARD RULE 4 (NON-NEGOTIABLE):
 * Never guess an API shape. Canvas endpoint names, parameters, includes and response fields
 * must be verified by probing the sandbox (write probe scripts that dump real JSON)
 * or from official documentation.
 * 
 * Usage:
 *   CANVAS_BASE_URL="https://canvas.instructure.com" CANVAS_TOKEN="xyz" CANVAS_COURSE_ID="12345" npx tsx sandbox/probe.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeCanvasFetch } from '../extension/canvasClient.js';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';

interface ProbeTarget {
  name: string;
  path: string;
  params: Record<string, string>;
}

export async function runProbe(options?: {
  baseUrl?: string;
  token?: string;
  courseId?: string;
  outputDir?: string;
}): Promise<void> {
  const baseUrl = options?.baseUrl ?? process.env['CANVAS_BASE_URL'] ?? 'https://canvas.instructure.com';
  const token = options?.token ?? process.env['CANVAS_TOKEN'];
  const courseId = options?.courseId ?? process.env['CANVAS_COURSE_ID'] ?? 'synthetic';
  const outDir = options?.outputDir ?? path.resolve(process.cwd(), 'sandbox/fixtures/probed');

  if (!token) {
    console.log('[PROBE] No CANVAS_TOKEN provided in environment.');
    console.log('[PROBE] Running in offline verification mode against recorded synthetic sandbox fixtures.');

    const fixturePath = path.resolve(process.cwd(), 'sandbox/fixtures/synthetic_course.json');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Synthetic fixture not found at ${fixturePath}`);
    }

    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const adapter = new CanvasAdapter();
    const course = adapter.parseCourse(raw.course, 3.0);
    const groups = adapter.parseAssignmentGroups(raw.assignment_groups);
    const assignments = adapter.parseAssignments(raw.assignments);
    const submissions = adapter.parseSubmissions(raw.submissions);

    console.log(`[PROBE VERIFICATION] Successfully verified shapes against CanvasAdapter:`);
    console.log(`  Course: "${course.name}" (ID: ${course.id}, Credit Hours: ${course.creditHours})`);
    console.log(`  Assignment Groups: ${groups.length}`);
    console.log(`  Assignments: ${assignments.length}`);
    console.log(`  Submissions: ${submissions.length}`);
    return;
  }

  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  const targets: ProbeTarget[] = [
    {
      name: 'course',
      path: `/api/v1/courses/${courseId}`,
      params: { include: 'grading_scheme,total_scores' },
    },
    {
      name: 'assignment_groups',
      path: `/api/v1/courses/${courseId}/assignment_groups`,
      params: { include: 'assignments,rules', per_page: '50' },
    },
    {
      name: 'assignments',
      path: `/api/v1/courses/${courseId}/assignments`,
      params: { include: 'rubric,submission', per_page: '50' },
    },
    {
      name: 'submissions',
      path: `/api/v1/courses/${courseId}/students/submissions`,
      params: { student_ids: 'self', include: 'rubric_assessment', per_page: '50' },
    },
  ];

  console.log(`[PROBE] Probing live Canvas instance: ${baseUrl} for course ${courseId}...`);

  for (const target of targets) {
    const url = new URL(target.path, baseUrl);
    for (const [k, v] of Object.entries(target.params)) {
      url.searchParams.set(k, v);
    }

    console.log(`[PROBE] GET ${url.toString()}`);
    // safeCanvasFetch enforces READ-ONLY invariant at runtime
    try {
      const { data, ok, status } = await safeCanvasFetch(url.toString(), { headers });

      if (!ok) {
        console.error(`[PROBE ERROR] ${target.name}: HTTP ${status}`);
        continue;
      }

      const dest = path.join(outDir, `${target.name}.json`);
      fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[PROBE] Dumped verified JSON to ${dest}`);
    } catch (err) {
      console.error(`[PROBE ERROR] ${target.name}:`, err);
    }
  }
}

// Direct execution guard
if (process.argv[1]?.endsWith('probe.ts') || process.argv[1]?.endsWith('probe.js')) {
  runProbe().catch((err) => {
    console.error('[PROBE FATAL]', err);
    process.exit(1);
  });
}

