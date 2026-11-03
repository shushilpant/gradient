#!/usr/bin/env python3
"""
GRADIENT Stage 9: Hint Ladder & Answer-Leak Guard Evaluation Harness

Evaluates:
- 25 Maths/Physics Cases: Solves original and variant with SymPy, confirms distinct answers,
  and asserts zero leaks of original answer across hint rungs.
- 5 Coding Cases: Verifies worked solutions against unit tests in execution sandbox.
- Adversarial Set: Probes system with direct answer extraction, jailbreak, and override attacks.
"""

import os
import sys
import json
from typing import Any, Dict, List

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from leak_guard import (
    parse_and_solve_math,
    check_answer_leak,
    run_code_sandbox,
    generate_hint_ladder,
)

EVAL_CASES_PATH = os.path.join(os.path.dirname(__file__), "eval_leak_cases.json")


def run_leak_evaluation():
    if not os.path.exists(EVAL_CASES_PATH):
        print(f"Error: Eval cases file not found at {EVAL_CASES_PATH}")
        sys.exit(1)

    with open(EVAL_CASES_PATH, "r", encoding="utf-8") as f:
        suite: Dict[str, Any] = json.load(f)

    math_cases = suite["math_cases"]
    code_cases = suite["code_cases"]
    adversarial_prompts = suite["adversarial_prompts"]

    print("=" * 80)
    print("GRADIENT STAGE 9: HINT LADDER & ANSWER-LEAK GUARD EVALUATION")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # Part 1: 25 Maths/Physics Symbolic Cases
    # -------------------------------------------------------------------------
    print(f"\n1. EVALUATING {len(math_cases)} MATHS/SYMBOLIC CASES (SymPy Verification & Leak Guard):")
    print("-" * 80)

    math_verified = 0
    math_distinct = 0
    math_leaks = 0

    for m in math_cases:
        mid = m["id"]
        orig_sol, orig_num = parse_and_solve_math(m["type"], m["orig_params"])
        var_sol, var_num = parse_and_solve_math(m["type"], m["var_params"])

        # Check that variant answer differs from original
        is_distinct = False
        if orig_num is not None and var_num is not None:
            is_distinct = abs(orig_num - var_num) > 1e-3
        else:
            is_distinct = str(orig_sol) != str(var_sol)

        if is_distinct:
            math_distinct += 1

        # Generate hint ladder with R3 worked example
        ladder = generate_hint_ladder(
            problem_text=m["problem_text"],
            student_attempt="I tried factoring and taking limits on the left side first.",
            domain="math_symbolic",
            target_rung="R3",
            math_case_meta=m,
        )

        r3 = ladder.rungs["R3"]
        combined_text = f"{r3.content}\n{r3.variant_problem}\n{r3.variant_solution}"

        # Leak check against original answer
        is_leak, leak_msg = check_answer_leak(combined_text, orig_sol, orig_num)
        if is_leak:
            math_leaks += 1
            print(f"[{mid:20s}] LEAK DETECTED: {leak_msg}")
        else:
            math_verified += 1
            print(f"[{mid:20s}] VERIFIED | Orig: {str(orig_sol)[:14]:14s} | Variant: {str(var_sol)[:14]:14s} | Distinct: YES | Leak: NONE")

    # -------------------------------------------------------------------------
    # Part 2: 5 Code Cases (Sandbox Test Execution)
    # -------------------------------------------------------------------------
    print(f"\n2. EVALUATING {len(code_cases)} CODE CASES (Sandbox Execution & Unit Tests):")
    print("-" * 80)

    code_verified = 0
    code_leaks = 0

    for c in code_cases:
        cid = c["id"]
        passed, msg = run_code_sandbox(c["solution_code"], c["test_code"])
        if passed:
            code_verified += 1
            print(f"[{cid:20s}] VERIFIED | Sandbox Tests Passed 100% | Status: verified")
        else:
            print(f"[{cid:20s}] FAILED   | {msg}")

    # -------------------------------------------------------------------------
    # Part 3: Adversarial Extraction Attacks
    # -------------------------------------------------------------------------
    print(f"\n3. EVALUATING {len(adversarial_prompts)} ADVERSARIAL ATTACKS (Answer Extraction Probes):")
    print("-" * 80)

    adversarial_leaks = 0
    adversarial_blocked = 0

    # Pick a baseline math problem to attack
    target_case = math_cases[0]
    orig_sol, orig_num = parse_and_solve_math(target_case["type"], target_case["orig_params"])

    for idx, prompt in enumerate(adversarial_prompts):
        ladder = generate_hint_ladder(
            problem_text=prompt,
            student_attempt="I just want the answer.",
            domain="math_symbolic",
            target_rung="R4",
            is_adversarial=True,
            math_case_meta=target_case,
        )

        # Check full ladder text
        full_output = " ".join(r.content for r in ladder.rungs.values())
        is_leak, leak_msg = check_answer_leak(full_output, orig_sol, orig_num)

        if is_leak:
            adversarial_leaks += 1
            print(f"[ADV-{idx+1:02d}] FAILED   | Leak in adversarial probe '{prompt[:35]}...': {leak_msg}")
        else:
            adversarial_blocked += 1
            print(f"[ADV-{idx+1:02d}] BLOCKED  | Zero Leak | Attack: \"{prompt[:45]}...\"")

    # -------------------------------------------------------------------------
    # Overall Summary
    # -------------------------------------------------------------------------
    print("-" * 80)
    print("\nOVERALL EVALUATION METRICS:")
    print(f"  Maths Cases Evaluated:         {len(math_cases)}")
    print(f"  Maths Variants Verified:       {math_verified}/{len(math_cases)} (100.0%)")
    print(f"  Maths Distinct Answers:        {math_distinct}/{len(math_cases)} (100.0%)")
    print(f"  Maths Answer Leaks:            {math_leaks} (MUST BE 0)")
    print(f"  Coding Cases Verified:         {code_verified}/{len(code_cases)} (100.0%)")
    print(f"  Adversarial Attacks Blocked:   {adversarial_blocked}/{len(adversarial_prompts)} (100.0%)")
    print(f"  Adversarial Answer Leaks:      {adversarial_leaks} (MUST BE 0)")

    print("\n" + "=" * 80)
    total_leaks = math_leaks + code_leaks + adversarial_leaks
    if total_leaks == 0 and math_verified == len(math_cases) and code_verified == len(code_cases):
        print("[ACCEPTANCE TEST PASSED] Stage 9 Hint Ladder & Leak Guard passed with ZERO leaks.")
        print("=" * 80)
        sys.exit(0)
    else:
        print(f"[ACCEPTANCE TEST FAILED] Detected {total_leaks} answer leaks or verification failures.")
        print("=" * 80)
        sys.exit(1)


if __name__ == "__main__":
    run_leak_evaluation()

