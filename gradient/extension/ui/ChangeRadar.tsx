import { useEffect, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { detectMissionChanges, snapshotBaseline, type ChangeRecord } from '../commandCenter.js';
import { loadCommandState, saveCommandState } from '../commandStorage.js';
import { Icon } from './Icons.js';

/** Reuses the existing account-scoped change baseline without mounting command-center tools. */
export function ChangeRadar({ snapshot, onPlan }: { snapshot: CanvasSnapshot; onPlan: (courseId: string) => void }) {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [status, setStatus] = useState('Checking your previous sync…');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void loadCommandState(snapshot).then(async saved => {
      if (!current) return;
      const baseline = snapshotBaseline(snapshot);
      const detected = detectMissionChanges(saved.baseline, baseline);
      const next = [...detected, ...saved.changes.filter(item => !detected.some(change => change.id === item.id))].slice(0, 30);
      setChanges(next); setStatus(Object.keys(saved.baseline).length ? 'No deadline, instruction, or rubric changes detected since your last sync.' : 'Baseline saved. Changes to deadlines, instructions, and rubrics will appear after your next sync.');
      await saveCommandState(snapshot, { ...saved, baseline, changes: next, updatedAt: snapshot.syncedAt });
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Change tracking is unavailable.'); });
    return () => { current = false; };
  }, [snapshot]);
  return <section class="g-card" aria-label="Canvas change radar"><div class="g-section-head"><h2>Canvas changes</h2><Icon name="alert" size={18}/></div>
    {error ? <p class="g-small" role="alert">{error}</p> : changes.length ? changes.slice(0, 5).map(change => <div class="g-change" key={change.id}><strong>{change.title}</strong><p class="g-small">{change.detail}</p><button class="g-link-btn" onClick={() => onPlan(change.courseId)}>Review coursework <Icon name="arrow" size={14}/></button></div>) : <p class="g-small" role="status">{status}</p>}
  </section>;
}
