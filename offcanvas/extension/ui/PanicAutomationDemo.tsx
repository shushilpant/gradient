import { useEffect, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { dueTime, isPending, LOCALE } from '../plainLanguage.js';
import { Icon } from './Icons.js';

export function PanicAutomationDemo({ snapshot, compact = false, onReplay }: {
  snapshot?: CanvasSnapshot;
  compact?: boolean;
  onReplay?: () => void;
}) {
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const upcoming = snapshot?.courses.flatMap(course => course.assignments
    .filter(assignment => !assignment.lockedForUser && isPending(assignment) && Number.isFinite(dueTime(assignment)) && dueTime(assignment) > now)
    .map(assignment => ({ course, assignment })))
    .sort((a, b) => dueTime(a.assignment) - dueTime(b.assignment)).slice(0, 2) ?? [];
  const localCanvas = /^http:\/\/(?:127\.0\.0\.1|localhost):8080$/.test(location.origin);
  return <section class={compact ? 'g-priority-note' : 'g-card'} aria-label="Panic automation demo">
    {!compact && <>
      <div class="g-section-head"><h2>Panic automation</h2><Icon name="clock" size={20}/></div>
      {upcoming.length ? <ol class="g-priority-items" aria-label="Next two assignment deadlines">
        {upcoming.map(({ course, assignment }, index) => <li class="g-priority-item" key={`${course.id}:${assignment.id}`}>
          <span class="g-priority-number" aria-hidden="true">{index + 1}</span>
          <div class="g-task-main"><strong>{assignment.name}</strong><small class="g-small">{course.code} · Due <time dateTime={assignment.dueAt!}>
            {new Date(assignment.dueAt!).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time></small></div>
        </li>)}
      </ol> : <p class="g-small">{snapshot ? 'No upcoming assignments.' : 'Sync Canvas to see upcoming assignments.'}</p>}
    </>}
    <div class="g-priority-note">
      <button type="button" class={compact ? 'g-link-btn' : 'g-secondary'} onClick={() => {
        setError('');
        try {
          if (!onReplay) throw new Error('Open the signed-in local Canvas replica on port 8080 to run the Panic demo.');
          onReplay();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'The Panic demo could not start. Refresh Canvas and try again.');
        }
      }}><Icon name="bolt" size={14}/>Demo panic automation</button>
    </div>
    {error && <div class="g-notice g-priority-note" role="alert"><div>{error}
      {!localCanvas && <p><a class="g-link-btn" href="http://127.0.0.1:8080/">Open local Canvas <Icon name="external" size={14}/></a></p>}
    </div></div>}
  </section>;
}
