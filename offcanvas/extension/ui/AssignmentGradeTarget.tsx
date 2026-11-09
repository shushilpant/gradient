import { useMemo, useState } from 'preact/hooks';
import { assignmentGradeTarget, assignmentTargetOptions, canTargetAssignmentGrade } from '../assignmentGradeTarget.js';
import type { CanvasCourseSnapshot, CanvasLiveAssignment } from '../liveCanvas.js';

export function AssignmentGradeTarget({ course, assignment }: { course: CanvasCourseSnapshot; assignment: CanvasLiveAssignment }) {
  const [letter, setLetter] = useState('B');
  const { options, usesDefaultScale } = useMemo(() => assignmentTargetOptions(course), [course]);
  const target = options.find(option => option.letter === letter) ?? options[0]!;
  const result = useMemo(() => {
    if (!canTargetAssignmentGrade(assignment)) return null;
    return assignmentGradeTarget(course, assignment, target.minPct);
  }, [course, assignment, target.minPct]);

  if (!result) return null;
  return <div class="g-grade-target">
    <label class="g-grade-target-head g-small">
      <strong>Target course grade</strong>
      <select id="offcanvas-grade-target" class="g-select" value={target.letter} onChange={event => setLetter(event.currentTarget.value)}>
        {options.map(option => <option key={option.letter} value={option.letter}>{option.letter} ({option.minPct}%)</option>)}
      </select>
    </label>
    <p class="g-small" aria-live="polite">
      {result.score !== null
        ? <><strong>{result.score}%</strong> on this assignment reaches {target.letter} or higher.</>
        : result.bestGrade === null
          ? <>A current grade needs counted points.</>
          : <>{target.letter} is out of reach on this assignment alone. Best case <strong>{result.bestGrade}%</strong>.</>}
    </p>
    <p class="g-small">Current grade · whole-percent scores{usesDefaultScale && ' · default grade scale'}</p>
  </div>;
}
