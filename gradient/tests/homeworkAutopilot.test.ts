import {describe,expect,it} from 'vitest';
import {homeworkAutopilotBlock} from '../extension/homeworkAutopilot.js';
const homework={name:'Homework 4: Laplace transforms',htmlUrl:'https://school.instructure.com/courses/1/assignments/2',descriptionHtml:'<p>Plot the shifted function and explain it.</p>',submissionTypes:['online_upload']};
describe('homework-only autopilot eligibility',()=>{
  it('allows a normal homework brief but requires actual instructions',()=>{
    expect(homeworkAutopilotBlock(homework)).toBeNull();
    expect(homeworkAutopilotBlock({...homework,descriptionHtml:'<p> </p>'})).toMatch(/no readable brief/);
  });
  it.each(['Exam 2','Midterm review','Quiz 4','Proctored exam','Timed test','Final assessment'])('blocks assessment title %s',name=>{
    expect(homeworkAutopilotBlock({...homework,name})).toMatch(/homework only/);
  });
  it('uses Canvas metadata even if the title looks like homework',()=>{
    expect(homeworkAutopilotBlock({...homework,submissionTypes:['online_quiz']})).toMatch(/homework only/);
    expect(homeworkAutopilotBlock({...homework,htmlUrl:'https://school.instructure.com/courses/1/quizzes/3'})).toMatch(/homework only/);
  });
});
