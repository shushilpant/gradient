import { useState } from 'preact/hooks';
import savedDemo from '../../backend/demo_automation.json';
import { packetSchema } from '../assistantClient.js';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { canAutomateCurrentPage, getPageAutomation } from '../pageAutomation.js';
import { getPageDemoTarget, startPageDemo } from '../pageDemo.js';
import { GroundedMarkdown } from './AssistantView.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';
import { ComputedVisuals } from './WorkEvidence.js';
import { Icon } from './Icons.js';
import { WORKFLOW_STYLES } from './workflowStyles.js';

const packet = packetSchema.parse(savedDemo.packet);
const steps = [
  ['Open the course', 'GRADIENT-SIGNALS · Signals and Systems'],
  ['Find the homework', 'Open Assignments, then Homework: Time-shift response.'],
  ['Read the instructions', 'Inspect the delayed response and the requested graph.'],
  ['Show the prepared assignment', 'Pause for 10 seconds, then display the saved solution and plot.'],
];

/** Prepared presentation content; live Canvas navigation starts only on a click. */
export function AutomationPresentationDemo({ snapshot, onReplay }: {
  snapshot?: CanvasSnapshot;
  onReplay?: () => void;
}) {
  const [error, setError] = useState('');
  const available = snapshot?.origin === location.origin &&
    canAutomateCurrentPage() && !!getPageDemoTarget(snapshot) &&
    getPageAutomation()?.status !== 'running';
  const replay = () => {
    if (!available || !snapshot) return;
    setError('');
    try {
      onReplay?.();
      startPageDemo(snapshot);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Canvas demo could not start.');
    }
  };

  return <section class="wf-auto ja" aria-label="Prepared automation demo">
    <style>{WORKFLOW_STYLES + ASSISTANT_STYLES}</style>
    <header class="wf-auto-head"><h1>Automation demo</h1></header>
    <div class="g-notice" style={{display:'block'}}><strong>Saved demo · GRADIENT-SIGNALS</strong><p>The prepared workflow and assignment below are ready to present. Replay the steps in your current local Canvas tab when the seeded course is available.</p></div>
    <button class="g-primary" disabled={!available} onClick={replay}><Icon name="bolt" size={18}/>Run saved Canvas demo</button>
    {!available && <p class="g-small">The saved example is available here. To replay its navigation, open the signed-in local Canvas course on port 8080 with GRADIENT-SIGNALS loaded.</p>}
    {error && <p class="g-notice" role="alert">{error}</p>}
    <section aria-label="Saved automation sequence">
      <h2>Prepared sequence</h2>
      <ol class="wf-step-list">{steps.map(([title, detail], index) => <li key={title}>
        <span class="wf-step-number">{String(index + 1).padStart(2, '0')}</span>
        <div><strong>{title}</strong><p>{detail}</p></div>
      </li>)}</ol>
    </section>
    <section class="ja-result" aria-label="Saved automation assignment">
      <header class="ja-result-header"><h2>{packet.title}</h2><p>{packet.summary}</p></header>
      <div class="ja-result-body">
        <ComputedVisuals packet={packet}/>
        <details><summary>View the saved worked assignment</summary><GroundedMarkdown text={packet.sampleMarkdown} sources={packet.sources}/></details>
      </div>
    </section>
  </section>;
}
