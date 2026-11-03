import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { downloadDeadlineCalendar, getDeadlineTracking, getSnapshotDeadlines, googleCalendarUrl, setDeadlineTracking, syncTrackedDeadlines, type DeadlineTrackingState } from '../deadlineCalendar.js';
import { Icon } from './Icons.js';

export function DeadlineTracker({ snapshot, preview = false }: { snapshot: CanvasSnapshot; preview?: boolean }) {
  const deadlines = useMemo(() => getSnapshotDeadlines(snapshot), [snapshot]);
  const [state, setState] = useState<DeadlineTrackingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!preview) await syncTrackedDeadlines(snapshot);
      const loaded = await getDeadlineTracking(snapshot);
      if (mounted) { setState(loaded); setError(''); }
    };
    load().catch(err => { if (mounted) setError(err instanceof Error ? err.message : 'Could not read deadline preferences.'); });
    return () => { mounted = false; };
  }, [snapshot, preview]);
  const future = deadlines.filter(d => Date.parse(d.dueAt) > Date.now());
  const overdue = deadlines.filter(d => Date.parse(d.dueAt) <= Date.now());
  const excluded = new Set(state?.excludedIds ?? []);
  const selected = future.filter(d => !excluded.has(d.id));
  const update = async (enabled: boolean, excludedIds?: string[]) => {
    setBusy(true); setError('');
    try { setState(await setDeadlineTracking(snapshot, enabled, excludedIds)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Your reminder preferences could not be saved.'); }
    finally { setBusy(false); }
  };
  const visible = showPast ? deadlines : future;
  const canNotify = !preview && typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  return <section class="g-card" aria-label="Deadline tracking and calendar">
    <div class="g-section-head"><h2>Keep your deadlines close.</h2><Icon name="calendar" size={18}/></div>
    <p class="g-small">{future.length} upcoming deadline{future.length === 1 ? '' : 's'}{overdue.length ? ` · ${overdue.length} past due` : ''}. Browser reminders arrive 24 hours and 1 hour before selected deadlines.</p>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
      <button class={state?.enabled ? 'g-secondary' : 'g-primary'} disabled={busy || state === null || preview} onClick={() => update(!state?.enabled)}>
        <Icon name={state?.enabled ? 'check' : 'clock'} size={14}/>{busy ? 'Saving…' : state?.enabled ? 'Pause reminders' : 'Track deadlines'}
      </button>
      <button class="g-secondary" disabled={!selected.length} onClick={() => downloadDeadlineCalendar(selected)}><Icon name="download" size={14}/>Download calendar (.ics)</button>
    </div>
    {state?.enabled && <p class="g-small" role="status" style={{ marginTop: '10px', color: '#187352' }}>{canNotify ? 'Browser reminders are on. Keep Chrome running to receive them.' : 'Preferences saved. Load the extension in Chrome to receive browser reminders.'}</p>}
    {preview && <p class="g-small" style={{ marginTop: '10px' }}>Sample deadlines. Install the extension on Canvas to enable reminders for your real coursework.</p>}
    <p class="g-small" style={{ marginTop: '10px' }}>Import the .ics file into Apple Calendar or Google Calendar. Google links let you review and save one event. Calendar copies do not automatically sync; refresh Canvas and export again after a deadline changes.</p>
    {error && <p class="g-notice" role="alert" style={{ marginTop: '12px' }}>{error}</p>}
    {!!overdue.length && <label class="g-small" style={{ display: 'flex', gap: '7px', alignItems: 'center', marginTop: '14px', cursor: 'pointer' }}><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.currentTarget.checked)}/>Show past-due work</label>}
    <div style={{ marginTop: '12px', maxHeight: '350px', overflowY: 'auto' }}>
      {visible.map(deadline => {
        const past = Date.parse(deadline.dueAt) <= Date.now();
        return <div key={deadline.id} class="g-task" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" aria-label={`Include ${deadline.title} in reminders and calendar export`} disabled={busy || !state || preview || past} checked={!past && !excluded.has(deadline.id)} style={{ marginTop: '4px', accentColor: '#2855e8' }} onChange={e => {
            const next = new Set(excluded);
            if (e.currentTarget.checked) next.delete(deadline.id); else next.add(deadline.id);
            update(state?.enabled ?? false, [...next]);
          }}/>
          <div class="g-task-main"><strong><a href={deadline.url}>{deadline.title}</a></strong><p class="g-small" style={{ marginTop: '4px' }}>{deadline.courseCode} · {new Date(deadline.dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{past ? ' · Past due' : ''}</p>
            {!past && <a class="g-link-btn" style={{ display: 'inline-flex', marginTop: '7px', fontSize: '10px' }} href={googleCalendarUrl(deadline)} target="_blank" rel="noopener noreferrer">Add to Google Calendar <Icon name="external" size={11}/></a>}
          </div>
        </div>;
      })}
      {!visible.length && <p class="g-small" style={{ padding: '14px 0' }}>No upcoming, unsubmitted assignments with a due date were found.</p>}
    </div>
    <p class="g-small" style={{ marginTop: '12px' }}>Saved locally: assignment titles, course names, deadlines, and Canvas links. Reminder schedules update whenever GRADIENT refreshes Canvas. Submitted work is removed from the schedule.</p>
  </section>;
}
