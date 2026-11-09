/**
 * OffCanvas Stage 7: Rubric-Aware Feedback & Draft Critique Guard
 * 
 * HARD RULES (NON-NEGOTIABLE):
 * 1. Critique and pointers only: NO rewritten sentences, NO suggested replacement prose,
 *    NO ghostwritten paragraphs for the student.
 * 2. Order criteria WEAKEST first (lowest readiness level first).
 * 3. Do NOT output a predicted numeric grade.
 * 4. Evidence quotes must be verbatim substrings of the student draft.
 */

export interface RubricCriterionCritique {
  criterionId: string;
  criterionDescription: string;
  readinessLevel: string; // The rubric rating descriptor text
  readinessRank: number; // Ordinal rank: 0 (lowest) to N (highest)
  evidenceQuotes: string[]; // Verbatim quotes from the draft
  whatWouldRaiseIt: string; // Diagnostic critique and guidance only
}

export interface PreSubmitCritiqueResult {
  criteria: RubricCriterionCritique[];
  rewriteCheckPassed: boolean;
  rewriteCheckDetails?: {
    isClean: boolean;
    violations: string[];
  };
  feedbackSummary: string;
}

// Phrases that signal ghostwriting, direct replacement prose, or sentence substitution
const REWRITE_TRIGGER_PATTERNS = [
  /\b(?:you should write|try writing|replace (?:it|this) with|instead of .* write)\b/i,
  /\b(?:here is a (?:better|revised|improved) version|use this sentence instead)\b/i,
  /\b(?:suggested rewrite|suggested revision|consider phrasing it as)\b/i,
  /\b(?:instead say|change (?:this|it) to:?|a better way to say this is)\b/i,
  /\b(?:here is how to rewrite|rephrase as:?|copy and paste this)\b/i,
  /\b(?:in your draft, insert:?|add the following paragraph:?)\b/i,
];

/**
 * Validates that all evidence quotes provided in the critique exist verbatim in the student draft.
 */
export function validateEvidenceQuotesInDraft(
  draft: string,
  quotes: string[]
): { valid: boolean; missingQuotes: string[] } {
  const missingQuotes: string[] = [];
  const normalizedDraft = draft.replace(/\r\n/g, '\n');

  for (const quote of quotes) {
    const trimmed = quote.trim();
    if (!trimmed) continue;
    const normalizedQuote = trimmed.replace(/\r\n/g, '\n');
    if (!normalizedDraft.includes(normalizedQuote)) {
      missingQuotes.push(quote);
    }
  }

  return {
    valid: missingQuotes.length === 0,
    missingQuotes,
  };
}

/**
 * Automated rewrite checker that inspects critique output.
 * Flags outputs containing:
 * 1. Ghostwriting/rewrite trigger phrases ("You should write...", "Replace with...")
 * 2. Quoted replacement strings that are not in the student's draft
 * 3. Near-duplicate modified sentence spans (rewrite detection)
 * 4. Direct code blocks intended as copy-paste solutions
 */
export function checkForDraftRewrites(
  critiqueText: string,
  draftText: string
): { isClean: boolean; violations: string[] } {
  const violations: string[] = [];

  // 1. Check for explicit rewrite trigger phrases
  for (const pattern of REWRITE_TRIGGER_PATTERNS) {
    const match = pattern.exec(critiqueText);
    if (match) {
      violations.push(
        `Prohibited rewrite directive detected: "${match[0]}". OffCanvas only provides diagnostic guidance, never substitute prose.`
      );
    }
  }

  // 2. Check for code block insertions (e.g. ```python def solve(): ... ```)
  if (/```[\s\S]*?```/.test(critiqueText)) {
    violations.push('Prohibited code snippet block detected in critique output.');
  }

  // 3. Check for quoted sentences in critique that are NOT from the student draft
  // (Detects generative substitute text placed in quotes like: Consider writing "We deduce that...")
  const quoteMatches = critiqueText.match(/"([^"]{20,})"/g) || [];
  for (const rawQuote of quoteMatches) {
    const innerQuote = rawQuote.slice(1, -1).trim();
    if (!draftText.includes(innerQuote)) {
      // Check if it looks like suggested replacement prose rather than a concept name
      if (innerQuote.split(/\s+/).length >= 5) {
        violations.push(
          `Unverified quote not found in student draft: "${innerQuote}". Possible generated substitute text.`
        );
      }
    }
  }

  // 4. Check for high n-gram overlap that is not an exact quote (paraphrased draft rewrites)
  const draftWords = draftText.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const critiqueWords = critiqueText.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  // Check 8-gram sliding window
  const windowSize = 8;
  if (critiqueWords.length >= windowSize && draftWords.length >= windowSize) {
    const draftWindows = new Set<string>();
    for (let i = 0; i <= draftWords.length - windowSize; i++) {
      draftWindows.add(draftWords.slice(i, i + windowSize).join(' '));
    }

    for (let i = 0; i <= critiqueWords.length - windowSize; i++) {
      const windowStr = critiqueWords.slice(i, i + windowSize).join(' ');
      // If critique has an 8-word sequence matching draft, verify it is inside an explicit evidence quote
      if (draftWindows.has(windowStr)) {
        if (!critiqueText.includes(windowStr) && !quoteMatches.some((q) => q.toLowerCase().includes(windowStr))) {
          violations.push(
            `High word overlap (${windowSize}-gram) without quotation: "${windowStr}". May indicate paraphrased rewrite.`
          );
          break;
        }
      }
    }
  }

  return {
    isClean: violations.length === 0,
    violations,
  };
}

/**
 * Sorts rubric criteria critiques weakest first (ascending readinessRank).
 */
export function sortCriteriaWeakestFirst(
  criteria: RubricCriterionCritique[]
): RubricCriterionCritique[] {
  return [...criteria].sort((a, b) => a.readinessRank - b.readinessRank);
}

/**
 * Strict validator verifying that NO predicted numeric score or grade is output.
 */
export function verifyNoNumericGrade(payload: unknown): boolean {
  const jsonStr = JSON.stringify(payload).toLowerCase();
  
  // Forbidden numeric prediction fields
  const forbiddenKeys = [
    '"predictedgrade"',
    '"predictedscore"',
    '"estimatedscore"',
    '"predictedpercentage"',
    '"finalscore"',
    '"projectedgrade"',
    '"projectedscore"',
  ];

  for (const key of forbiddenKeys) {
    if (jsonStr.includes(key)) {
      return false;
    }
  }

  return true;
}


// Domain keywords and diagnostic guidance for local browser evaluation
const CRITERION_DOMAINS: Record<
  string,
  {
    keywords: string[];
    weakAdvice: string;
    partialAdvice: string;
    strongAdvice: string;
  }
> = {
  asymptotic: {
    keywords: ['big-o', 'o(', 'asymptotic', 'complexity', 'omega', 'theta', 'worst-case', 'runtime'],
    weakAdvice:
      'State the governing asymptotic recurrence or loop structure, and derive the tight upper bound mathematically.',
    partialAdvice:
      'Provide formal algebraic simplification for the summation steps rather than asserting the final bound.',
    strongAdvice:
      'Verify that tight lower bounds (Omega) and edge case constraints match your upper bound claims.',
  },
  recurrence: {
    keywords: ['recurrence', 't(n)', 'base case', 'divide', 'conquer', 'master theorem'],
    weakAdvice:
      'Explicitly write out the recurrence relation formula T(n) and declare base cases for small n.',
    partialAdvice:
      'State which case of the Master Theorem applies and verify regularity conditions for the non-recursive term.',
    strongAdvice:
      'Check whether boundary conditions at n=1 or n=0 introduce hidden logarithmic overhead.',
  },
  code: {
    keywords: [
      'implementation',
      'function',
      'algorithm',
      'data structure',
      'array',
      'pointer',
      'loop',
      'recursion',
    ],
    weakAdvice:
      'Describe the core data structure choices and explain how memory allocation scales with input size.',
    partialAdvice:
      'Discuss edge cases such as empty inputs, duplicates, or single-element collections.',
    strongAdvice: 'Document invariants maintained across recursive calls or loop passes.',
  },
  benchmark: {
    keywords: [
      'benchmark',
      'empirical',
      'wall-clock',
      'profiling',
      'trials',
      'baseline',
      'experiments',
      'scaling chart',
    ],
    weakAdvice:
      'Include empirical timing measurements across multiple input scales (e.g. N=10 to 10^6) and record trials.',
    partialAdvice:
      'Add a comparative baseline implementation and plot variance error bars across repeated experimental runs.',
    strongAdvice:
      'Directly compare observed empirical curve slope to theoretical big-O complexity predictions.',
  },
  modularity: {
    keywords: [
      'modular',
      'structure',
      'architecture',
      'test',
      'helper',
      'function',
      'documentation',
      'clean',
    ],
    weakAdvice:
      'Decompose monolithic operations into single-responsibility helper functions with clear parameter contracts.',
    partialAdvice:
      'Add unit testing coverage for boundary conditions and document expected preconditions and postconditions.',
    strongAdvice:
      'Refactor common sub-routines into reusable pure utilities to maximize architectural clarity.',
  },
};

function matchDomain(description: string) {
  const descLower = description.toLowerCase();
  for (const [key, val] of Object.entries(CRITERION_DOMAINS)) {
    if (descLower.includes(key) || val.keywords.some((kw) => descLower.includes(kw))) {
      return val;
    }
  }
  return {
    keywords: [],
    weakAdvice:
      'Address this criterion directly by introducing dedicated analysis and explicit methodology.',
    partialAdvice:
      'Elaborate on core assumptions and substantiate conclusions with supporting evidence.',
    strongAdvice:
      'Review all rubric rating descriptors to ensure every sub-requirement is fully satisfied.',
  };
}

/**
 * Evaluates student draft against a list of rubric criteria locally (pure TypeScript).
 * Guarantees zero network calls, weakest-first ordering, verbatim quotes, and zero predicted numeric grades.
 */
export function evaluateDraftLocally(
  draft: string,
  rubricCriteria: { id: string; description: string; points: number; ratings: { id?: string; description: string; points: number }[] }[]
): PreSubmitCritiqueResult {
  const normalizedDraft = draft.trim();
  if (!normalizedDraft) {
    return {
      criteria: [],
      rewriteCheckPassed: true,
      feedbackSummary: 'Draft is empty. Paste your working draft above to receive rubric critique.',
    };
  }

  // Split draft into clean sentences
  const sentences = normalizedDraft
    .split(/(?<=[\.\?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && normalizedDraft.includes(s));

  const critiques: RubricCriterionCritique[] = [];

  for (const crit of rubricCriteria) {
    const domain = matchDomain(crit.description);
    const sortedRatings = [...crit.ratings].sort((a, b) => a.points - b.points);

    // Find sentences containing domain keywords
    const matching = sentences.filter((s) => {
      const sLower = s.toLowerCase();
      return domain.keywords.some((kw) => sLower.includes(kw));
    });

    let readinessRank = 0;
    let readinessLevel = sortedRatings[0]?.description ?? 'Needs Improvement';
    let evidenceQuotes: string[] = [];
    let whatWouldRaiseIt = domain.weakAdvice;

    const numRatings = sortedRatings.length;
    if (matching.length === 0) {
      readinessRank = 0;
      readinessLevel = sortedRatings[0]?.description ?? 'Needs Improvement';
      evidenceQuotes = [];
      whatWouldRaiseIt = domain.weakAdvice;
    } else if (matching.length === 1 || normalizedDraft.split(/\s+/).length < 80) {
      readinessRank = Math.min(1, numRatings - 1);
      readinessLevel = sortedRatings[readinessRank]?.description ?? sortedRatings[0]?.description ?? 'Partial Fulfillment';
      evidenceQuotes = [matching[0]!];
      whatWouldRaiseIt = domain.partialAdvice;
    } else {
      readinessRank = numRatings - 1;
      readinessLevel = sortedRatings[readinessRank]?.description ?? 'Exemplary Fulfillment';
      evidenceQuotes = matching.slice(0, 2);
      whatWouldRaiseIt = domain.strongAdvice;
    }

    critiques.push({
      criterionId: crit.id,
      criterionDescription: crit.description,
      readinessLevel,
      readinessRank,
      evidenceQuotes,
      whatWouldRaiseIt,
    });
  }

  // HARD RULE: Sort weakest first
  const sorted = sortCriteriaWeakestFirst(critiques);

  // HARD RULE: Run rewrite detector across all advice
  const combinedAdvice = sorted.map((c) => c.whatWouldRaiseIt).join(' ');
  const rewriteCheck = checkForDraftRewrites(combinedAdvice, normalizedDraft);

  return {
    criteria: sorted,
    rewriteCheckPassed: rewriteCheck.isClean,
    rewriteCheckDetails: rewriteCheck,
    feedbackSummary: `Rubric critique generated across ${sorted.length} criteria (weakest first).`,
  };
}
