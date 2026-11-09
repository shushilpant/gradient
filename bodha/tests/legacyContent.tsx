/** Regression harness for retained experimental tools. Never referenced by the MV3 manifest. */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { LegacyWorkspace } from '../extension/ui/LegacyWorkspace.js';
import { loadCanvasSnapshot, type CanvasSnapshot } from '../extension/liveCanvas.js';
import { activateAcademicContext } from '../extension/academicContext.js';
import { shouldRunOnPage } from '../extension/safetyGuard.js';
function LegacyHarness() {
  const [snapshot, setSnapshot] = useState<CanvasSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const refresh = () => {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    activateAcademicContext(null); setSnapshot(null); setLoading(true);
    void loadCanvasSnapshot({ signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { activateAcademicContext(value); setSnapshot(value); }
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); }).finally(() => {
      if (!controller.signal.aborted) { pending.current = null; setLoading(false); }
    });
  };
  useEffect(() => { refresh(); return () => pending.current?.abort(); }, []);
  return <LegacyWorkspace snapshot={snapshot} loading={loading} error={error} onRefresh={refresh} initialCourseId={location.pathname.match(/courses\/(\d+)/)?.[1]}/>;
}
if (shouldRunOnPage(location.href, document)) {
  const host = document.createElement('div'); host.id = 'offcanvas-panel-host'; document.body.append(host);
  render(<LegacyHarness/>, host.attachShadow({ mode: 'open' }));
}
