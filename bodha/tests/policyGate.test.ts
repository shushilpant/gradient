import { describe, it, expect } from 'vitest';
import {
  validateEvidenceSpans,
  getMostRestrictiveTier,
  resolveEffectivePolicy,
  applyStudentOverrideNote,
  isFeatureAllowed,
  draftQuestionToInstructor,
  type PolicyExtractionResult,
  type PolicyEvidence,
  type ResolvedPolicy,
} from '../core/policyGate.js';

describe('Stage 6: Syllabus AI-Policy Gate', () => {
  const sampleSyllabus =
    'CS 101: Introduction to Computer Science\n' +
    'Instructor: Dr. Alan Turing\n' +
    'Academic Integrity:\n' +
    'The use of generative AI tools like ChatGPT or GitHub Copilot is strictly prohibited on all coursework.\n' +
    'Any unauthorized use constitutes academic dishonesty.';

  const validEvidence: PolicyEvidence = {
    sentence:
      'The use of generative AI tools like ChatGPT or GitHub Copilot is strictly prohibited on all coursework.',
    charStart: sampleSyllabus.indexOf(
      'The use of generative AI tools like ChatGPT or GitHub Copilot is strictly prohibited on all coursework.'
    ),
    charEnd:
      sampleSyllabus.indexOf(
        'The use of generative AI tools like ChatGPT or GitHub Copilot is strictly prohibited on all coursework.'
      ) +
      'The use of generative AI tools like ChatGPT or GitHub Copilot is strictly prohibited on all coursework.'
        .length,
  };

  describe('1. Verbatim Evidence Span Validation', () => {
    it('validates correct verbatim evidence offsets', () => {
      const res = validateEvidenceSpans(sampleSyllabus, [validEvidence]);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects extraction if evidence span is off by even a single character', () => {
      const corruptedEvidence: PolicyEvidence = {
        ...validEvidence,
        charStart: validEvidence.charStart + 1, // 1 char offset shift
      };
      const res = validateEvidenceSpans(sampleSyllabus, [corruptedEvidence]);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain('verbatim mismatch');
    });

    it('rejects out of bounds spans', () => {
      const outOfBounds: PolicyEvidence = {
        sentence: 'Invalid span',
        charStart: sampleSyllabus.length + 10,
        charEnd: sampleSyllabus.length + 50,
      };
      const res = validateEvidenceSpans(sampleSyllabus, [outOfBounds]);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('invalid span offsets');
    });

    it('handles empty evidence gracefully', () => {
      const res = validateEvidenceSpans(sampleSyllabus, []);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe('2. Restrictiveness Hierarchy: Most Restrictive Rule Wins', () => {
    it('ranks prohibited as stricter than all other tiers', () => {
      expect(getMostRestrictiveTier('prohibited', 'permittedWithDisclosure')).toBe('prohibited');
      expect(getMostRestrictiveTier('prohibited', 'permittedForNamedUses')).toBe('prohibited');
      expect(getMostRestrictiveTier('prohibited', 'unspecified')).toBe('prohibited');
    });

    it('ranks permittedForNamedUses as stricter than permittedWithDisclosure', () => {
      expect(getMostRestrictiveTier('permittedForNamedUses', 'permittedWithDisclosure')).toBe(
        'permittedForNamedUses'
      );
    });

    it('ranks permittedWithDisclosure as stricter than unspecified', () => {
      expect(getMostRestrictiveTier('permittedWithDisclosure', 'unspecified')).toBe(
        'permittedWithDisclosure'
      );
    });

    it('is symmetric and reflexive', () => {
      expect(getMostRestrictiveTier('permittedWithDisclosure', 'prohibited')).toBe('prohibited');
      expect(getMostRestrictiveTier('unspecified', 'unspecified')).toBe('unspecified');
    });
  });

  describe('3. Effective Policy Resolution & Verbatim Grounding', () => {
    const validProhibitedExtraction: PolicyExtractionResult = {
      courseInfo: { code: 'CS 101', title: 'Intro CS' },
      aiPolicy: {
        overall: 'prohibited',
        byAssessmentType: {
          homework: 'prohibited',
          essay: 'prohibited',
          project: 'prohibited',
          quizExam: 'prohibited',
        },
        disclosureRequired: false,
        permittedUses: [],
        evidence: [validEvidence],
      },
      confidence: 0.95,
    };

    it('resolves prohibited policy when evidence is valid', () => {
      const resolved = resolveEffectivePolicy({
        rawSyllabusText: sampleSyllabus,
        syllabusExtraction: validProhibitedExtraction,
      });

      expect(resolved.tier).toBe('prohibited');
      expect(resolved.extractionValid).toBe(true);
      expect(resolved.confidence).toBe(0.95);
      expect(resolved.requiresStudentConfirmation).toBe(false);
    });

    it('rejects extraction and falls back to cautious default if evidence span is falsified', () => {
      const falsifiedExtraction: PolicyExtractionResult = {
        ...validProhibitedExtraction,
        aiPolicy: {
          ...validProhibitedExtraction.aiPolicy,
          evidence: [
            {
              sentence: 'Falsified sentence not in text',
              charStart: 10,
              charEnd: 41,
            },
          ],
        },
      };

      const resolved = resolveEffectivePolicy({
        rawSyllabusText: sampleSyllabus,
        syllabusExtraction: falsifiedExtraction,
      });

      expect(resolved.extractionValid).toBe(false);
      expect(resolved.tier).toBe('unspecified');
      expect(resolved.confidence).toBe(0.0);
      expect(resolved.requiresStudentConfirmation).toBe(true);
    });

    it('enforces that assignment brief beats syllabus when stricter', () => {
      const syllabusPermitted: PolicyExtractionResult = {
        courseInfo: { code: 'CS 200' },
        aiPolicy: {
          overall: 'permittedWithDisclosure',
          byAssessmentType: {
            homework: 'permittedWithDisclosure',
            essay: 'permittedWithDisclosure',
            project: 'permittedWithDisclosure',
            quizExam: 'prohibited',
          },
          disclosureRequired: true,
          permittedUses: [],
          evidence: [],
        },
        confidence: 0.9,
      };

      const assignmentProhibited: PolicyExtractionResult = {
        courseInfo: {},
        aiPolicy: {
          overall: 'prohibited',
          byAssessmentType: {
            homework: 'prohibited',
            essay: 'prohibited',
            project: 'prohibited',
            quizExam: 'prohibited',
          },
          disclosureRequired: false,
          permittedUses: [],
          evidence: [],
        },
        confidence: 0.95,
      };

      const resolved = resolveEffectivePolicy({
        rawSyllabusText: 'Permitted syllabus text',
        syllabusExtraction: syllabusPermitted,
        assignmentExtraction: assignmentProhibited,
        assessmentType: 'homework',
      });

      // Assignment brief is stricter than syllabus -> prohibited wins
      expect(resolved.tier).toBe('prohibited');
      expect(resolved.source).toBe('assignment');
    });

    it('enforces that syllabus beats assignment brief when syllabus is stricter', () => {
      const assignmentPermitted: PolicyExtractionResult = {
        courseInfo: {},
        aiPolicy: {
          overall: 'permittedWithDisclosure',
          byAssessmentType: {
            homework: 'permittedWithDisclosure',
            essay: 'permittedWithDisclosure',
            project: 'permittedWithDisclosure',
            quizExam: 'permittedWithDisclosure',
          },
          disclosureRequired: true,
          permittedUses: [],
          evidence: [],
        },
        confidence: 0.9,
      };

      const resolved = resolveEffectivePolicy({
        rawSyllabusText: sampleSyllabus,
        syllabusExtraction: validProhibitedExtraction,
        assignmentExtraction: assignmentPermitted,
        assessmentType: 'essay',
      });

      // Syllabus is stricter (prohibited) -> prohibited wins
      expect(resolved.tier).toBe('prohibited');
    });
  });

  describe('4. Student Override Guard (No Escalation Beyond Tier)', () => {
    it('strictly prevents student override from relaxing restrictions', () => {
      const prohibitedPolicy: ResolvedPolicy = {
        tier: 'prohibited',
        disclosureRequired: false,
        permittedUses: [],
        requiresStudentConfirmation: false,
        confidence: 0.95,
        source: 'syllabus',
        evidence: [validEvidence],
        disclosureLog: [],
        studentConfirmed: false,
        extractionValid: true,
        validationErrors: [],
      };

      const note = 'Instructor said in Monday lecture that ChatGPT is allowed for drafting!';
      const result = applyStudentOverrideNote(prohibitedPolicy, note, 'permittedWithDisclosure');

      // HARD RULE: Cannot escalate beyond tier!
      expect(result.logEntry.escalationPrevented).toBe(true);
      expect(result.effectivePolicy.tier).toBe('prohibited');
      expect(result.effectivePolicy.disclosureLog).toHaveLength(1);
      expect(result.effectivePolicy.disclosureLog[0]?.note).toBe(note);
      expect(result.effectivePolicy.disclosureLog[0]?.escalationPrevented).toBe(true);
    });

    it('allows student to self-impose a more restrictive tier', () => {
      const permittedPolicy: ResolvedPolicy = {
        tier: 'permittedWithDisclosure',
        disclosureRequired: true,
        permittedUses: [],
        requiresStudentConfirmation: false,
        confidence: 0.9,
        source: 'syllabus',
        evidence: [],
        disclosureLog: [],
        studentConfirmed: true,
        extractionValid: true,
        validationErrors: [],
      };

      const result = applyStudentOverrideNote(
        permittedPolicy,
        'I choose not to use any AI on this course.',
        'prohibited'
      );

      expect(result.logEntry.escalationPrevented).toBe(false);
      expect(result.effectivePolicy.tier).toBe('prohibited');
    });
  });

  describe('5. Feature Gating Logic (Zero AI Features in Prohibited Mode)', () => {
    const prohibitedPolicy: ResolvedPolicy = {
      tier: 'prohibited',
      disclosureRequired: false,
      permittedUses: [],
      requiresStudentConfirmation: false,
      confidence: 0.95,
      source: 'syllabus',
      evidence: [],
      disclosureLog: [],
      studentConfirmed: true,
      extractionValid: true,
      validationErrors: [],
    };

    it('permits non-AI features in prohibited mode', () => {
      expect(isFeatureAllowed(prohibitedPolicy, 'grades')).toBe(true);
      expect(isFeatureAllowed(prohibitedPolicy, 'deadlines')).toBe(true);
      expect(isFeatureAllowed(prohibitedPolicy, 'courseMaterials')).toBe(true);
      expect(isFeatureAllowed(prohibitedPolicy, 'studyRecommendations')).toBe(true);
    });

    it('strictly forbids all AI-generated features in prohibited mode', () => {
      expect(isFeatureAllowed(prohibitedPolicy, 'rubricCritique')).toBe(false);
      expect(isFeatureAllowed(prohibitedPolicy, 'generativeHints')).toBe(false);
      expect(isFeatureAllowed(prohibitedPolicy, 'aiChat')).toBe(false);
    });

    it('enforces cautious default for unconfirmed unspecified syllabus', () => {
      const unspecifiedPolicy: ResolvedPolicy = {
        tier: 'unspecified',
        disclosureRequired: false,
        permittedUses: [],
        requiresStudentConfirmation: true,
        confidence: 0.0,
        source: 'syllabus',
        evidence: [],
        disclosureLog: [],
        studentConfirmed: false,
        extractionValid: true,
        validationErrors: [],
      };

      // Non-AI features remain available
      expect(isFeatureAllowed(unspecifiedPolicy, 'grades')).toBe(true);
      expect(isFeatureAllowed(unspecifiedPolicy, 'deadlines')).toBe(true);

      // AI features locked until student confirmation
      expect(isFeatureAllowed(unspecifiedPolicy, 'rubricCritique')).toBe(false);
      expect(isFeatureAllowed(unspecifiedPolicy, 'generativeHints')).toBe(false);
      expect(isFeatureAllowed(unspecifiedPolicy, 'aiChat')).toBe(false);
    });

    it('restricts to named uses when in permittedForNamedUses tier', () => {
      const namedPolicy: ResolvedPolicy = {
        tier: 'permittedForNamedUses',
        disclosureRequired: false,
        permittedUses: ['brainstorming', 'grammar/spellcheck'],
        requiresStudentConfirmation: false,
        confidence: 0.9,
        source: 'syllabus',
        evidence: [],
        disclosureLog: [],
        studentConfirmed: true,
        extractionValid: true,
        validationErrors: [],
      };

      expect(isFeatureAllowed(namedPolicy, 'rubricCritique', { specificUse: 'brainstorming' })).toBe(
        true
      );
      expect(
        isFeatureAllowed(namedPolicy, 'generativeHints', { specificUse: 'code synthesis' })
      ).toBe(false);
    });
  });

  describe('6. Question-to-Instructor Template Generator', () => {
    it('drafts a professional, contextual email for unspecified AI policy', () => {
      const email = draftQuestionToInstructor({
        courseName: 'CS 101: Introduction to Computer Science',
        instructorName: 'Turing',
        studentName: 'Ada Student',
        assessmentName: 'Homework 3',
        intendedUse: 'conceptual brainstorming and rubric self-critique',
      });

      expect(email).toContain('Dear Professor Turing');
      expect(email).toContain('CS 101: Introduction to Computer Science');
      expect(email).toContain('Homework 3');
      expect(email).toContain('conceptual brainstorming and rubric self-critique');
      expect(email).toContain('Ada Student');
      expect(email).toContain('no AI tool would be used to generate submitted text');
    });
  });
});

