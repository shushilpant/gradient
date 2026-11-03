"""
GRADIENT Backend: Rubric-Aware Draft Feedback Engine

HARD RULES:
1. Pre-submit check: user pastes a draft. Backend returns, per rubric criterion:
   - a readiness level mapped to the rubric's own rating descriptors
   - evidence quotes copied verbatim from the draft (validated)
   - what would raise it
   - and nothing else.
2. NO rewritten sentences, NO suggested replacement prose, NO ghostwritten paragraphs.
3. Automated checker that flags outputs containing long spans that look like draft rewrites.
4. Order criteria weakest first.
5. Do NOT output a predicted numeric grade.
"""

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RubricRatingModel(BaseModel):
    id: Optional[str] = None
    description: str
    points: float


class RubricCriterionModel(BaseModel):
    id: str
    description: str
    points: float
    ratings: List[RubricRatingModel] = Field(default_factory=list)


class CritiqueDraftRequest(BaseModel):
    draft: str
    rubric: List[RubricCriterionModel]
    courseInfo: Optional[Dict[str, Any]] = None
    assignmentName: Optional[str] = None


class CriterionCritiqueModel(BaseModel):
    criterionId: str
    criterionDescription: str
    readinessLevel: str
    readinessRank: int  # 0 (lowest) to N (highest)
    evidenceQuotes: List[str]
    whatWouldRaiseIt: str


class CritiqueDraftResponse(BaseModel):
    criteria: List[CriterionCritiqueModel]  # Sorted weakest first
    rewriteCheckPassed: bool
    feedbackSummary: str


# Phrases signaling prohibited ghostwriting, prose replacement, or sentence injection
REWRITE_PATTERNS = [
    re.compile(r'\b(?:you should write|try writing|replace (?:it|this) with|instead of .* write)\b', re.IGNORECASE),
    re.compile(r'\b(?:here is a (?:better|revised|improved) version|use this sentence instead)\b', re.IGNORECASE),
    re.compile(r'\b(?:suggested rewrite|suggested revision|consider phrasing it as)\b', re.IGNORECASE),
    re.compile(r'\b(?:instead say|change (?:this|it) to:?|a better way to say this is)\b', re.IGNORECASE),
    re.compile(r'\b(?:here is how to rewrite|rephrase as:?|copy and paste this)\b', re.IGNORECASE),
    re.compile(r'\b(?:in your draft, insert:?|add the following paragraph:?)\b', re.IGNORECASE),
]


def check_for_draft_rewrites(critique_text: str, draft_text: str) -> Dict[str, Any]:
    """
    Automated rewrite detector verifying that feedback contains diagnostic pointers only,
    and zero ghostwritten sentences, replacement prose, or code block solutions.
    """
    violations: List[str] = []

    # 1. Prohibited rewrite trigger phrases
    for pattern in REWRITE_PATTERNS:
        match = pattern.search(critique_text)
        if match:
            violations.append(f"Prohibited rewrite directive detected: '{match.group(0)}'")

    # 2. Prohibited code blocks
    if "```" in critique_text:
        violations.append("Prohibited code snippet block detected in critique text.")

    # 3. Quoted sentences not present in student draft
    quote_matches = re.findall(r'"([^"]{20,})"', critique_text)
    for q in quote_matches:
        if q not in draft_text:
            if len(q.split()) >= 5:
                violations.append(f"Unverified quote not found in draft: '{q}'")

    # 4. Long n-gram overlap (> 8 continuous words matching draft without explicit quote)
    draft_words = [w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', draft_text)]
    critique_words = [w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', critique_text)]
    window_size = 8

    if len(draft_words) >= window_size and len(critique_words) >= window_size:
        draft_windows = set()
        for i in range(len(draft_words) - window_size + 1):
            draft_windows.add(" ".join(draft_words[i : i + window_size]))

        for i in range(len(critique_words) - window_size + 1):
            w_str = " ".join(critique_words[i : i + window_size])
            if w_str in draft_windows and not any(w_str in q.lower() for q in quote_matches):
                violations.append(f"Unquoted high n-gram overlap with draft: '{w_str}'")
                break

    return {
        "isClean": len(violations) == 0,
        "violations": violations,
    }


def find_sentences_in_draft(draft: str, keywords: List[str]) -> List[str]:
    """
    Finds exact sentences in draft that contain specified keywords.
    Guarantees every returned sentence is an exact substring of the draft.
    """
    # Split draft into sentences while keeping exact punctuation
    raw_sentences = re.split(r'(?<=[\.\?!])\s+', draft)
    matches: List[str] = []

    for s in raw_sentences:
        s_clean = s.strip()
        if not s_clean:
            continue
        s_lower = s_clean.lower()
        if any(kw.lower() in s_lower for kw in keywords):
            # Verify exact presence in draft
            if s_clean in draft:
                matches.append(s_clean)

    return matches


# Keyword dictionary mapping criterion domains to diagnostic indicators
CRITERION_KEYWORDS: Dict[str, Dict[str, Any]] = {
    "asymptotic": {
        "keywords": ["big-o", "o(", "asymptotic", "complexity", "omega", "theta", "worst-case", "runtime"],
        "weak_advice": "State the governing asymptotic recurrence or loop structure, and derive the tight upper bound mathematically.",
        "partial_advice": "Provide formal algebraic simplification for the summation steps rather than asserting the final bound.",
        "strong_advice": "Verify that tight lower bounds (Omega) and edge case constraints match your upper bound claims.",
    },
    "recurrence": {
        "keywords": ["recurrence", "t(n)", "base case", "divide", "conquer", "master theorem"],
        "weak_advice": "Explicitly write out the recurrence relation formula T(n) and declare base cases for small n.",
        "partial_advice": "State which case of the Master Theorem applies and verify regularity conditions for the non-recursive term.",
        "strong_advice": "Check whether boundary conditions at n=1 or n=0 introduce hidden logarithmic overhead.",
    },
    "code": {
        "keywords": ["implementation", "function", "algorithm", "data structure", "array", "pointer", "loop", "recursion"],
        "weak_advice": "Describe the core data structure choices and explain how memory allocation scales with input size.",
        "partial_advice": "Discuss edge cases such as empty inputs, duplicates, or single-element collections.",
        "strong_advice": "Document invariants maintained across recursive calls or loop passes.",
    },
    "benchmark": {
        "keywords": ["benchmark", "empirical", "wall-clock", "profiling", "trials", "baseline", "experiments", "scaling chart", "timing run"],
        "weak_advice": "Include empirical timing measurements across multiple input scales (e.g. N=10 to 10^6) and record trials.",
        "partial_advice": "Add a comparative baseline implementation and plot variance error bars across repeated experimental runs.",
        "strong_advice": "Directly compare observed empirical curve slope to theoretical big-O complexity predictions.",
    },
    "modularity": {
        "keywords": ["modular", "structure", "architecture", "test", "helper", "function", "documentation", "clean"],
        "weak_advice": "Decompose monolithic operations into single-responsibility helper functions with clear parameter contracts.",
        "partial_advice": "Add unit testing coverage for boundary conditions and document expected preconditions and postconditions.",
        "strong_advice": "Refactor common sub-routines into reusable pure utilities to maximize architectural clarity.",
    },
    "general": {
        "keywords": [],
        "weak_advice": "Address this criterion directly by introducing dedicated analysis and explicit methodology.",
        "partial_advice": "Elaborate on core assumptions and substantiate conclusions with supporting evidence.",
        "strong_advice": "Review all rubric rating descriptors to ensure every sub-requirement is fully satisfied.",
    },
}


def match_criterion_domain(description: str) -> Dict[str, Any]:
    desc_lower = description.lower()
    for key, val in CRITERION_KEYWORDS.items():
        if key != "general":
            if key in desc_lower or any(kw in desc_lower for kw in val["keywords"]):
                return val
    return CRITERION_KEYWORDS["general"]


def evaluate_criterion_readiness(
    criterion: RubricCriterionModel,
    draft: str
) -> CriterionCritiqueModel:
    """
    Evaluates a single rubric criterion against the student draft.
    Returns readiness level mapped to rubric rating, verbatim quotes, and diagnostic advice.
    """
    domain = match_criterion_domain(criterion.description)
    matching_sentences = find_sentences_in_draft(draft, domain["keywords"])

    # Sort ratings by points ascending (rank 0 = lowest/weakest)
    sorted_ratings = sorted(criterion.ratings, key=lambda r: r.points)
    if not sorted_ratings:
        # Fallback single rating if rubric had no discrete ratings
        sorted_ratings = [
            RubricRatingModel(description="Needs Improvement", points=0.0),
            RubricRatingModel(description="Satisfactory", points=criterion.points),
        ]

    num_ratings = len(sorted_ratings)

    # Determine readiness rank based on evidence depth
    if not matching_sentences:
        # Missing evidence -> lowest rating level
        readiness_rank = 0
        readiness_level = sorted_ratings[0].description
        evidence_quotes: List[str] = []
        what_would_raise_it = domain["weak_advice"]
    elif len(matching_sentences) == 1 or len(draft.split()) < 80:
        # Shallow / partial evidence -> middle rating level
        readiness_rank = min(1, num_ratings - 1)
        readiness_level = sorted_ratings[readiness_rank].description
        evidence_quotes = [matching_sentences[0]]
        what_would_raise_it = domain["partial_advice"]
    else:
        # Strong evidence -> top rating level
        readiness_rank = num_ratings - 1
        readiness_level = sorted_ratings[-1].description
        evidence_quotes = matching_sentences[:2]
        what_would_raise_it = domain["strong_advice"]

    # Verify that all evidence quotes are strictly verbatim substrings
    for q in evidence_quotes:
        assert q in draft, f"Verbatim error: quote '{q}' not found in draft."

    return CriterionCritiqueModel(
        criterionId=criterion.id,
        criterionDescription=criterion.description,
        readinessLevel=readiness_level,
        readinessRank=readiness_rank,
        evidenceQuotes=evidence_quotes,
        whatWouldRaiseIt=what_would_raise_it,
    )


def generate_draft_critique(
    draft: str,
    rubric: List[RubricCriterionModel]
) -> CritiqueDraftResponse:
    """
    Generates pre-submit draft critique ordered weakest first.
    Enforces no rewrites, no predicted numeric grade, and verbatim evidence grounding.
    """
    if not draft.strip():
        return CritiqueDraftResponse(
            criteria=[],
            rewriteCheckPassed=True,
            feedbackSummary="Draft is empty. Paste your current working draft to receive rubric critique.",
        )

    criteria_critiques: List[CriterionCritiqueModel] = []

    for crit in rubric:
        eval_result = evaluate_criterion_readiness(crit, draft)
        criteria_critiques.append(eval_result)

    # HARD RULE: Order criteria weakest first (readinessRank ascending)
    criteria_critiques.sort(key=lambda c: c.readinessRank)

    # HARD RULE: Run automated rewrite detector across all guidance output
    combined_advice = " ".join(c.whatWouldRaiseIt for c in criteria_critiques)
    rewrite_check = check_for_draft_rewrites(combined_advice, draft)

    return CritiqueDraftResponse(
        criteria=criteria_critiques,
        rewriteCheckPassed=rewrite_check["isClean"],
        feedbackSummary=f"Rubric critique generated across {len(criteria_critiques)} criteria (ordered weakest first).",
    )
