import { useState } from 'preact/hooks';
import savedDemo from '../fixtures/ce240_homework1_automation.json';
import { Icon } from './Icons.js';

export function PanicAutomationDemo({ compact = false, onReplay }: {
  compact?: boolean;
  onReplay?: () => void;
}) {
  const [error, setError] = useState('');
  const localCanvas = /^http:\/\/(?:127\.0\.0\.1|localhost):8080$/.test(location.origin);
  return <section class={compact ? 'g-priority-note' : 'g-card'} aria-label="Panic automation demo">
    {!compact && <>
      <div class="g-section-head"><h2>Panic automation</h2><Icon name="clock" size={20}/></div>
      <p class="g-small">CE 240 · {savedDemo.assignmentName}</p>
      <p class="g-small">The cursor opens the course and assignment, then scrolls the instructions in the main Canvas window.</p>
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
