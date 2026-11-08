/** Explicit, localhost-only visual preview. Never included in the installed extension's entry. */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Workspace } from './ui/Workspace.js';
import { shouldRunOnPage } from './safetyGuard.js';
import { createDemoSnapshot } from './demoScenario.js';
import { activateAcademicContext } from './academicContext.js';
import { FONT_STYLES } from './ui/fontStyles.js';

function previewSnapshot() {
  const selectedDay = document.documentElement.dataset.gradientDemoDate;
  const now = selectedDay ? new Date(`${selectedDay}T12:00:00Z`) : new Date();
  const snapshot = createDemoSnapshot(window.location.origin, Number.isFinite(now.getTime()) ? now : new Date());
  activateAcademicContext(snapshot);
  return snapshot;
}
function Preview() {
  const [snapshot, setSnapshot] = useState(previewSnapshot);
  return <Workspace preview snapshot={snapshot} loading={false} onRefresh={() => setSnapshot(previewSnapshot())}
    initialCourseId={window.location.pathname.match(/\/courses\/(\d+)/)?.[1]} />;
}
if (['localhost', '127.0.0.1'].includes(window.location.hostname) && shouldRunOnPage(window.location.href, document)) {
  const fonts = document.createElement('style'); fonts.id = 'gradient-fonts'; fonts.textContent = FONT_STYLES; document.head.appendChild(fonts);
  const host = document.createElement('div');
  host.id = 'gradient-panel-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0 0 auto auto;width:0;height:0;z-index:2147483646;';
  document.body.appendChild(host);
  render(<Preview />, host.attachShadow({ mode: 'open' }));
}
