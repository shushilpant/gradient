import { h, render } from 'preact';
import { shouldRunOnPage } from './safetyGuard.js';
import { loadOptions } from './options/optionsStorage.js';
import { CanvasApp } from './ui/CanvasApp.js';

export function matchesCanvasHost(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2).toLowerCase();
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern.toLowerCase();
}

export async function initPanel(): Promise<{ injected: boolean; reason: string }> {
  if (window.top !== window.self) return { injected: false, reason: 'Top-level Canvas pages only' };
  if (!shouldRunOnPage(window.location.href, document)) {
    return { injected: false, reason: 'Assessment page or unsupported Canvas view' };
  }
  const options = await loadOptions();
  if (!options.canvasHosts.some((host) => matchesCanvasHost(window.location.hostname, host))) {
    return { injected: false, reason: 'This host is not configured as Canvas' };
  }
  if (!shouldRunOnPage(window.location.href, document)) return { injected: false, reason: 'Canvas navigated to an assessment' };
  if (document.getElementById('gradient-panel-host')) return { injected: true, reason: 'Already mounted' };
  const host = document.createElement('div');
  host.id = 'gradient-panel-host';
  // Reset inherited site styles while keeping the Canvas DOM and styles untouched.
  host.style.cssText = 'all:initial;position:fixed;inset:0 0 auto auto;width:0;height:0;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  render(h(CanvasApp, { initialUrl: window.location.href }), shadow);
  return { injected: true, reason: 'Connected Canvas workspace mounted' };
}

let lastUrl = '';
let mounting = false;
async function reconcilePage(): Promise<void> {
  if (mounting) return;
  const host = document.getElementById('gradient-panel-host');
  if (!shouldRunOnPage(window.location.href, document)) {
    if (host?.shadowRoot) render(null, host.shadowRoot);
    host?.remove();
    lastUrl = '';
    return;
  }
  if (host && lastUrl === window.location.href) return;
  if (host?.shadowRoot) {
    render(h(CanvasApp, { initialUrl: window.location.href }), host.shadowRoot);
    lastUrl = window.location.href;
    return;
  }
  mounting = true;
  try {
    const result = await initPanel();
    if (result.injected) lastUrl = window.location.href;
  } finally { mounting = false; }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void reconcilePage(), { once: true });
  else void reconcilePage();
  // Canvas uses client-side navigation; also remove the panel if an assessment appears.
  window.setInterval(() => void reconcilePage(), 1000);
  window.addEventListener('popstate', () => void reconcilePage());
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'GRADIENT_TOGGLE') window.dispatchEvent(new Event('gradient:toggle'));
    });
  }
}
