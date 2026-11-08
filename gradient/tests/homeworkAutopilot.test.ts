import {describe,expect,it} from 'vitest';
import {assessmentAssistanceBlock,homeworkAutopilotBlock} from '../extension/homeworkAutopilot.js';
const homework={name:'Homework 4: Laplace transforms',htmlUrl:'https://school.instructure.com/courses/1/assignments/2',descriptionHtml:'<p>Plot the shifted function and explain it.</p>',submissionTypes:['online_upload']};
describe('homework-only autopilot eligibility',()=>{
  it('allows a normal homework brief but requires actual instructions',()=>{
    expect(homeworkAutopilotBlock(homework)).toBeNull();
    expect(homeworkAutopilotBlock({...homework,descriptionHtml:'<p> </p>'})).toMatch(/no readable brief/);
  });
  it.each(['Exam 2','Midterm review','Quiz 4','Proctored exam','Timed test','Final assessment'])('blocks assessment title %s',name=>{
    expect(homeworkAutopilotBlock({...homework,name})).toMatch(/homework only/);
  });
  it.each(['This is under exam conditions.', 'Do not use outside assistance.', 'This is a timed assessment.'])('honors assistance restrictions in the brief: %s',descriptionHtml=>{
    expect(homeworkAutopilotBlock({...homework,descriptionHtml})).toMatch(/generation is paused/);
  });
  it('uses Canvas metadata even if the title looks like homework',()=>{
    expect(homeworkAutopilotBlock({...homework,submissionTypes:['online_quiz']})).toMatch(/homework only/);
    expect(homeworkAutopilotBlock({...homework,htmlUrl:'https://school.instructure.com/courses/1/quizzes/3'})).toMatch(/homework only/);
  });
});

describe('assessment restrictions in every assignment assistance mode',()=>{
  it('allows general course concepts and ordinary homework without confirmation',()=>{
    expect(assessmentAssistanceBlock(undefined)).toBeNull();
    expect(assessmentAssistanceBlock(homework)).toBeNull();
    expect(assessmentAssistanceBlock({...homework,submissionTypes:['discussion_topic']})).toBeNull();
    expect(homeworkAutopilotBlock({...homework,submissionTypes:['discussion_topic']})).toMatch(/homework only/);
  });
  it.each([
    {...homework,name:'Exam 2'},
    {...homework,submissionTypes:['online_quiz']},
    {...homework,htmlUrl:'https://school.instructure.com/courses/1/qu%69zzes/2'},
    {...homework,descriptionHtml:'<p>Do not use outside assistance.</p>'},
  ])('blocks assessment context independently of the chosen mode',assignment=>{
    expect(assessmentAssistanceBlock(assignment)).toMatch(/generation is paused/);
    expect(homeworkAutopilotBlock(assignment)).toBe(assessmentAssistanceBlock(assignment));
  });
});
