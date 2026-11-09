import { PALETTE_TOKENS } from '../ui/palette.js';
const paletteStyle = document.createElement('style');
paletteStyle.textContent = `:root{${PALETTE_TOKENS}--primary:var(--g-accent);--bg:var(--g-canvas);--card:var(--g-surface);--text:var(--g-ink);--muted:var(--g-muted);--border:var(--g-line-2)}`;
document.head.appendChild(paletteStyle);
import { loadOptions, saveOptions, normalizeCanvasHost, DEFAULT_OFFCANVAS_OPTIONS, type OffCanvasOptions } from './optionsStorage.js';
import { customCanvasOrigins, registerCanvasHosts } from '../canvasHosts.js';

const hostsEl = document.getElementById('canvas-hosts') as HTMLTextAreaElement;
const creditsTbody = document.getElementById('credits-tbody') as HTMLTableSectionElement;
const scaleTbody = document.getElementById('scale-tbody') as HTMLTableSectionElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLDivElement;

function status(message: string, error = false) {
  statusMsg.textContent = message;
  statusMsg.dataset.error = String(error);
}

function numberRow(key: string, value: number, kind: 'course' | 'letter'): HTMLTableRowElement {
  const row = document.createElement('tr');
  const label = document.createElement('td');
  label.textContent = key;
  const field = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'number'; input.min = kind === 'course' ? '0.5' : '0'; input.max = kind === 'course' ? '30' : '5';
  input.step = kind === 'course' ? '0.5' : '0.01'; input.value = String(value);
  input.dataset[kind] = key; input.setAttribute('aria-label', `${key} ${kind === 'course' ? 'credit hours' : 'GPA points'}`);
  field.appendChild(input); row.append(label, field);
  return row;
}

function render(options: OffCanvasOptions) {
  hostsEl.value = options.canvasHosts.join('\n');
  creditsTbody.replaceChildren(...Object.entries(options.courseCreditHours).map(([key, value]) => numberRow(key, value, 'course')));
  if (!creditsTbody.childElementCount) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 2;
    cell.textContent = 'Set credit hours beside each course in Grade Lab.'; row.appendChild(cell); creditsTbody.appendChild(row);
  }
  scaleTbody.replaceChildren(...Object.entries(options.gradePointScale).map(([key, value]) => numberRow(key, value, 'letter')));
}

function readNumbers(table: HTMLElement, kind: 'course' | 'letter'): Record<string, number> {
  const entries: [string, number][] = [];
  for (const input of Array.from(table.querySelectorAll<HTMLInputElement>(`input[data-${kind}]`))) {
    if (!input.checkValidity() || input.value === '' || !Number.isFinite(input.valueAsNumber)) throw new Error('Enter a valid number in every credit and GPA field.');
    entries.push([input.dataset[kind]!, input.valueAsNumber]);
  }
  return Object.fromEntries(entries);
}

render(DEFAULT_OFFCANVAS_OPTIONS);
loadOptions().then(render).catch(() => status('Could not load settings. Reload this page to try again.', true));

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true; resetBtn.disabled = true;
  try {
    const rawHosts = hostsEl.value.split('\n').map(host => host.trim()).filter(Boolean);
    const invalid = rawHosts.find(host => !normalizeCanvasHost(host));
    if (invalid) throw new Error(`Use a hostname such as canvas.school.edu. Remove URLs, ports, and wildcards from “${invalid}”.`);
    const canvasHosts = [...new Set(rawHosts.map(host => normalizeCanvasHost(host)!))];
    if (!canvasHosts.length) throw new Error('Add at least one Canvas hostname.');
    const courseCreditHours = readNumbers(creditsTbody, 'course');
    const gradePointScale = readNumbers(scaleTbody, 'letter');
    const origins = customCanvasOrigins(canvasHosts);
    // Request inside the click handler, before any asynchronous work loses the user gesture.
    if (origins.length && !await chrome.permissions.request({ origins })) throw new Error('Site access was not granted. Settings were not changed.');
    const options = await saveOptions({ canvasHosts, courseCreditHours, gradePointScale });
    await registerCanvasHosts(options);
    render(options);
    status('Saved. Refresh your Canvas tab to apply.');
  } catch (error) { status(error instanceof Error ? error.message : 'Could not save settings. Try again.', true); }
  finally { saveBtn.disabled = false; resetBtn.disabled = false; }
});

resetBtn.addEventListener('click', async () => {
  saveBtn.disabled = true; resetBtn.disabled = true;
  try {
    const options = await saveOptions(DEFAULT_OFFCANVAS_OPTIONS);
    await registerCanvasHosts(options); render(options); status('Defaults restored. Refresh your Canvas tab to apply.');
  } catch (error) { status(error instanceof Error ? error.message : 'Could not restore defaults.', true); }
  finally { saveBtn.disabled = false; resetBtn.disabled = false; }
});
