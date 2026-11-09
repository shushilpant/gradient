import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
function storage(settings:object){
 const values=new Map([['offcanvas_assistant_settings',JSON.stringify(settings)]]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 return values;
}
it('migrates the previous GPT default once and preserves later model choices',async()=>{
 const values=storage({reasoningModel:'gpt-oss:20b'});
 const client=await import('../extension/assistantClient.js');
 expect((await client.loadAssistantSettings()).reasoningModel).toBe('qwen3:30b-a3b-thinking-2507-q8_0');
 expect(JSON.parse(values.get('offcanvas_assistant_settings')!).modelDefaultsVersion).toBe(2);
 await client.saveAssistantSettings({reasoningModel:'gpt-oss:20b'});
 expect((await client.loadAssistantSettings()).reasoningModel).toBe('gpt-oss:20b');
});
it('keeps an existing choice of a different model',async()=>{
 storage({reasoningModel:'qwen3:8b'});
 const client=await import('../extension/assistantClient.js');
 expect((await client.loadAssistantSettings()).reasoningModel).toBe('qwen3:8b');
});
