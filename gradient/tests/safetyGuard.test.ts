import { describe, it, expect } from 'vitest';
import {
  defaultSafetyGuard,
} from '../extension/safetyGuard.js';

describe('Safety Guard & Quiz Injection Blocker (Hard Rule 2)', () => {
  it('blocks classic Canvas quiz taking URLs', () => {
    const urls = [
      'https://canvas.instructure.com/courses/99001/quizzes/501/take',
      'https://canvas.instructure.com/courses/99001/quizzes/501/take/questions',
      'https://canvas.instructure.com/courses/99001/quizzes/501/submissions',
      'https://canvas.instructure.com/courses/99001/assignments/201/take',
    ];

    for (const url of urls) {
      const check = defaultSafetyGuard.canInject(url);
      expect(check.allowed).toBe(false);
      expect(check.blocked).toBe(true);
      expect(check.reason).toContain('Blocked by URL safety rule');
    }
  });

  it('blocks LTI and New Quizzes launches', () => {
    const ltiUrls = [
      'https://canvas.instructure.com/courses/99001/external_tools/12?launch_type=assessment',
      'https://canvas.instructure.com/courses/99001/external_tools/12?launch_type=quiz',
      'https://canvas.quiz-lti-iad-prod.instructure.com/launch/12345',
      'https://canvas.instructure.com/courses/99001/external_tools/assessment_tool',
    ];

    for (const url of ltiUrls) {
      const check = defaultSafetyGuard.canInject(url);
      expect(check.allowed).toBe(false);
      expect(check.blocked).toBe(true);
      expect(check.reason).toContain('Blocked by URL safety rule');
    }
  });

  it('blocks when active quiz DOM markers (timers, submission forms) are detected', () => {
    const safeUrl = 'https://canvas.instructure.com/courses/99001/assignments/101';

    // Mock DOM root containing a quiz timer
    const domWithTimer = {
      querySelector: (selector: string) => {
        if (selector === '#quiz_timer' || selector === '.quiz-timer') {
          return { tagName: 'DIV', id: 'quiz_timer' };
        }
        return null;
      },
    };

    const result = defaultSafetyGuard.canInject(safeUrl, domWithTimer);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Blocked by DOM safety marker');
  });

  it('blocks when active quiz question form is present in DOM', () => {
    const safeUrl = 'https://canvas.instructure.com/courses/99001/assignments/101';

    const domWithQuizForm = {
      querySelector: (selector: string) => {
        if (selector === '#submit_quiz_form' || selector === 'form.take_quiz_form') {
          return { tagName: 'FORM', id: 'submit_quiz_form' };
        }
        return null;
      },
    };

    const result = defaultSafetyGuard.canInject(safeUrl, domWithQuizForm);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Blocked by DOM safety marker');
  });

  it('allows injection on safe, recognized Canvas course pages when no assessment markers exist', () => {
    const safeUrls = [
      'https://canvas.instructure.com/courses/99001',
      'https://canvas.instructure.com/courses/99001/grades',
      'https://canvas.instructure.com/courses/99001/assignments',
      'https://canvas.instructure.com/courses/99001/assignments/1001',
      'https://canvas.instructure.com/courses/99001/modules',
      'https://canvas.instructure.com/courses/99001/syllabus',
    ];

    const cleanDom = {
      querySelector: () => null,
    };

    for (const url of safeUrls) {
      const result = defaultSafetyGuard.canInject(url, cleanDom);
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.reason).toContain('Safe to inject');
    }
  });

  it('enforces fail-closed behavior on unknown external or untrusted paths', () => {
    const unknownUrls = [
      'https://canvas.instructure.com/unknown_exam_portal',
      'https://external-proctoring-site.com/session',
      'https://canvas.instructure.com/courses/99001/admin_settings_obscure',
    ];

    for (const url of unknownUrls) {
      const result = defaultSafetyGuard.canInject(url);
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Blocked by fail-closed policy');
    }
  });
});
