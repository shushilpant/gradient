import { Icon } from './Icons.js';

const PASSED_TITLE = 'Assessment check passed';
const DECLINED_TITLE = 'Automation declined';
const CHECKED_HOMEWORK = 'OffCanvas checked for a timed quiz or exam and identified regular homework';
const REFUSAL = 'OffCanvas would refuse either type of assessment.';

export function DemoAssessmentBanner({ blocked }: { blocked?: string | null }) {
  return <div class={`g-notice${blocked ? '' : ' success'} g-priority-note`} role={blocked ? 'alert' : 'status'} aria-label="Assessment check">
    <Icon name="shield" size={16}/>
    <div><strong>{blocked ? DECLINED_TITLE : PASSED_TITLE}</strong><p>{blocked ?? `${CHECKED_HOMEWORK}, so the saved automation continued. ${REFUSAL}`}</p></div>
  </div>;
}

