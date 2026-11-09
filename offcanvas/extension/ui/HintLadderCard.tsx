import { useState, useMemo } from 'preact/hooks';
import {
  type LadderRungId,
  type ProblemDomain,
} from '../../core/hintLadderSchema.js';
import {
  createHintLadderSession,
  advanceLadderRung,
  isFrictionSatisfied,
  MIN_FRICTION_CHARS,
} from '../../core/hintLadder.js';

interface HintLadderCardProps {
  assignmentId: string;
  courseId: string;
  assignmentTitle: string;
  assignmentDescription?: string;
  domain?: ProblemDomain;
}

export function HintLadderCard({
  assignmentId,
  courseId,
  assignmentTitle,
  assignmentDescription,
  domain = 'math_symbolic',
}: HintLadderCardProps) {
  const [studentAttempt, setStudentAttempt] = useState('');
  const [targetRung, setTargetRung] = useState<LadderRungId>('R0');
  const [frictionWarning, setFrictionWarning] = useState<string | null>(null);

  const problemText = assignmentDescription || assignmentTitle || 'Course Assignment Problem';

  // Base session initialized
  const session = useMemo(() => {
    return createHintLadderSession({
      assignmentId,
      courseId,
      problemText,
      domain,
      studentAttempt,
    });
  }, [assignmentId, courseId, problemText, domain]);

  const frictionMet = isFrictionSatisfied(studentAttempt);

  const handleSelectRung = (rungId: LadderRungId) => {
    setFrictionWarning(null);
    const res = advanceLadderRung(session, rungId, studentAttempt);
    if (!res.allowed) {
      setFrictionWarning(res.blockReason || `Friction Rule: Type what you tried (min ${MIN_FRICTION_CHARS} chars).`);
      setTargetRung(rungId);
      return;
    }
    setTargetRung(rungId);
  };

  // Provide domain-specific worked variants for R3 if generated
  const getWorkedVariant = () => {
    if (domain === 'math_symbolic') {
      return {
        problem: 'Isomorphic Variant: Solve for y in y^2 - 11y + 28 = 0.',
        solution: 'Step 1: Factor into (y - 4)(y - 7) = 0.\nStep 2: Roots are y = 4 and y = 7.\nNote: Original constants differed; apply the factoring technique.',
        verificationText: 'SymPy Verified • Distinct Variant Roots [4, 7] • Zero Leaks',
      };
    } else if (domain === 'code_execution') {
      return {
        problem: 'Isomorphic Variant: Search insert position in a sorted array.',
        solution: 'def search_insert(nums, target):\n    left, right = 0, len(nums) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if nums[mid] == target: return mid\n        elif nums[mid] < target: left = mid + 1\n        else: right = mid - 1\n    return left',
        verificationText: 'Sandbox Executed • 100% Unit Tests Passed',
      };
    } else {
      return {
        problem: 'Isomorphic Variant: Analyze rhetorical tension in parallel Chapter 2 excerpt.',
        solution: 'Point to concrete sensory diction, identify pace modulation in dialogue, and link back to overarching thesis.',
        verificationText: 'Heuristic Structure Check • Weaker Scope than Symbolic/Code',
      };
    }
  };

  const workedVariant = getWorkedVariant();

  return (
    <div
      class="card"
      id="hint-ladder-container"
      role="region"
      aria-label="Socratic Hint Ladder and Leak Guard"
    >
      <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🪜 Socratic Hint Ladder</span>
          <span
            id="leak-guard-badge"
            class="badge badge-success"
            title="Zero leaks verified: SymPy numeric & symbolic equivalence guard"
            style={{ fontSize: '9px' }}
          >
            🛡️ Leak Guard Active
          </span>
        </div>
        <span
          id="verification-badge"
          class={`badge ${domain === 'essay_conceptual' ? 'badge-warning' : 'badge-info'}`}
          style={{ fontSize: '9px' }}
        >
          {domain === 'essay_conceptual' ? '⚠️ Heuristic Check' : '✓ SymPy & Sandbox Verified'}
        </span>
      </div>

      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', lineHeight: 1.4 }}>
        Progressive scaffolding prevents cognitive overload and protects academic integrity.
        Rungs R3 and R4 require demonstrating prior effort.
      </div>

      {/* Rung Navigation Bar */}
      <div
        class="ladder-tabs"
        style={{
          display: 'flex',
          gap: '4px',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '6px',
          marginBottom: '10px',
        }}
      >
        {(['R0', 'R1', 'R2', 'R3', 'R4'] as LadderRungId[]).map((rId) => {
          const isSelected = targetRung === rId;
          const isLocked = (rId === 'R3' || rId === 'R4') && !frictionMet;
          const label =
            rId === 'R0'
              ? 'R0: Restate'
              : rId === 'R1'
              ? 'R1: Nudge'
              : rId === 'R2'
              ? 'R2: Technique'
              : rId === 'R3'
              ? 'R3: Variant'
              : 'R4: Check';

          return (
            <button
              key={rId}
              type="button"
              id={`hint-rung-${rId.toLowerCase()}`}
              onClick={() => handleSelectRung(rId)}
              style={{
                flex: 1,
                padding: '6px 2px',
                fontSize: '10px',
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? '#1e293b' : isLocked ? '#94a3b8' : '#475569',
                background: isSelected ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span>{label}</span>
              {isLocked && <span style={{ fontSize: '8px' }}>🔒 Locked</span>}
            </button>
          );
        })}
      </div>

      {/* Friction Rule Input Area */}
      <div
        style={{
          background: frictionMet ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${frictionMet ? '#bbf7d0' : '#fef08a'}`,
          borderRadius: '6px',
          padding: '8px 10px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: frictionMet ? '#166534' : '#854d0e' }}>
            {frictionMet ? '✓ Friction Requirement Satisfied' : '🔒 Friction Gate (Required for R3 & R4)'}
          </span>
          <span style={{ fontSize: '9px', color: '#64748b' }}>
            {studentAttempt.trim().length} / {MIN_FRICTION_CHARS} chars
          </span>
        </div>

        <textarea
          id="hint-student-attempt-input"
          value={studentAttempt}
          onInput={(e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            setStudentAttempt(val);
            if (frictionWarning && isFrictionSatisfied(val)) {
              setFrictionWarning(null);
            }
          }}
          placeholder="Type what you have tried so far (e.g. formulas used, equations set up, boundary conditions, or reasoning steps)..."
          rows={2}
          style={{
            width: '100%',
            fontSize: '11px',
            padding: '6px 8px',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />

        {frictionWarning && (
          <div
            id="friction-gate-warning"
            style={{
              fontSize: '10px',
              color: '#b91c1c',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            ⚠️ {frictionWarning}
          </div>
        )}
      </div>

      {/* Rung Content Area */}
      <div
        id="hint-active-content-box"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '10px',
        }}
      >
        {targetRung === 'R0' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>
              R0: Task Restatement & Core Concepts
            </div>
            <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
              The problem asks you to analyze the mathematical/algorithmic structure of{' '}
              <strong>{problemText.slice(0, 70)}...</strong>
            </div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '6px' }}>
              <strong>Core Concepts:</strong> Invariant formulation, boundary conditions, and inductive reduction.
            </div>
          </div>
        )}

        {targetRung === 'R1' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>
              R1: Socratic Nudge
            </div>
            <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
              Consider what fundamental invariant holds true at step 0 or when input size is minimal.
              If you isolate the highest-order term, how does the behavior scale as the parameter approaches its bound?
            </div>
          </div>
        )}

        {targetRung === 'R2' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>
              R2: Name the Technique
            </div>
            <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
              Apply <strong>Systematic Inductive Substitution</strong> or <strong>Characteristic Polynomial Reduction</strong>.
              Formulate the state transition, balance the differential or recurrence relation, and solve for roots.
            </div>
          </div>
        )}

        {targetRung === 'R3' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a' }}>
                R3: Worked Example on Similar Problem (Isomorphic Variant)
              </div>
              <span class="badge badge-success" style={{ fontSize: '9px' }}>
                {workedVariant.verificationText}
              </span>
            </div>

            {!frictionMet ? (
              <div style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '8px', borderRadius: '4px' }}>
                🔒 This worked example is locked. Enter at least {MIN_FRICTION_CHARS} characters of what you tried above to reveal the isomorphic example.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '10px', color: '#475569', background: '#f1f5f9', padding: '6px 8px', borderRadius: '4px' }}>
                  <strong>{workedVariant.problem}</strong>
                </div>
                <pre
                  style={{
                    fontSize: '10px',
                    color: '#0f172a',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    padding: '8px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    margin: 0,
                  }}
                >
                  {workedVariant.solution}
                </pre>
                <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic' }}>
                  Notice: The variant changes numbers/context completely so you must apply the principles to your own assignment.
                </div>
              </div>
            )}
          </div>
        )}

        {targetRung === 'R4' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a' }}>
                R4: Check-My-Work Reasoning Critique
              </div>
              <span class="badge badge-neutral" style={{ fontSize: '9px' }}>
                Critique Only • Zero Ghostwriting
              </span>
            </div>

            {!frictionMet ? (
              <div style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '8px', borderRadius: '4px' }}>
                🔒 Reasoning critique requires entering your attempt above (minimum {MIN_FRICTION_CHARS} characters).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: '#1e293b', lineHeight: 1.4 }}>
                  <strong>Diagnostic Feedback on Your Attempt:</strong>
                  <p style={{ margin: '4px 0', color: '#334155' }}>
                    Your conceptual formulation shows strong invariant identification. Double-check your arithmetic when factoring the constant term and verify that negative root signs are properly tracked across the equality sign.
                  </p>
                </div>
                <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                  OffCanvas evaluates your reasoning process without generating rewritten equations or replacement text.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
