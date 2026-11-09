import { WORKFLOW_STYLES } from './workflowStyles.js';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { canAutomateCurrentPage } from '../pageAutomation.js';
import { PAGE_DEMO_SEED_MESSAGE } from '../pageDemo.js';

/** Explains how to open the seeded local Canvas replay. */
export function AutomationPresentationDemo({ snapshot }: {
  snapshot?: CanvasSnapshot;
}) {
  const local = snapshot?.origin === location.origin && canAutomateCurrentPage();
  return <section class="wf-auto" aria-label="Local Canvas demo setup">
    <style>{WORKFLOW_STYLES}</style>
    <header class="wf-auto-head"><h1>Automation demo</h1></header>
    <p class="g-notice" role="status">{local
      ? PAGE_DEMO_SEED_MESSAGE
      : 'Open the signed-in local Canvas replica on port 8080 to run the demo.'}</p>
    <p>Watch the cursor open GRADIENT-SIGNALS, click Assignments and scroll the time-shift homework. The saved solution and graph appear when playback finishes.</p>
    {!local && <a class="g-primary" href="http://127.0.0.1:8080/">Open local Canvas</a>}
  </section>;
}
