import { describe, it, expect } from 'vitest';
import {
  validateEvidenceQuotesInDraft,
  checkForDraftRewrites,
  sortCriteriaWeakestFirst,
  verifyNoNumericGrade,
  type RubricCriterionCritique,
} from '../core/rubricFeedback.js';

describe('Stage 7: Rubric-Aware Feedback & Rewrite Guard', () => {
  const sampleDraft =
    'In our dynamic programming solution, we set up table dp[N+1][W+1]. ' +
    'The runtime is O(N*W) because we fill each cell in constant time. ' +
    'We did not test boundary conditions for W=0.';

  describe('1. Verbatim Evidence Quote Validation', () => {
    it('validates quotes that exist verbatim in the draft', () => {
      const quotes = [
        'In our dynamic programming solution, we set up table dp[N+1][W+1].',
        'We did not test boundary conditions for W=0.',
      ];
      const res = validateEvidenceQuotesInDraft(sampleDraft, quotes);
      expect(res.valid).toBe(true);
      expect(res.missingQuotes).toHaveLength(0);
    });

    it('rejects quotes that do not exist verbatim in the draft', () => {
      const quotes = [
        'In our dynamic programming solution, we set up table dp[N+1][W+1].',
        'This fabricated sentence was never written by the student.',
      ];
      const res = validateEvidenceQuotesInDraft(sampleDraft, quotes);
      expect(res.valid).toBe(false);
      expect(res.missingQuotes).toContain(
        'This fabricated sentence was never written by the student.'
      );
    });
  });

  describe('2. Automated Rewrite Detector (Anti-Ghostwriting Guard)', () => {
    it('accepts clean diagnostic critique with pointers and explanations', () => {
      const cleanCritique =
        'State the base cases explicitly for empty capacity W=0, and verify that loop bounds terminate correctly.';
      const res = checkForDraftRewrites(cleanCritique, sampleDraft);
      expect(res.isClean).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('flags prohibited rewrite directives ("You should write...")', () => {
      const badCritique =
        'You should write: def knapsack(W, wt, val): dp = [[0]*(W+1) for _ in range(N+1)]';
      const res = checkForDraftRewrites(badCritique, sampleDraft);
      expect(res.isClean).toBe(false);
      expect(res.violations[0]).toContain('Prohibited rewrite directive');
    });

    it('flags replacement prose directives ("Replace it with...")', () => {
      const badCritique =
        'Replace it with: The optimal substructure property guarantees polynomial time efficiency.';
      const res = checkForDraftRewrites(badCritique, sampleDraft);
      expect(res.isClean).toBe(false);
      expect(res.violations[0]).toContain('Prohibited rewrite directive');
    });

    it('flags embedded code blocks intended as copy-paste solutions', () => {
      const badCritique =
        'Consider implementing the following loop structure:\n```python\nfor i in range(N):\n    pass\n```';
      const res = checkForDraftRewrites(badCritique, sampleDraft);
      expect(res.isClean).toBe(false);
      expect(res.violations[0]).toContain('Prohibited code snippet block');
    });

    it('flags long quotes in critique that do not exist in the student draft', () => {
      const badCritique =
        'In your submission add "The divide step divides the array into two halves of size n/2 and merges them in linear time".';
      const res = checkForDraftRewrites(badCritique, sampleDraft);
      expect(res.isClean).toBe(false);
      expect(res.violations[0]).toContain('Unverified quote not found in student draft');
    });
  });

  describe('3. Weakest-First Ordering', () => {
    it('orders rubric criteria from lowest to highest readiness rank', () => {
      const criteria: RubricCriterionCritique[] = [
        {
          criterionId: 'crit_strong',
          criterionDescription: 'Algorithmic Efficiency',
          readinessLevel: 'Optimal O(N*W)',
          readinessRank: 2,
          evidenceQuotes: [],
          whatWouldRaiseIt: 'Check cache locality.',
        },
        {
          criterionId: 'crit_weak',
          criterionDescription: 'Boundary Case Handling',
          readinessLevel: 'Missing edge cases',
          readinessRank: 0,
          evidenceQuotes: [],
          whatWouldRaiseIt: 'Test empty inputs.',
        },
        {
          criterionId: 'crit_mid',
          criterionDescription: 'Recurrence Proof',
          readinessLevel: 'Partial derivation',
          readinessRank: 1,
          evidenceQuotes: [],
          whatWouldRaiseIt: 'Provide intermediate step.',
        },
      ];

      const sorted = sortCriteriaWeakestFirst(criteria);
      expect(sorted[0]?.criterionId).toBe('crit_weak');
      expect(sorted[1]?.criterionId).toBe('crit_mid');
      expect(sorted[2]?.criterionId).toBe('crit_strong');
    });
  });

  describe('4. Hard Invariant: No Predicted Numeric Grade', () => {
    it('passes when output contains diagnostic text and no grade predictions', () => {
      const validPayload = {
        criteria: [
          {
            criterionId: 'crit_1',
            readinessLevel: 'Partial derivation',
            whatWouldRaiseIt: 'Show algebraic steps.',
          },
        ],
        rewriteCheckPassed: true,
      };
      expect(verifyNoNumericGrade(validPayload)).toBe(true);
    });

    it('rejects outputs containing predictedScore or predictedGrade', () => {
      const invalidPayload1 = {
        predictedScore: 88.5,
        criteria: [],
      };
      expect(verifyNoNumericGrade(invalidPayload1)).toBe(false);

      const invalidPayload2 = {
        predictedGrade: 'B+',
        criteria: [],
      };
      expect(verifyNoNumericGrade(invalidPayload2)).toBe(false);
    });
  });
});

