import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { loadCanvasSnapshot, type CanvasSnapshot } from '../liveCanvas.js';
import { Workspace } from './Workspace.js';
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
  const refresh = useCallback(() => {
    // All tools share the launch snapshot and join any sync already in flight.
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setSnapshot(null);
    setError(null);
    loadCanvasSnapshot({ courseId: launchCourseId.current, signal: controller.signal, onProgress: (message) => { if (!controller.signal.aborted) setProgress(message); } })
      .then((result) => {
        if (!controller.signal.aborted) {
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

  useEffect(() => {
    refresh();
    return () => activeRequest.current?.abort();
  }, [refresh]);

  return <Workspace snapshot={snapshot} loading={loading} error={error} progress={progress}
    onRefresh={refresh} initialCourseId={courseId} initialAssignmentId={assignmentId} />;
}
