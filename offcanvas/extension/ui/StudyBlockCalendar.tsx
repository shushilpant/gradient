import { useState } from 'preact/hooks';
import { exportScheduleToICS } from '../../core/icsParser.js';
import type { StudyBlock } from '../../core/schedulerSchema.js';
import type { StudySplitItem } from '../studySplit.js';
import { Icon } from './Icons.js';

interface StudyBlockCalendarProps {
  accountScope: string;
  recommendation: Pick<StudySplitItem, 'courseId' | 'assignmentId' | 'name' | 'code' | 'hours' | 'dueAt'>;
}

const MINUTE = 60_000;
const blockMinutes = (hours: number) => Number.isFinite(hours) ? Math.min(30, Math.floor(hours * 60)) : 0;

function localDateTime(time: number): string {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * MINUTE).toISOString().slice(0, 16);
}

function initialStart(dueAt: string | null, duration: number, now = Date.now()): string {
  const nextMinute = Math.ceil((now + 1) / MINUTE) * MINUTE;
  const nextQuarter = Math.ceil((now + MINUTE) / (15 * MINUTE)) * 15 * MINUTE;
  const deadline = Date.parse(dueAt ?? '');
  const latest = Number.isFinite(deadline) ? Math.floor(deadline / MINUTE - duration) * MINUTE : Infinity;
  const start = Math.min(nextQuarter, latest);
  return start >= nextMinute ? localDateTime(start) : '';
}

export function createFirstStudyBlock(
  { accountScope, recommendation }: StudyBlockCalendarProps,
  localStart: string,
  now = Date.now()
): { block: StudyBlock } | { error: string } {
  const start = Date.parse(localStart);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart) || !Number.isFinite(start) || localDateTime(start) !== localStart) {
    return { error: 'Choose a valid start date and time.' };
  }
  if (start <= now) return { error: 'Choose a start time in the future.' };

  const { assignmentId, name: assignmentName, courseId, code: courseCode, dueAt, hours } = recommendation;
  const durationMinutes = blockMinutes(hours);
  const end = new Date(start + durationMinutes * MINUTE);
  if (!Number.isFinite(end.getTime()) || durationMinutes < 1 || end.getUTCFullYear() > 9999) {
    return { error: 'Choose a time that fits the study block.' };
  }
  if (end.getTime() > Date.parse(dueAt ?? '')) return { error: 'The study block must end by the assignment deadline.' };

  const scope = encodeURIComponent(JSON.stringify([accountScope, courseId, assignmentId]));
  return { block: {
    id: `offcanvas-study-${scope}@offcanvas.app`,
    assignmentId, assignmentName, courseId, courseCode,
    startTime: new Date(start).toISOString(),
    endTime: end.toISOString(),
    durationMinutes,
    blockIndex: 0,
    totalBlocks: 1,
    status: 'scheduled',
    sequence: 0,
  } };
}

export function StudyBlockCalendar(props: StudyBlockCalendarProps) {
  const { dueAt, name, hours } = props.recommendation;
  const duration = blockMinutes(hours);
  const [start, setStart] = useState(() => initialStart(dueAt, duration));
  const [error, setError] = useState('');
  if (duration < 1) return null;

  return <details class="g-disclosure g-study-calendar">
    <summary>Add first study block to calendar</summary>
    <p class="g-small"><strong>{name}</strong> · {duration} min</p>
    <form onSubmit={event => {
      event.preventDefault();
      const result = createFirstStudyBlock(props, start);
      if ('error' in result) { setError(result.error); return; }
      setError('');
      const url = URL.createObjectURL(new Blob([exportScheduleToICS([result.block])], { type: 'text/calendar;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'offcanvas-study-block.ics';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>
      <label class="g-field-label">
        Start time
        <span class="g-search"><input type="datetime-local" required value={start} aria-invalid={!!error}
          aria-describedby={error ? 'offcanvas-study-block-error' : undefined}
          onInput={event => { setStart(event.currentTarget.value); setError(''); }}/></span>
      </label>
      <div class="g-row-actions"><button class="g-secondary" type="submit"><Icon name="download" size={14}/>Download .ics</button></div>
      {error && <p class="g-small" role="alert" id="offcanvas-study-block-error">{error}</p>}
    </form>
  </details>;
}
