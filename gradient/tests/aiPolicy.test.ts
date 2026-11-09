import { describe, expect, it } from 'vitest';
import { readAiPolicy } from '../extension/aiPolicy.js';

describe('syllabus AI policy reader', () => {
  it('quotes a restriction even when an exception is offered', () => {
    const policy = readAiPolicy('<h2>AI Policy</h2><p>Generative AI usage on proof writeups is strictly prohibited without prior written authorization.</p>');
    expect(policy.stance).toBe('restricted');
    expect(policy.sentence).toBe('Generative AI usage on proof writeups is strictly prohibited without prior written authorization.');
  });

  it('distinguishes conditional permission from open permission', () => {
    expect(readAiPolicy('<p>You may use ChatGPT for brainstorming provided that you disclose it in your submission.</p>').stance).toBe('conditional');
    expect(readAiPolicy('<p>AI tools are welcome in this course for practice problems.</p>').stance).toBe('allowed');
  });

  it('keeps the most restrictive statement across a syllabus', () => {
    const policy = readAiPolicy('<p>AI tools are encouraged for revision.</p><p>Copilot must not be used on graded labs.</p>');
    expect(policy.stance).toBe('restricted');
    expect(policy.sentence).toContain('Copilot must not be used');
  });

  it('reports silence rather than guessing', () => {
    expect(readAiPolicy('<h1>BIO 110</h1><p>Lab reports are worth 35%. Late work loses 10% per day.</p>')).toEqual({ stance: 'unstated', sentence: null });
    expect(readAiPolicy('<p>Students will train a neural network model in week 9.</p>').stance).toBe('unstated');
  });
});

describe('sample syllabi', () => {
  it('reads limited permission, restriction and silence from the demo courses', () => {
    expect(readAiPolicy('<h2>AI Policy</h2><p>AI collaboration is permitted exclusively for conceptual understanding and hint exploration. All final submitted implementations and proof arguments must be written by the student. Direct code generation or automated synthesis is strictly prohibited.</p>')).toEqual({ stance: 'conditional', sentence: 'AI collaboration is permitted exclusively for conceptual understanding and hint exploration.' });
  });
});
