/** Fixed, read-only Google result extraction. No model-generated code is executed. */
export async function browserSearch(query: string, limit: number) {
  const allowed = await chrome.permissions.contains({origins:['https://www.google.com/*']});
  if (!allowed) throw new Error('Enable Google browser search first.');
  const tab = await chrome.tabs.create({url:'https://www.google.com/search?q='+encodeURIComponent(query.slice(0,250)),active:false});
  if (!tab.id) throw new Error('Could not open Google search.');
  let completed = false;
  try {
    for (let attempt=0; attempt<15; attempt++) {
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete') {
        const [result] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=> {
          const results:Array<{title:string;url:string;snippet:string}> = [];
          for (const heading of Array.from(document.querySelectorAll('h3'))) {
            const anchor = heading.closest('a');
            if (!anchor) continue;
            try {
              const url = new URL(anchor.href);
              if (url.protocol !== 'https:' || url.hostname === 'google.com' || url.hostname.endsWith('.google.com') || url.username || url.password) continue;
              if (results.some(r=>r.url===url.href)) continue;
              results.push({title:(heading.textContent||'').slice(0,500),url:url.href,snippet:(anchor.parentElement?.parentElement?.textContent||'').slice(0,1800)});
            } catch { /* Ignore non-web navigation. */ }
          }
          return results;
        }});
        const results = result?.result || [];
        if (results.length) { completed = true; return results.slice(0,Math.min(8,Math.max(1,limit))); }
      }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    await chrome.tabs.update(tab.id,{active:true});
    throw new Error('Google needs attention or returned no readable results. Check the Google tab for consent or a human challenge, then retry.');
  } finally { if(completed) await chrome.tabs.remove(tab.id).catch(()=>{}); }
}
