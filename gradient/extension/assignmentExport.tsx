import {h,render} from 'preact';
import {AssistantMarkdown} from './ui/AssistantView.js';
import {renderAssignmentPdf} from './assistantClient.js';
import type {AssistantSettings,StudyPacket} from './assistantTypes.js';
export function assignmentDocument(packet:StudyPacket):string {
 const host=document.createElement('div');
 // Remove duplicate model-written disclosures and process commentary sections.
 const sample=packet.sampleMarkdown.replace(/[\u2010-\u2015]/g,'-').replace(/(?<!\*)\*([A-Za-z][^*\n]{0,100})\*(?!\*)/g,'**$1**').replace(/^#{1,6}\s+.*(?:AI assistance disclosure|AI disclosure|notes to verify|coverage review|before you submit)[^\n]*\n[\s\S]*?(?=^#{1,6}\s|$(?![\s\S]))/gim,'').replace(/^.*(?:AI-generated sample|AI generated sample|sample for review|verify:).*$/gim,'').trim();
 render(h(AssistantMarkdown,{text:sample}),host);
 if(host.querySelector('.ja-math-error')){render(null,host);throw new Error('A formula could not be typeset. The PDF was not exported with broken math. Regenerate the sample or correct the formula and retry.');}
 host.querySelectorAll('p').forEach(paragraph=>{if(/^\s*(?:AI assistance disclosure|AI disclosure|AI-generated (?:reference )?sample)\s*[:.-]/i.test(paragraph.textContent||''))paragraph.remove();});
 host.querySelectorAll('h1,h2,h3').forEach(heading=>{if(/^Reference Sample for /i.test(heading.textContent||''))heading.textContent=(heading.textContent||'').replace(/^Reference Sample for /i,'');});
 host.querySelectorAll('hr').forEach(line=>line.remove());
 const figures=(packet.renderedVisuals??[]).map(figure=>`<figure><img src="data:image/png;base64,${figure.data}"/><figcaption>${figure.title.replace(/[<>&]/g,'')}</figcaption></figure>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font:11pt/1.55 Georgia,serif;color:#111}h1,h2,h3{line-height:1.25;break-after:avoid}h2{font-size:16pt;margin-top:22pt}h3{font-size:13pt}p{margin:9pt 0} .notice{font:10pt/1.5 Arial,sans-serif;border-bottom:1px solid #aaa;padding-bottom:10pt;margin-bottom:20pt}math[display=block],.ja-math-block{display:block;text-align:center;margin:14pt 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:9pt/1.4 monospace;background:#f5f5f5;padding:10pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6pt}figure{break-inside:avoid;margin:20pt 0}img{max-width:100%}figcaption{font-size:10pt;text-align:center}a{color:inherit;text-decoration:none}</style></head><body><div class="notice"><strong>AI-generated sample.</strong> Check all calculations, claims, and references for accuracy before use.</div>${host.innerHTML}${figures}</body></html>`;
 render(null,host);return html;
}
export async function downloadAssignmentPdf(settings:AssistantSettings,packet:StudyPacket){
 const data=await renderAssignmentPdf(settings,assignmentDocument(packet));
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
 const link=document.createElement('a');link.href=url;link.download='assignment-sample.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
