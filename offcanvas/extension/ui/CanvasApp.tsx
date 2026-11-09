import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { type CanvasSnapshot } from '../liveCanvas.js';
import { loadWorkspaceSnapshot } from '../canvasSnapshotCache.js';
import { activateAcademicContext } from '../academicContext.js';
import { Workspace } from './Workspace.js';
import { getPageAutomation, subscribePageAutomation } from '../pageAutomation.js';
import { syncTrackedDeadlines } from '../deadlineCalendar.js';

/** Live controller. Canvas failures stay errors; demo data is never imported here. */
export function CanvasApp({ initialUrl }: { initialUrl: string }) {
  const [snapshot, setSnapshot] = useState<CanvasSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('Connecting to your Canvas account…');
  const activeRequest = useRef<AbortController | null>(null);
  const courseId = new URL(initialUrl).pathname.match(/^\/courses\/(\d+)/)?.[1];
  const assignmentId = new URL(initialUrl).pathname.match(/^\/courses\/\d+\/assignments\/(\d+)/)?.[1];

  const launchCourseId = useRef(courseId);
  const sync = useCallback((force = false) => {
    // All tools share the launch snapshot and join any sync already in flight.
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    activateAcademicContext(null);
    setLoading(true);
    setSnapshot(null);
    setError(null);
    loadWorkspaceSnapshot({ courseId: launchCourseId.current, signal: controller.signal, onProgress: (message) => { if (!controller.signal.aborted) setProgress(message); } }, force)
      .then((result) => {
        if (!controller.signal.aborted) {
          activateAcademicContext(result);
          setSnapshot(result);
          void syncTrackedDeadlines(result).catch(() => { /* The tracking view reports reminder errors separately. */ });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          // Never leave a previous account's data visible after a failed refresh.
          setSnapshot(null);
          setError(reason instanceof Error ? reason.message : 'Canvas could not be reached. Sign in and try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) { activeRequest.current = null; setLoading(false); }
      });
  }, []);

  const refresh = useCallback(() => sync(true), [sync]);

  useEffect(() => {
    // The automation driver checks the current account before every action.
    // Keep a full coursework sync from competing with navigation during a run.
    const running = getPageAutomation()?.status === 'running';
    const unsubscribe = running ? subscribePageAutomation(run => {
      if (run && run.status !== 'running') sync();
    }) : undefined;
    const restore = (event: PageTransitionEvent) => {
      if (running && event.persisted && getPageAutomation()?.status !== 'running') sync();
    };
    window.addEventListener('pageshow', restore);
    if (!running) sync();
    return () => {
      unsubscribe?.();
      window.removeEventListener('pageshow', restore);
      activeRequest.current?.abort();
      activateAcademicContext(null);
    };
  }, [sync]);

  return <Workspace snapshot={snapshot} loading={loading} error={error} progress={progress}
    onRefresh={refresh} initialCourseId={courseId} initialAssignmentId={assignmentId} />;
}
