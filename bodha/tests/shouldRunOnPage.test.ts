import { describe, it, expect } from 'vitest';
import {
  shouldRunOnPage,
  SafetyGuard,
} from '../extension/safetyGuard.js';

describe('Hard-Stop Module: shouldRunOnPage (>= 15 Test Cases & Near-Misses)', () => {
  const cleanDom = { querySelector: () => null };

  // -------------------------------------------------------------------------
  // Group A: Hard Stops - Quiz taking pages (Must return false)
  // -------------------------------------------------------------------------
  it('Case 1: Blocks classic Canvas quiz take page', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501/take', cleanDom)).toBe(false);
  });

  it('Case 2: Blocks quiz question-level take page', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501/take/questions', cleanDom)).toBe(false);
  });

  it('Case 3: Blocks quiz take page with trailing query params', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501/take?user_id=9991', cleanDom)).toBe(false);
  });

  it('Case 4: Blocks quiz in-progress submissions page', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501/submissions', cleanDom)).toBe(false);
  });

  it('Case 5: Blocks assignment take / assessment mode', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001/take', cleanDom)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Group B: Hard Stops - LTI, New Quizzes & Proctoring (Must return false)
  // -------------------------------------------------------------------------
  it('Case 6: Blocks LTI launch with launch_type=assessment', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/external_tools/15?launch_type=assessment', cleanDom)).toBe(false);
  });

  it('Case 7: Blocks LTI launch with launch_type=quiz', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/external_tools/15?launch_type=quiz', cleanDom)).toBe(false);
  });

  it('Case 8: Blocks New Quizzes dedicated sub-domain launch', () => {
    expect(shouldRunOnPage('https://canvas.quiz-lti-iad-prod.instructure.com/launch/sess_9901', cleanDom)).toBe(false);
  });

  it('Case 9: Blocks remote proctoring tool indicators (Proctorio)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/external_tools/proctorio_session', cleanDom)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Group C: Hard Stops - Active DOM Timers & Forms (Must return false)
  // -------------------------------------------------------------------------
  it('Case 10: Blocks when active #quiz_timer DOM element is detected', () => {
    const domWithTimer = {
      querySelector: (selector: string) => (selector === '#quiz_timer' ? { id: 'quiz_timer' } : null),
    };
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', domWithTimer)).toBe(false);
  });

  it('Case 11: Blocks when .quiz-submission-timer class is detected in DOM', () => {
    const domWithTimer = {
      querySelector: (selector: string) => (selector === '.quiz-submission-timer' ? { className: 'quiz-submission-timer' } : null),
    };
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', domWithTimer)).toBe(false);
  });

  it('Case 12: Blocks when #submit_quiz_form is present in DOM', () => {
    const domWithForm = {
      querySelector: (selector: string) => (selector === '#submit_quiz_form' ? { id: 'submit_quiz_form' } : null),
    };
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', domWithForm)).toBe(false);
  });

  it('Case 13: Blocks when form.take_quiz_form is present in DOM', () => {
    const domWithTakeForm = {
      querySelector: (selector: string) => (selector === 'form.take_quiz_form' ? { tagName: 'FORM' } : null),
    };
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', domWithTakeForm)).toBe(false);
  });

  it('Case 14: Blocks when #questions.quiz-questions container is present in DOM', () => {
    const domWithQuestions = {
      querySelector: (selector: string) => (selector === '#questions.quiz-questions' ? { id: 'questions' } : null),
    };
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', domWithQuestions)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Group D: Near-Misses - Quiz Landing & Edit pages (Must return true)
  // -------------------------------------------------------------------------
  it('Case 15 (NEAR-MISS): Allows quiz landing/summary overview page (/quizzes/:id without /take)', () => {
    // Verified Canvas structure: /courses/99001/quizzes/501 displays instructions, due date, points
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501', cleanDom)).toBe(true);
  });

  it('Case 16 (NEAR-MISS): Allows quizzes index list page (/courses/:id/quizzes)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes', cleanDom)).toBe(true);
  });

  it('Case 17 (NEAR-MISS): Allows quiz edit page (/courses/:id/quizzes/:id/edit)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/quizzes/501/edit', cleanDom)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Group E: Safe Canvas Course Views (Must return true)
  // -------------------------------------------------------------------------
  it('Case 18: Allows assignment landing view (/courses/:id/assignments/:id)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments/1001', cleanDom)).toBe(true);
  });

  it('Case 19: Allows assignment index view (/courses/:id/assignments)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/assignments', cleanDom)).toBe(true);
  });

  it('Case 20: Allows course gradebook view (/courses/:id/grades)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/grades', cleanDom)).toBe(true);
  });

  it('Case 21: Allows course homepage (/courses/:id)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001', cleanDom)).toBe(true);
  });

  it('Case 22: Allows course modules view (/courses/:id/modules)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/modules', cleanDom)).toBe(true);
  });

  it('Case 23: Allows course syllabus view (/courses/:id/syllabus)', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/syllabus', cleanDom)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Group F: Default-Deny on Unsure / External / Unrecognized URLs (Must return false)
  // -------------------------------------------------------------------------
  it('Case 24 (DEFAULT-DENY): Rejects external non-Canvas domain', () => {
    expect(shouldRunOnPage('https://thirdparty-proctoring.com/session', cleanDom)).toBe(false);
  });

  it('Case 25 (DEFAULT-DENY): Rejects unrecognized path outside safe course space', () => {
    expect(shouldRunOnPage('https://canvas.instructure.com/courses/99001/obscure_admin_tool', cleanDom)).toBe(false);
  });

  it('Case 26 (CONFIGURABLE): Custom SafetyGuard allows custom pattern override', () => {
    const customGuard = new SafetyGuard({
      blockedUrlPatterns: [/custom-block-url/],
      allowedPathPatterns: [/custom-allow-url/],
      defaultDenyWhenUnsure: true,
    });
    expect(customGuard.canInject('https://test.edu/custom-allow-url').allowed).toBe(true);
    expect(customGuard.canInject('https://test.edu/custom-block-url').allowed).toBe(false);
  });
});
