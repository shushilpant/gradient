import { registerCanvasHosts } from './canvasHosts.js';
import { loadOptions } from './options/optionsStorage.js';
import { readSourceCanvasMaterials } from './sourceCanvasMaterials.js';
import { browserSearch } from './browserSearch.js';
import { localAssistantFetch } from './assistantTransport.js';
import { isDeadlineMessage, handleDeadlineMessage, initializeDeadlineReminders, deliverDeadlineAlarm, openDeadlineNotification } from './deadlineCalendar.js';

// The toolbar also grants activeTab access for a user-requested page screenshot.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'OFFCANVAS_TOGGLE' }); }
  catch { await chrome.runtime.openOptionsPage(); }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'OFFCANVAS_READ_SOURCE_MATERIALS') {
    void readSourceCanvasMaterials(message, sender.url || '', {windowId:sender.tab?.windowId,incognito:sender.tab?.incognito}).then(data => sendResponse({ok:true,data}), error => sendResponse({ok:false,error:error instanceof Error ? error.message : 'Original course attachment reading failed.'}));
    return true;
  }
  if (message?.type === 'OFFCANVAS_ENABLE_SEARCH') {
    void chrome.permissions.request({origins:['https://www.google.com/*']}).then(granted=>sendResponse({ok:true,data:{granted}}), error=>sendResponse({ok:false,error:String(error)}));
    return true;
  }
  if (message?.type === 'OFFCANVAS_BROWSER_SEARCH') {
    if (typeof message.query !== 'string' || message.query.length > 250) { sendResponse({ok:false,error:'Invalid search query.'}); return false; }
    void browserSearch(message.query, Number(message.limit)||5).then(data=>sendResponse({ok:true,data}),error=>sendResponse({ok:false,error:error instanceof Error?error.message:'Google search failed.'}));
    return true;
  }
  if (isDeadlineMessage(message)) {
    void handleDeadlineMessage(message, sender).then(sendResponse);
    return true;
  }
  if (message?.type === 'OFFCANVAS_ASSISTANT_REQUEST') {
    void (async () => {
      if (typeof message.backendUrl !== 'string' || typeof message.path !== 'string' || !['GET', 'POST'].includes(message.method)) throw new Error('Invalid local assistant request.');
      return localAssistantFetch(message.backendUrl, message.path, message.method, message.body);
    })().then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'The local assistant request failed.' }));
    return true;
  }
  if (message?.type === 'OFFCANVAS_CAPTURE_CONTEXT') {
    void (async () => {
      if (!sender.tab?.id || sender.tab.windowId === undefined) throw new Error('Inspect the page from its Canvas tab.');
      const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (active?.id !== sender.tab.id) throw new Error('Keep the Canvas tab active while inspecting it.');
      try {
        const screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 55 });
        return { screenshot };
      } catch {
        // DOM context is still useful. Chrome grants screenshot access after a toolbar click.
        return { warning: 'Screenshot unavailable. Click the OffCanvas toolbar icon to grant active-tab access, then inspect again.' };
      }
    })().then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Page capture failed.' }));
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener(alarm => { void deliverDeadlineAlarm(alarm).catch(console.error); });
chrome.notifications.onClicked.addListener(id => { void openDeadlineNotification(id).catch(console.error); });
chrome.runtime.onStartup.addListener(() => {
  void initializeDeadlineReminders().catch(console.error);
  void loadOptions().then(registerCanvasHosts).catch(console.error);
});
chrome.runtime.onInstalled.addListener(() => {
  void initializeDeadlineReminders().catch(console.error);
  void loadOptions().then(registerCanvasHosts).catch(console.error);
});
