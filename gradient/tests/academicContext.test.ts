import { afterEach, expect, it, vi } from 'vitest';
import type { CanvasSnapshot } from '../extension/liveCanvas.js';
import { activateAcademicContext, getAcademicContext, readAcademicMaterials, subscribeAcademicContext, syllabusContext } from '../extension/academicContext.js';

const origin='https://school.instructure.com';
function snapshot(user='1'):CanvasSnapshot {
  return {origin,syncedAt:'2026-11-07T00:00:00Z',user:{id:user,name:'Student',shortName:'Student'},issues:[],courses:[{
    id:'10',code:'CS101',name:'Introduction to Algorithms',url:origin+'/courses/10',syllabusHtml:'<p>Learning objectives: machine learning with Python and data analysis.</p>',
    resources:[{id:'100',type:'file',title:'Methods.pdf',url:origin+'/courses/10/files/100'}],assignments:[{
      id:'20',groupId:'g',name:'Python analysis',pointsPossible:10,dueAt:null,submissionTypes:[],hasRubric:true,omitFromFinalGrade:false,
      htmlUrl:origin+'/courses/10/assignments/20',descriptionHtml:'Analyse a dataset.',rubric:[{id:'python',description:'Python data analysis',points:10,ratings:[]}],
      submission:{assignmentId:'20',score:10,posted:true,excused:false,missing:false,late:false,workflowState:'graded',rubricAssessment:{python:{points:10}}}
    }],input:{course:{id:'10',name:'Algorithms',creditHours:3,applyGroupWeights:false,gradingScheme:[],gradePointScale:{}},groups:[],assignments:[],submissions:[]},
    announcements:[],calendarEvents:[],issues:[],currentScore:100,finalScore:100
  }]};
}
afterEach(()=>{activateAcademicContext(null);vi.unstubAllGlobals();});
it('reuses one structured context and separates assessed skills from inferred course exposure',()=>{
  const source=snapshot(),context=getAcademicContext(source);
  expect(getAcademicContext(source)).toBe(context);
  expect(context.research.interests.find(item=>item.topic==='machine learning')?.evidence[0]?.kind).toBe('syllabus');
  expect(context.research.skills.find(item=>item.name==='Python')?.status).toBe('demonstrated');
  expect(context.research.skills.find(item=>item.name==='Machine learning')?.status).toBe('inferred');
  expect(context.assignments[0]?.assignment.id).toBe('20');
  expect(context.syllabi.get('10')?.learningObjectives).toEqual(['machine learning with Python and data analysis.']);
});
it('extracts only explicit syllabus objectives and keeps their original text',()=>{
  expect(syllabusContext('<h2>Learning outcomes</h2><ul><li>Analyse data with Python.</li><li>Explain neural networks.</li></ul><h2>Policies</h2><p>Submit weekly</p>').learningObjectives).toEqual(['Analyse data with Python.','Explain neural networks.']);
  expect(syllabusContext('<p>Python programming and biology.</p><script>Learning outcomes: robotics</script>').learningObjectives).toEqual([]);
});
it('does not infer demonstrated skill from grades without a fully scored matching rubric',()=>{
  const source=snapshot();source.courses[0]!.assignments[0]!.submission!.rubricAssessment!.python!.points=5;
  expect(getAcademicContext(source).research.skills.find(item=>item.name==='Python')?.status).toBe('inferred');
});
it('shares permission-checked material text between consumers, and invalidates cache on account switch',async()=>{
  const source=snapshot(),context=activateAcademicContext(source)!;
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({url:origin+'/files/100/download'}))).mockResolvedValueOnce(new Response('pdf'));
  vi.stubGlobal('fetch',fetch);const extract=vi.fn(async()=>({text:'Robotics research with numerical simulation',warnings:[]}));
  const resources=source.courses[0]!.resources;
  const changed=vi.fn(),unsubscribe=subscribeAcademicContext(context,changed);
  await readAcademicMaterials(context,'10',resources,extract);
  expect(changed).toHaveBeenCalledOnce();unsubscribe();
  await readAcademicMaterials(context,'10',resources,extract);
  expect(changed).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);expect(extract).toHaveBeenCalledTimes(1);
  expect(context.research.skills.find(skill=>skill.name==='Robotics')?.evidence[0]?.title).toBe('Methods.pdf');
  activateAcademicContext(snapshot('2'));
  expect(context.materials.size).toBe(0);
  expect(context.research.skills.some(skill=>skill.name==='Robotics')).toBe(false);
  await expect(readAcademicMaterials(context,'10',resources,extract)).rejects.toMatchObject({name:'AbortError'});
});
it('rejects late resource results after refresh and does not cache another account text',async()=>{
  const source=snapshot(),context=activateAcademicContext(source)!;
  let finish!:(value:{text:string;warnings:string[]})=>void;
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({url:origin+'/files/100/download'}))).mockResolvedValueOnce(new Response('pdf'));
  vi.stubGlobal('fetch',fetch);
  const extracting=new Promise<{text:string;warnings:string[]}>(resolve=>{finish=resolve;});
  const extract=vi.fn(()=>extracting);
  const pending=readAcademicMaterials(context,'10',source.courses[0]!.resources,extract);
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledOnce());
  activateAcademicContext(null);finish({text:'Private old account data',warnings:[]});
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(context.materials.size).toBe(0);
});
it('does not fetch resource URLs that were not discovered in the active course',async()=>{
  const context=activateAcademicContext(snapshot())!,fetch=vi.fn(),extract=vi.fn();vi.stubGlobal('fetch',fetch);
  const resources=[{title:'Undiscovered',url:origin+'/courses/10/files/999',text:'Untrusted provided text'}];
  expect((await readAcademicMaterials(context,'10',resources,extract)).resources).toEqual([{title:'Undiscovered',url:resources[0]!.url}]);
  expect(fetch).not.toHaveBeenCalled();expect(extract).not.toHaveBeenCalled();
});

it('does not classify computing environments or genetic algorithms as environmental science or biology',()=>{
  const source=snapshot();
  source.courses[0]!.name='CSC 441 H002';
  source.courses[0]!.syllabusHtml='<p>Learning objectives: machine learning, neural networks and genetic algorithms in a programming environment.</p>';
  source.courses[0]!.assignments=[];
  const topics=getAcademicContext(source).research.interests.map(item=>item.topic);
  expect(topics).toContain('machine learning');
  expect(topics).not.toContain('biology');expect(topics).not.toContain('genetics');expect(topics).not.toContain('environmental science');
});
it('does not attribute illustrative application domains and institutional computer policies to a mathematics course',()=>{
  const source=snapshot();source.courses[0]!.name='MAT320 Mathematical Modeling';source.courses[0]!.assignments=[];
  source.courses[0]!.syllabusHtml='<p>Course topics: mathematics and probability.</p><p>Applications include many examples. For example biology, genetics and climate change are possible modelling scenarios.</p><p>Computer access and software installation requirements apply to all students.</p>';
  expect(getAcademicContext(source).research.interests.map(item=>item.topic)).toEqual(['mathematics']);
});
it('requires corroboration for an isolated topic in a long assignment body',()=>{
  const source=snapshot();source.courses[0]!.name='CE 260';source.courses[0]!.syllabusHtml='';
  source.courses[0]!.assignments=[{...source.courses[0]!.assignments[0]!,name:'Homework 1',descriptionHtml:'Read the instructions. '.repeat(50)+'Climate change is mentioned once.',rubric:[]}];
  expect(getAcademicContext(source).research.interests).toEqual([]);
});
