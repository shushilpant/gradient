import { normalizeCanvasHost, type OffCanvasOptions } from './options/optionsStorage.js';
import { legacyStorageKeys } from './brandStorage.js';

const DYNAMIC_SCRIPT_ID = 'offcanvas-custom-canvas';

export function isBuiltInCanvasHost(host: string): boolean {
  return host === '*.instructure.com' || host === 'instructure.com' || host.endsWith('.instructure.com') ||
    host === 'canvas.usm.edu' || host === 'localhost' || host === '127.0.0.1';
}

export function customCanvasOrigins(hosts: string[]): string[] {
  return [...new Set(hosts.map(normalizeCanvasHost).filter((host): host is string => !!host && !isBuiltInCanvasHost(host)))]
    .map(host => `https://${host}/*`);
}

/** Persist custom-domain injection across browser restarts, only for origins explicitly granted by the user. */
export async function registerCanvasHosts(options: OffCanvasOptions): Promise<void> {
  const origins = customCanvasOrigins(options.canvasHosts);
  const matches: string[] = [];
  for (const origin of origins) {
    if (await chrome.permissions.contains({ origins: [origin] })) matches.push(origin);
  }
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [DYNAMIC_SCRIPT_ID, ...legacyStorageKeys(DYNAMIC_SCRIPT_ID)] });
  const legacyIds = scripts.filter(script => script.id !== DYNAMIC_SCRIPT_ID).map(script => script.id);
  if (legacyIds.length) await chrome.scripting.unregisterContentScripts({ ids: legacyIds });
  const registered = scripts.some(script => script.id === DYNAMIC_SCRIPT_ID);
  if (!matches.length) {
    if (registered) await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
    return;
  }
  const script: chrome.scripting.RegisteredContentScript = {
    id: DYNAMIC_SCRIPT_ID, matches, js: ['extension/content.js'], runAt: 'document_idle', allFrames: false,
    persistAcrossSessions: true,
  };
  if (registered) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}
