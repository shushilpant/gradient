import { useEffect, useRef, useState } from 'preact/hooks';
import savedDemo from '../../backend/demo_automation.json';
import { packetSchema } from '../assistantClient.js';
import { GroundedMarkdown } from './AssistantView.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';
import { Icon } from './Icons.js';
import { ComputedVisuals } from './WorkEvidence.js';

const packet = packetSchema.parse(savedDemo.packet);
const screens = [
  { title: 'Canvas dashboard', target: savedDemo.courseCode },
  { title: savedDemo.courseCode, target: 'Assignments' },
  { title: 'Assignments', target: savedDemo.assignmentName },
];
const steps = [
  ...savedDemo.navigation.map((step, index) => ({
    ...screens[index]!,
    label: step.label.replace('{courseCode}', savedDemo.courseCode).replace('{assignmentName}', savedDemo.assignmentName),
    detail: '',
  })),
  { title: savedDemo.assignmentName, target: 'Assignment instructions', label: 'Reading assignment instructions',
    detail: packet.sources.find(source => source.title === savedDemo.assignmentName)?.excerpt ?? '' },
];

export function PanicAutomationDemo({ compact = false, onReplay, onStart, onDone }: {
  compact?: boolean;
  onReplay?: () => boolean;
  onStart?: () => void;
  onDone?: () => void;
}) {
  const [frame, setFrame] = useState<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const step = steps[frame ?? -1];
  const complete = frame === steps.length;
  useEffect(() => {
    if (frame === null) return;
    if (complete) {
      doneRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => setFrame(frame + 1), 800);
    return () => window.clearTimeout(timer);
  }, [frame, complete]);

  return <section class={compact ? 'g-priority-note' : 'g-card'} aria-label="Panic automation demo">
    {!compact && <div class="g-section-head">
      <div><span class="g-eyebrow">Saved walkthrough</span><h2>Panic automation</h2></div>
      <Icon name="clock" size={20}/>
    </div>}
    {(!compact || frame !== null) && <>
      <p class="g-small">Both sample deadlines are within two hours. Panic starts with the assignment worth more of the final grade.</p>
      <ol class="g-priority-items" aria-label="Sample deadline priorities">
        <li class="g-priority-item"><span class="g-priority-number" aria-hidden="true">1</span>
          <div class="g-task-main"><strong>{savedDemo.assignmentName}</strong><small class="g-small">10 percentage points · selected</small></div><span class="g-due">45m left</span>
        </li>
        <li class="g-priority-item"><span class="g-priority-number" aria-hidden="true">2</span>
          <div class="g-task-main"><strong>Reading reflection</strong><small class="g-small">5 percentage points</small></div><span class="g-due">30m left</span>
        </li>
      </ol>
    </>}
    <div class="g-priority-note">
      {step ? <button type="button" class="g-secondary" onClick={() => { setFrame(null); onDone?.(); }}>Stop demo</button>
        : <button type="button" class={compact ? 'g-link-btn' : 'g-secondary'} onClick={() => {
          if (onReplay?.()) return;
          onStart?.();
          setFrame(0);
        }}><Icon name="bolt" size={14}/>Demo panic automation</button>}
    </div>
    {step && <section class="g-card soft g-priority-note" aria-label="Saved Canvas replay">
      <span class="g-eyebrow">Synthetic Canvas preview</span>
      <div class="g-section-head"><h3>{step.title}</h3><span class="g-label-count">{(frame ?? 0) + 1}/{steps.length}</span></div>
      <p class="g-notice info">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 1v12l3-3 2 5 2-1-2-5h5z"/></svg>
        {step.target}
      </p>
      {step.detail && <p class="g-small g-priority-note">{step.detail}</p>}
      <p class="g-small g-priority-note" role="status">{step.label}</p>
    </section>}
    {complete && <section class="ja g-priority-note" aria-label="Saved panic reference"><style>{ASSISTANT_STYLES}</style>
      <article class="ja-result">
        <header class="ja-result-header"><span class="g-eyebrow">Synthetic Canvas preview</span>
          <h2>Saved reference assignment</h2><p>{packet.title}</p><p>{packet.summary}</p>
        </header>
        <div class="ja-result-body">
          <ComputedVisuals packet={packet}/>
          <GroundedMarkdown text={packet.sampleMarkdown ?? packet.markdown} sources={packet.sources}/>
        </div>
      </article>
    </section>}
  </section>;
}
