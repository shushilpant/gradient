// The toolbar button restores or hides GRADIENT in the current Canvas tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'GRADIENT_TOGGLE' }); }
  catch { await chrome.runtime.openOptionsPage(); }
});
