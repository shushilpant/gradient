/**
 * GRADIENT Options Controller
 */

import {
  loadOptions,
  saveOptions,
  DEFAULT_GRADIENT_OPTIONS,
  GradientOptions,
} from './optionsStorage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const hostsEl = document.getElementById('canvas-hosts') as HTMLTextAreaElement;
  const creditsTbody = document.getElementById('credits-tbody') as HTMLTableSectionElement;
  const scaleTbody = document.getElementById('scale-tbody') as HTMLTableSectionElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const statusMsg = document.getElementById('status-msg') as HTMLDivElement;

  function render(opts: GradientOptions) {
    // 1. Hosts
    hostsEl.value = opts.canvasHosts.join('\n');

    // 2. Credits
    creditsTbody.innerHTML = '';
    for (const [code, credits] of Object.entries(opts.courseCreditHours)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${code}</strong></td>
        <td><input type="number" step="0.5" min="0" max="10" data-course="${code}" value="${credits}"></td>
      `;
      creditsTbody.appendChild(tr);
    }

    // 3. Scale
    scaleTbody.innerHTML = '';
    for (const [letter, points] of Object.entries(opts.gradePointScale)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${letter}</strong></td>
        <td><input type="number" step="0.1" min="0" max="5.0" data-letter="${letter}" value="${points}"></td>
      `;
      scaleTbody.appendChild(tr);
    }
  }

  const initialOpts = await loadOptions();
  render(initialOpts);

  saveBtn.addEventListener('click', async () => {
    const rawHosts = hostsEl.value
      .split('\n')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const creditInputs = creditsTbody.querySelectorAll<HTMLInputElement>('input[data-course]');
    const newCredits: Record<string, number> = {};
    creditInputs.forEach((inp) => {
      const c = inp.dataset['course']!;
      newCredits[c] = parseFloat(inp.value) || 0;
    });

    const scaleInputs = scaleTbody.querySelectorAll<HTMLInputElement>('input[data-letter]');
    const newScale: Record<string, number> = {};
    scaleInputs.forEach((inp) => {
      const l = inp.dataset['letter']!;
      newScale[l] = parseFloat(inp.value) || 0;
    });

    await saveOptions({
      canvasHosts: rawHosts,
      courseCreditHours: newCredits,
      gradePointScale: newScale,
    });

    statusMsg.textContent = 'Settings saved successfully.';
    setTimeout(() => {
      statusMsg.textContent = '';
    }, 2500);
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      await saveOptions(DEFAULT_GRADIENT_OPTIONS);
      render(DEFAULT_GRADIENT_OPTIONS);
      statusMsg.textContent = 'Defaults restored.';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 2500);
    }
  });
});

