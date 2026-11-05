import { describe, it, expect } from 'vitest';
import { createGpaSimulator, type CourseOptimizationInput } from '../core/optimiser.js';
import { CourseSchema, AssignmentGroupSchema, AssignmentSchema, SubmissionSchema } from '../core/schema.js';
function course(id:string, credits:number, score:number, pending=false):CourseOptimizationInput {
 return {course:CourseSchema.parse({id,name:id,creditHours:credits,applyGroupWeights:false}),groups:[AssignmentGroupSchema.parse({id:'g',name:'Homework',weight:100})],assignments:[AssignmentSchema.parse({id:'a',groupId:'g',name:'Homework',pointsPossible:100}),...(pending?[AssignmentSchema.parse({id:'b',groupId:'g',name:'Homework 2',pointsPossible:100,dueAt:'2027-01-01T00:00:00Z'})]:[])],submissions:[SubmissionSchema.parse({assignmentId:'a',score,posted:true})]};
}
describe('Interactive GPA scenario evaluator',()=>{
 it('matches credit-weighted GPA exactly when every score is fixed',()=>{
  const simulate=createGpaSimulator([course('A',3,95),course('B',1,85)],{numSamples:100});
  expect(simulate({A:0,B:0}).mean).toBeCloseTo((4*3+3)/4,8);
  expect(simulate({A:20,B:20}).p10).toBe(simulate({A:0,B:0}).p90);
 });
 it('reuses deterministic noise and respects percentile order',()=>{
  const inputs=[course('A',3,90,true)];
  const options={numSamples:500,seed:42,currentTime:'2026-11-05T00:00:00Z'};
  const simulate=createGpaSimulator(inputs,options);
  const low=simulate({A:1}); const high=simulate({A:8});
  expect(high.mean).toBeGreaterThanOrEqual(low.mean);
  expect(high.p10).toBeLessThanOrEqual(high.p25);expect(high.p25).toBeLessThanOrEqual(high.median);expect(high.median).toBeLessThanOrEqual(high.p75);expect(high.p75).toBeLessThanOrEqual(high.p90);
  expect(simulate({A:8})).toBe(high);
  expect(createGpaSimulator(inputs,options)({A:8})).toEqual(high);
 });
 it('does not allocate effort to past deadlines',()=>{
  const simulate=createGpaSimulator([course('A',3,90,true)],{numSamples:100,currentTime:'2028-01-01T00:00:00Z'});
  expect(simulate({A:0})).toEqual(simulate({A:20}));
 });
});
