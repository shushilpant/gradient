import { useEffect, useRef, useState } from 'preact/hooks';
import type { RubricAssessmentEntry, RubricCriterion } from '../../core/schema.js';
import { canvasHtmlText } from '../canvasMaterials.js';
import type { CanvasLiveAssignment } from '../liveCanvas.js';
import { LOCALE } from '../plainLanguage.js';
import { loadRubricCheck, rubricCheckKey, saveRubricCheck } from '../rubricChecklist.js';
import { Icon } from './Icons.js';

function Criterion({ criterion, assessed, storageKey }: {
  criterion: RubricCriterion;
  assessed?: RubricAssessmentEntry;
  storageKey: string;
}) {
  const [checked, setChecked] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void loadRubricCheck(storageKey).then(value => {
      if (mounted.current) setChecked(value);
    }).catch(() => {
      if (mounted.current) setError('Checklist unavailable.');
    });
    return () => { mounted.current = false; };
  }, [storageKey]);

  const toggle = (next: boolean) => {
    if (checked === null || saving) return;
    setChecked(next);
    setSaving(true);
    setError('');
    void saveRubricCheck(storageKey, next).catch(() => {
      if (!mounted.current) return;
      setChecked(checked);
      setError('Checkmark could not be saved.');
    }).finally(() => {
      if (mounted.current) setSaving(false);
    });
  };

  return <div class="g-rubric-criterion">
    <div class="g-section-head">
      <h3><label class="g-rubric-check">
        <input type="checkbox" checked={checked === true} disabled={checked === null || saving}
          onChange={event => toggle(event.currentTarget.checked)}/>
        <span>{canvasHtmlText(criterion.description) || 'Rubric criterion'}</span>
      </label></h3>
      <span class="g-label-count">{criterion.points} pts</span>
    </div>
    {error && <p class="g-small" role="status">{error}</p>}
    {assessed && <div class="g-notice info"><Icon name="check" size={16}/><div>
      <strong>Your lecturer gave {assessed.points} / {criterion.points} pts</strong>
      {assessed.comments && <p>{canvasHtmlText(assessed.comments)}</p>}
    </div></div>}
    {criterion.ratings.length > 0 && <details class="g-disclosure">
      <summary class="g-ratings-summary">Rating descriptions</summary>
      <ul class="g-rubric-ratings">{criterion.ratings.map((rating, i) => <li key={rating.id ?? i}>
        <span>{canvasHtmlText(rating.description) || 'No description provided'}</span>
        <strong>{rating.points} pts</strong>
      </li>)}</ul>
    </details>}
  </div>;
}

export function AssignmentFeedback({ assignment, accountScope, courseId }: {
  assignment: CanvasLiveAssignment;
  accountScope: string;
  courseId: string;
}) {
  const rubric = assignment.rubric ?? [];
  const comments = assignment.submission?.submissionComments ?? [];
  const assessment = assignment.submission?.rubricAssessment ?? {};
  if (!rubric.length && !comments.length) return null;

  return <section class="g-card" aria-label="Marking criteria and lecturer feedback">
    <details class="g-disclosure">
      <summary class="g-feedback-summary">Marking criteria and feedback</summary>
      {rubric.length > 0 && <div class="g-rubric-list" role="group" aria-label="My rubric checklist">
        <p class="g-small g-rubric-checklist-label">My checklist</p>
        {rubric.map(criterion => {
          const storageKey = rubricCheckKey(accountScope, courseId, assignment.id, criterion.id);
          return <Criterion key={storageKey} criterion={criterion} assessed={assessment[criterion.id]} storageKey={storageKey}/>;
        })}
      </div>}
      {comments.length > 0 && <div class="g-feedback-comments">
        <h3>Comments on your submission</h3>
        {comments.map((comment, i) => <div class="g-instructor-comment" key={i}>
          <div class="g-comment-author">
            <strong>{comment.authorName || 'Canvas user'}</strong>
            {comment.createdAt && Number.isFinite(Date.parse(comment.createdAt)) && <time dateTime={comment.createdAt}>
              {new Date(comment.createdAt).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
            </time>}
          </div>
          <p>{canvasHtmlText(comment.comment)}</p>
        </div>)}
      </div>}
    </details>
  </section>;
}
