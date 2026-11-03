/** Explicit, localhost-only visual preview. Never included in the installed extension's entry. */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Workspace } from './ui/Workspace.js';
import { shouldRunOnPage } from './safetyGuard.js';
import { getFixtureCourses } from './fixtureData.js';
import { currentGrade, finalGrade } from '../core/gradeModel.js';
import type { CanvasSnapshot } from './liveCanvas.js';
import { FONT_STYLES } from './ui/fontStyles.js';

function previewSnapshot(): CanvasSnapshot {
  return {
    origin: window.location.origin,
    syncedAt: new Date().toISOString(),
    user: { id: 'preview', name: 'Alex Chen', shortName: 'Alex' },
    issues: [],
    courses: getFixtureCourses().map((input) => ({
      id: input.course.id, name: input.course.name, code: input.course.name.split(':')[0] ?? input.course.id,
      url: `/courses/${input.course.id}`, syllabusHtml: '', input,
      currentScore: currentGrade(input).percentage, finalScore: finalGrade(input).percentage,
      assignments: input.assignments.map(a => ({ ...a,
        htmlUrl: `/courses/${input.course.id}/assignments/${a.id}`, descriptionHtml: '',
        submission: input.submissions.find(s => s.assignmentId === a.id) ?? null,
      })),
      resources: [{id: `${input.course.id}-module`, type: 'module', title: 'Course overview & study materials', url: `/courses/${input.course.id}/modules`}],
      announcements: [], calendarEvents: [], issues: [],
    })),
  };
}
function Preview() {
  const [snapshot, setSnapshot] = useState(previewSnapshot);
  return <Workspace preview snapshot={snapshot} loading={false} onRefresh={() => setSnapshot(previewSnapshot())}
    initialCourseId={window.location.pathname.match(/\/courses\/(\d+)/)?.[1]} />;
}
if (['localhost', '127.0.0.1'].includes(window.location.hostname) && shouldRunOnPage(window.location.href, document)) {
  const fonts = document.createElement('style'); fonts.id = 'gradient-fonts'; fonts.textContent = FONT_STYLES; document.head.appendChild(fonts);
  const host = document.createElement('div');
  host.id = 'gradient-panel-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0 0 auto auto;width:0;height:0;z-index:2147483646;';
  document.body.appendChild(host);
  render(<Preview />, host.attachShadow({ mode: 'open' }));
}
