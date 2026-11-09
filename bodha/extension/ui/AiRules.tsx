import { useMemo } from 'preact/hooks';
import { readAiPolicy, type PolicyStance } from '../aiPolicy.js';
import type { CanvasCourseSnapshot } from '../liveCanvas.js';
import { Icon } from './Icons.js';

const LABELS: Record<PolicyStance, string> = { restricted: 'Restricted', conditional: 'Allowed with limits', allowed: 'Allowed', unstated: 'Not stated' };

/** Shows what each syllabus says about AI, quoted, so students know the rules before asking for help. */
export function AiRules({ courses }: { courses: CanvasCourseSnapshot[] }) {
  const rows = useMemo(() => courses.map(course => ({ course, policy: readAiPolicy(course.syllabusHtml) })), [courses]);
  if (!rows.length) return null;
  return <section class="g-card g-ai-rules" aria-label="AI rules by course">
    <div class="g-section-head"><h2>AI rules by course</h2><Icon name="shield" size={20}/></div>
    <p class="g-small">Read from each syllabus, so you know the rules before you ask for help.</p>
    <ul>{rows.map(({ course, policy }) => <li key={course.id}>
      <div class="g-ai-rule-head"><strong>{course.code}</strong><span class={`g-ai-stance ${policy.stance}`}>{LABELS[policy.stance]}</span></div>
      <q class={policy.sentence ? '' : 'none'}>{policy.sentence ?? 'The syllabus does not mention AI. Ask your lecturer before using it on marked work.'}</q>
    </li>)}</ul>
  </section>;
}
