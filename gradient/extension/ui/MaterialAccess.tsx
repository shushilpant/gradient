import type { CanvasCourseSnapshot } from '../liveCanvas.js';
import { Icon } from './Icons.js';

/** A hidden course index is different from a locked individual resource. */
export function MaterialAccess({ courses, compact = false }: { courses: CanvasCourseSnapshot[]; compact?: boolean }) {
  const sections = courses.flatMap(course => (course.materialAccess ?? [])
    .filter(access => access.status !== 'direct')
    .map(access => ({ course, access })));
  if (!sections.length) return null;
  return <section class="g-card" role="region" aria-label="Material access">
    <div class="g-section-head"><h2>{compact ? 'Material access' : 'Course materials'}</h2><Icon name="folder" size={17}/></div>
    <p class="g-small" style={{ marginBottom: '12px' }}>Some instructors hide the Pages or Files index. GRADIENT also finds material links in modules, the syllabus, and coursework.</p>
    <div style={{ display: 'grid', gap: '12px' }}>
      {sections.map(({ course, access }) => <div key={`${course.id}-${access.section}`} style={{ borderTop: '1px solid #e5e9f1', paddingTop: '11px' }}>
        {!compact && <div class="g-small" style={{ marginBottom: '4px' }}>{course.code}</div>}
        <strong style={{ display: 'block', fontSize: '12px', color: access.count ? '#187352' : '#536079' }}>
          {access.section} · {access.count > 0 ? `${access.count} linked ${access.count === 1 ? 'resource' : 'resources'}` : 'Not available in this course'}
        </strong>
        <p class="g-small" style={{ marginTop: '4px' }}>{access.reason}</p>
        {access.count > 0 && <p class="g-small" style={{ marginTop: '3px' }}>Linked materials are listed in the course library. Canvas checks access when you open each item.</p>}
      </div>)}
    </div>
  </section>;
}
