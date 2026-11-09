#!/usr/bin/env python3
"""
OffCanvas Stage 7 Evaluation Harness: Rubric-Aware Feedback & Rewrite Guard

Evaluates:
1. Ordinal Agreement: predicted criterion readiness level vs hand-labelled expected ranges.
2. Verbatim Evidence Grounding: every evidence quote exists verbatim in the student draft.
3. Weakest-First Ordering: criteria are ordered strictly from lowest to highest readiness.
4. No-Numeric-Grade Invariant: zero predicted points, scores, or letter grades output.
5. Rewrite Detector Benchmark:
   - 0 False Positives on clean diagnostic critique outputs.
   - 0 False Negatives across synthetic ghostwriting / rewrite injection probes.
"""

import json
import os
import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from rubric_feedback import (
    RubricCriterionModel,
    RubricRatingModel,
    generate_draft_critique,
    check_for_draft_rewrites,
)

# Synthetic rewrite probes to test rewrite detector false negatives
SYNTHETIC_REWRITE_PROBES = [
    {
        "id": "probe_directive_1",
        "bad_critique": "You should write: T(n) = 2T(n/2) + O(n) which yields O(n log n) by Master Theorem case 2.",
        "expected_violation": "rewrite directive",
    },
    {
        "id": "probe_directive_2",
        "bad_critique": "Here is a better version of your second paragraph: The inner loop runs n-i times.",
        "expected_violation": "rewrite directive",
    },
    {
        "id": "probe_directive_3",
        "bad_critique": "Instead say: The state space consists of (N+1)*(W+1) entries in the DP table.",
        "expected_violation": "rewrite directive",
    },
    {
        "id": "probe_directive_4",
        "bad_critique": "Consider phrasing it as: We maintain loop invariants across each iteration.",
        "expected_violation": "rewrite directive",
    },
    {
        "id": "probe_code_injection",
        "bad_critique": "Here is the code to fix your error:\n```python\ndef solve(n):\n    return n * 2\n```",
        "expected_violation": "code snippet",
    },
    {
        "id": "probe_unverified_quote",
        "bad_critique": 'In your proof you should declare "We deduce that the tree depth is strictly bounded by log2(n) levels".',
        "expected_violation": "unverified quote",
    },
]


def run_rubric_eval():
    drafts_path = BASE_DIR / "eval" / "rubric" / "eval_drafts.json"
    if not drafts_path.exists():
        print(f"ERROR: Drafts file not found at {drafts_path}", file=sys.stderr)
        sys.exit(1)

    with open(drafts_path, "r", encoding="utf-8") as f:
        draft_cases = json.load(f)

    total_drafts = len(draft_cases)
    assert total_drafts >= 15, f"Must have at least 15 evaluation drafts, found {total_drafts}"

    print("=" * 80)
    print(f"OffCanvas STAGE 7: RUBRIC-AWARE FEEDBACK & REWRITE GUARD EVALUATION ({total_drafts} DRAFTS)")
    print("=" * 80)

    total_criteria_evaluated = 0
    exact_rank_matches = 0
    tolerant_rank_matches = 0  # within 1 level or within expected range

    verbatim_quotes_checked = 0
    verbatim_quotes_passed = 0

    ordering_checks_total = 0
    ordering_checks_passed = 0

    numeric_grade_violations = 0
    false_positives = 0
    false_negatives = 0

    per_draft_reports = []

    for idx, case in enumerate(draft_cases, 1):
        draft_id = case["id"]
        title = case["title"]
        draft_text = case["draftText"]
        expected_ranges = case["expectedRankRange"]

        rubric_models = [
            RubricCriterionModel(
                id=c["id"],
                description=c["description"],
                points=c["points"],
                ratings=[RubricRatingModel(**r) for r in c.get("ratings", [])],
            )
            for c in case["rubric"]
        ]

        # 1. Run draft critique
        res = generate_draft_critique(draft_text, rubric_models)

        # 2. Invariant: No predicted numeric grade
        res_dict = res.model_dump()
        for forbidden in ["predictedgrade", "predictedscore", "score", "grade", "percentage"]:
            if forbidden in str(res_dict).lower():
                # Allow 'description' strings containing the word 'grade' or 'score', but not keys
                for key in res_dict.keys():
                    if forbidden in key.lower():
                        numeric_grade_violations += 1

        # 3. Check Weakest-First Ordering
        criteria = res.criteria
        is_ordered = True
        for i in range(len(criteria) - 1):
            ordering_checks_total += 1
            if criteria[i].readinessRank <= criteria[i + 1].readinessRank:
                ordering_checks_passed += 1
            else:
                is_ordered = False
                print(f"[FAIL ORDER] Draft {draft_id}: criteria not weakest first!")

        # 4. Check Verbatim Evidence Quotes
        quotes_valid = True
        for c in criteria:
            for q in c.evidenceQuotes:
                verbatim_quotes_checked += 1
                if q in draft_text:
                    verbatim_quotes_passed += 1
                else:
                    quotes_valid = False
                    print(f"[FAIL VERBATIM QUOTE] Draft {draft_id}: '{q}' not found in draft!")

        # 5. Check Ordinal Agreement against hand-labelled ranges
        draft_agreements = []
        for c in criteria:
            total_criteria_evaluated += 1
            exp_range = expected_ranges.get(c.criterionId, [0, 2])
            min_r, max_r = exp_range[0], exp_range[1]

            is_exact = (min_r <= c.readinessRank <= max_r)
            is_tolerant = (min_r - 1 <= c.readinessRank <= max_r + 1)

            if is_exact:
                exact_rank_matches += 1
                tolerant_rank_matches += 1
                draft_agreements.append(f"{c.criterionId}: OK (rank {c.readinessRank})")
            elif is_tolerant:
                tolerant_rank_matches += 1
                draft_agreements.append(f"{c.criterionId}: TOLERANT (rank {c.readinessRank} vs [{min_r},{max_r}])")
            else:
                draft_agreements.append(f"{c.criterionId}: MISMATCH (rank {c.readinessRank} vs [{min_r},{max_r}])")

        # 6. Check Rewrite Detector on Clean Output (False Positive Check)
        combined_advice = " ".join(c.whatWouldRaiseIt for c in criteria)
        clean_check = check_for_draft_rewrites(combined_advice, draft_text)
        if not clean_check["isClean"]:
            false_positives += 1
            print(f"[FALSE POSITIVE] Clean draft {draft_id} flagged: {clean_check['violations']}")

        per_draft_reports.append({
            "id": draft_id,
            "title": title,
            "is_ordered": is_ordered,
            "quotes_valid": quotes_valid,
            "agreements": draft_agreements,
        })

    # 7. Test Rewrite Detector on Synthetic Injected Probes (False Negative Check)
    dummy_draft = "Our algorithm processes the binary search tree."
    for probe in SYNTHETIC_REWRITE_PROBES:
        probe_res = check_for_draft_rewrites(probe["bad_critique"], dummy_draft)
        if probe_res["isClean"]:
            false_negatives += 1
            print(f"[FALSE NEGATIVE] Probe {probe['id']} failed to be caught! Critique: {probe['bad_critique']}")
        else:
            # Verified caught
            pass

    # Summary Metrics
    exact_pct = (exact_rank_matches / total_criteria_evaluated) * 100.0
    tolerant_pct = (tolerant_rank_matches / total_criteria_evaluated) * 100.0
    quotes_pct = (verbatim_quotes_passed / verbatim_quotes_checked * 100.0) if verbatim_quotes_checked > 0 else 100.0
    order_pct = (ordering_checks_passed / ordering_checks_total * 100.0) if ordering_checks_total > 0 else 100.0

    print("\nPER-DRAFT EVALUATION RESULTS:")
    print("-" * 80)
    for rep in per_draft_reports:
        print(f"[{rep['id']:<22}] {rep['title']:<40} | Ordered: {'YES' if rep['is_ordered'] else 'NO'} | Quotes: {'YES' if rep['quotes_valid'] else 'NO'}")
        for agr in rep["agreements"]:
            print(f"    - {agr}")
    print("-" * 80)

    print("\nOVERALL EVALUATION METRICS:")
    print(f"  Total Draft Cases:            {total_drafts}")
    print(f"  Total Criteria Evaluated:     {total_criteria_evaluated}")
    print(f"  Exact Ordinal Agreement:      {exact_rank_matches}/{total_criteria_evaluated} ({exact_pct:.1f}%)")
    print(f"  Tolerant Ordinal Agreement:   {tolerant_rank_matches}/{total_criteria_evaluated} ({tolerant_pct:.1f}%)")
    print(f"  Verbatim Quote Validity:      {verbatim_quotes_passed}/{verbatim_quotes_checked} ({quotes_pct:.1f}%)")
    print(f"  Weakest-First Order Rate:     {ordering_checks_passed}/{ordering_checks_total} ({order_pct:.1f}%)")
    print(f"  Predicted Numeric Grades:     {numeric_grade_violations} (MUST BE 0)")
    print(f"  Rewrite Detector False Pos:   {false_positives} (MUST BE 0)")
    print(f"  Rewrite Detector False Neg:   {false_negatives} (MUST BE 0 across {len(SYNTHETIC_REWRITE_PROBES)} adversarial probes)")

    # Assertions
    assert numeric_grade_violations == 0, f"FATAL: {numeric_grade_violations} numeric grade violations detected!"
    assert false_positives == 0, f"FATAL: {false_positives} false positives detected in clean outputs!"
    assert false_negatives == 0, f"FATAL: {false_negatives} false negatives in rewrite detection!"
    assert quotes_pct == 100.0, f"FATAL: Verbatim quote validity is {quotes_pct:.1f}% (must be 100%)"
    assert order_pct == 100.0, f"FATAL: Weakest-first ordering compliance is {order_pct:.1f}% (must be 100%)"
    assert tolerant_pct >= 85.0, f"FATAL: Tolerant agreement is {tolerant_pct:.1f}% (must be >= 85.0%)"

    print("\n[ACCEPTANCE TEST PASSED] Stage 7 Rubric Critique & Rewrite Guard passed with 100% compliance.")
    print("=" * 80)


if __name__ == "__main__":
    run_rubric_eval()

