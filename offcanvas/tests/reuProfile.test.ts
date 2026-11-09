import {it,expect} from 'vitest';
import {researchProfile} from '../extension/reuProfile.js';
import type {CanvasSnapshot} from '../extension/liveCanvas.js';
it('connects research fields to enrolled course names and syllabus topics',()=>{
 const snapshot={courses:[{id:'1',name:'Introduction to Algorithms',code:'CS101',syllabusHtml:'<p>Machine learning and neural networks.</p>'},{id:'2',name:'Lab methods',code:'BIO200',syllabusHtml:'<p>Molecular biology and genetics</p>'}]} as CanvasSnapshot;
 const profile=researchProfile(snapshot);
 expect(profile.find(item=>item.topic==='machine learning')?.courses).toEqual(['CS101']);
 expect(profile.find(item=>item.topic==='biology')?.courses).toEqual(['BIO200']);
});
it('ignores scripts in syllabus HTML',()=>{
 const snapshot={courses:[{id:'1',name:'History',code:'HIS101',syllabusHtml:'<script>machine learning biology</script><p>Ancient civilizations</p>'}]} as CanvasSnapshot;
 expect(researchProfile(snapshot)).toEqual([]);
});
