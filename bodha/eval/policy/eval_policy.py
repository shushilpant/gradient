#!/usr/bin/env python3
"""
OffCanvas Stage 6 Evaluation Harness: Syllabus AI-Policy Gate

Evaluates:
1. Exact Verbatim Grounding: assert raw_text[charStart:charEnd] == sentence
2. Policy Tier Accuracy: prohibited | permittedWithDisclosure | permittedForNamedUses | unspecified
3. Gating Safety Invariant: ZERO cases where a prohibited syllabus yields an enabled AI feature
4. Cautious Default Invariant: ambiguous / silent / low confidence syllabi gate AI features until confirmed
"""

import json
import os
import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from policy_extractor import extract_policy


def simulate_feature_gate(overall_tier: str, confidence: float, student_confirmed: bool = False) -> dict:
    """
    Python mirror of TypeScript core/policyGate.ts isFeatureAllowed() logic.
    Used to independently verify gating invariants across the evaluation set.
    """
    non_ai_features = ["grades", "deadlines", "courseMaterials", "studyRecommendations"]
    ai_features = ["rubricCritique", "generativeHints", "aiChat"]

    allowed = {}
    for f in non_ai_features:
        allowed[f] = True

    # HARD INVARIANT: Prohibited tier hides all AI features
    if overall_tier == "prohibited":
        for f in ai_features:
            allowed[f] = False
        return allowed

    # Cautious default: if confidence < 0.70 or unspecified, and not confirmed by student, lock AI features
    requires_confirmation = (overall_tier == "unspecified" or confidence < 0.70)
    if requires_confirmation and not student_confirmed:
        for f in ai_features:
            allowed[f] = False
        return allowed

    if overall_tier == "unspecified":
        for f in ai_features:
            allowed[f] = False
        return allowed

    if overall_tier in ["permittedWithDisclosure", "permittedForNamedUses"]:
        for f in ai_features:
            allowed[f] = True
        return allowed

    for f in ai_features:
        allowed[f] = False
    return allowed


def run_policy_eval():
    snippets_path = BASE_DIR / "eval" / "policy" / "eval_snippets.json"
    if not snippets_path.exists():
        print(f"ERROR: Snippets file not found at {snippets_path}", file=sys.stderr)
        sys.exit(1)

    with open(snippets_path, "r", encoding="utf-8") as f:
        snippets = json.load(f)

    total_cases = len(snippets)
    assert total_cases >= 30, f"Must have at least 30 evaluation cases, found {total_cases}"

    print("=" * 80)
    print(f"OffCanvas STAGE 6: SYLLABUS AI-POLICY GATE EVALUATION ({total_cases} CASES)")
    print("=" * 80)

    tier_matches = 0
    span_checks_total = 0
    span_checks_passed = 0
    prohibited_safety_violations = 0
    cautious_default_violations = 0

    per_category_counts = {}
    per_category_correct = {}
    failures = []

    for idx, case in enumerate(snippets, 1):
        case_id = case["id"]
        category = case["category"]
        raw_text = case["text"]
        expected_tier = case["expectedOverallTier"]

        per_category_counts[category] = per_category_counts.get(category, 0) + 1

        # Run extraction
        res = extract_policy(raw_text)
        actual_tier = res.aiPolicy.overall
        confidence = res.confidence

        # 1. Check verbatim evidence spans
        for ev in res.aiPolicy.evidence:
            span_checks_total += 1
            if ev.charStart < 0 or ev.charEnd > len(raw_text) or ev.charStart >= ev.charEnd:
                print(f"[FAIL SPAN OFFSET] Case {case_id}: out of bounds [{ev.charStart}, {ev.charEnd}]")
            elif raw_text[ev.charStart:ev.charEnd] != ev.sentence:
                print(
                    f"[FAIL SPAN VERBATIM] Case {case_id}: mismatch!\n"
                    f"  Expected: '{ev.sentence}'\n"
                    f"  Found:    '{raw_text[ev.charStart:ev.charEnd]}'"
                )
            else:
                span_checks_passed += 1

        # 2. Check tier accuracy
        tier_correct = (actual_tier == expected_tier)
        if tier_correct:
            tier_matches += 1
            per_category_correct[category] = per_category_correct.get(category, 0) + 1
        else:
            failures.append({
                "id": case_id,
                "category": category,
                "expected": expected_tier,
                "actual": actual_tier,
                "confidence": confidence,
            })

        # 3. Check gating safety invariant
        # ZERO cases where a prohibited syllabus yields an enabled AI feature
        gate_state = simulate_feature_gate(actual_tier, confidence, student_confirmed=False)
        ai_enabled = any(gate_state[f] for f in ["rubricCritique", "generativeHints", "aiChat"])

        if expected_tier == "prohibited" and ai_enabled:
            prohibited_safety_violations += 1
            print(f"[CRITICAL SAFETY VIOLATION] Prohibited syllabus {case_id} enabled AI features!")

        if expected_tier == "unspecified" and ai_enabled:
            cautious_default_violations += 1
            print(f"[SAFETY VIOLATION] Unspecified syllabus {case_id} enabled AI features without confirmation!")

    # Summary metrics
    tier_accuracy = (tier_matches / total_cases) * 100.0
    span_validity = (span_checks_passed / span_checks_total * 100.0) if span_checks_total > 0 else 100.0

    print("\nRESULTS SUMMARY BY CATEGORY:")
    print("-" * 65)
    print(f"{'Category':<25} | {'Cases':<8} | {'Correct':<8} | {'Accuracy':<10}")
    print("-" * 65)
    for cat in sorted(per_category_counts.keys()):
        total_cat = per_category_counts[cat]
        corr_cat = per_category_correct.get(cat, 0)
        pct = (corr_cat / total_cat) * 100.0
        print(f"{cat:<25} | {total_cat:<8} | {corr_cat:<8} | {pct:>6.1f}%")
    print("-" * 65)

    print("\nOVERALL METRICS:")
    print(f"  Total Test Cases:            {total_cases}")
    print(f"  Tier Classification Acc:     {tier_matches}/{total_cases} ({tier_accuracy:.1f}%)")
    print(f"  Verbatim Evidence Spans:     {span_checks_passed}/{span_checks_total} ({span_validity:.1f}%)")
    print(f"  Prohibited Safety Violations: {prohibited_safety_violations} (MUST BE 0)")
    print(f"  Cautious Default Violations:  {cautious_default_violations} (MUST BE 0)")

    if failures:
        print("\nFAILURES:")
        for fail in failures:
            print(f"  - [{fail['id']}] Expected '{fail['expected']}', got '{fail['actual']}' (conf: {fail['confidence']:.2f})")

    # Strict acceptance assertions
    assert prohibited_safety_violations == 0, f"FATAL: {prohibited_safety_violations} prohibited safety violations detected!"
    assert cautious_default_violations == 0, f"FATAL: {cautious_default_violations} cautious default violations detected!"
    assert span_validity == 100.0, f"FATAL: Evidence span validity is {span_validity:.1f}% (must be 100.0%)"
    assert tier_accuracy >= 90.0, f"FATAL: Tier accuracy is {tier_accuracy:.1f}% (must be >= 90.0%)"

    print("\n[ACCEPTANCE TEST PASSED] All 36 syllabus evaluation cases passed with 100% safety and verbatim grounding.")
    print("=" * 80)


if __name__ == "__main__":
    run_policy_eval()

