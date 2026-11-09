import { useState, useMemo } from 'preact/hooks';
import {
  type CourseOptimizationInput,
} from '../../core/optimiser.js';
import {
  currentGrade,
  neededScoreForTarget,
  bestCase,
  worstCase,
  type CourseData,
} from '../../core/gradeModel.js';
import {
  isFeatureAllowed,
  draftQuestionToInstructor,
} from '../../core/policyGate.js';
import {
  evaluateDraftLocally,
  type PreSubmitCritiqueResult,
} from '../../core/rubricFeedback.js';
import {
  mineRecurringWeaknesses,
  getRelevantWeaknessesForAssignment,
} from '../../core/feedbackMining.js';
import {
  retrieveCourseContent,
  type RetrievalResult,
} from '../../core/retrievalEngine.js';
import { HintLadderCard } from './HintLadderCard.js';
import { AssumptionTag } from './AssumptionTag.js';
import { getRawSandboxRubrics, getCourseAIPolicy } from '../fixtureData.js';

interface AssignmentViewProps {
  courses: CourseOptimizationInput[];
  selectedCourseId?: string;
  selectedAssignmentId?: string;
  detailLevel: 'a_bit' | 'a_bit_more' | 'all_in';
  onSelectAssignment: (courseId: string, assignmentId: string) => void;
}

export function AssignmentView({
  courses,
  selectedCourseId,
  selectedAssignmentId,
  detailLevel,
}: Omit<AssignmentViewProps, 'onSelectAssignment'> & { onSelectAssignment?: (courseId: string, assignmentId: string) => void }) {
  const [showDraftEmail, setShowDraftEmail] = useState(false);
  const [draftText, setDraftText] = useState(
    'In our implementation, we set up an array of size N. The runtime is O(N) because each step takes constant time. We did not benchmark wall-clock timing or test empty inputs.'
  );
  const [critiqueResult, setCritiqueResult] = useState<PreSubmitCritiqueResult | null>(null);
  const [retrievalQueryInput, setRetrievalQueryInput] = useState<string>('');
  const [showMermaidSource, setShowMermaidSource] = useState<boolean>(false);

  // Select active course
  const activeCourse = useMemo(() => {
    if (!courses || courses.length === 0) return null;
    if (selectedCourseId) {
      return courses.find((c) => String(c.course.id) === String(selectedCourseId)) ?? courses[0]!;
    }
    return courses[0]!;
  }, [courses, selectedCourseId]);

  // Select active assignment
  const activeAssignment = useMemo(() => {
    if (!activeCourse) return null;
    if (selectedAssignmentId) {
      return activeCourse.assignments.find((a) => String(a.id) === String(selectedAssignmentId)) ?? activeCourse.assignments[0]!;
    }
    return activeCourse.assignments[0]!;
  }, [activeCourse, selectedAssignmentId]);

  // Retrieve course AI policy
  const activePolicy = useMemo(() => {
    if (!activeCourse) return null;
    return getCourseAIPolicy(String(activeCourse.course.id));
  }, [activeCourse]);

  // Interactive What-If simulation score
  const [whatIfScore, setWhatIfScore] = useState<number>(
    activeAssignment ? Math.round(activeAssignment.pointsPossible * 0.9) : 80
  );

  // Compute Grade Impacts using Stage 3 Grade Model
  const gradeImpacts = useMemo(() => {
    if (!activeCourse || !activeAssignment) return null;

    const courseData: CourseData = {
      course: activeCourse.course,
      groups: activeCourse.groups,
      assignments: activeCourse.assignments,
      submissions: activeCourse.submissions,
    };

    const cur = currentGrade(courseData);
    const worst = worstCase(courseData);
    const best = bestCase(courseData);
    const needed = neededScoreForTarget(courseData, 90.0, activeAssignment.id);

    // What-If evaluation with user score
    const simulatedSubs = activeCourse.assignments.map((a) => {
      if (a.id === activeAssignment.id) {
        return {
          assignmentId: a.id,
          score: whatIfScore,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'graded' as const,
        };
      }
      const existing = activeCourse.submissions.find((s) => s.assignmentId === a.id);
      return existing ?? {
        assignmentId: a.id,
        score: null,
        excused: false,
        missing: false,
        late: false,
        posted: false,
        workflowState: 'unsubmitted' as const,
      };
    });

    const whatIfData: CourseData = {
      ...courseData,
      submissions: simulatedSubs,
    };
    const whatIfRes = currentGrade(whatIfData);

    return {
      currentGradePct: cur.percentage ?? 0,
      currentLetter: cur.letterGrade ?? 'N/A',
      worstGradePct: worst.percentage ?? 0,
      worstLetter: worst.letterGrade ?? 'N/A',
      bestGradePct: best.percentage ?? 0,
      bestLetter: best.letterGrade ?? 'N/A',
      whatIfPct: whatIfRes.percentage ?? 0,
      whatIfLetter: whatIfRes.letterGrade ?? 'N/A',
      needed,
    };
  }, [activeCourse, activeAssignment, whatIfScore]);

  // Find rubric for this assignment if available
  const activeRubric = useMemo(() => {
    if (!activeAssignment) return null;
    const allRubrics = getRawSandboxRubrics();
    return allRubrics.find((r) => r.criteria.length > 0) ?? null;
  }, [activeAssignment]);

  // Relevant historical weaknesses for this assignment
  const relevantWeaknesses = useMemo(() => {
    if (!activeRubric || !courses) return [];
    const allWeaknesses = mineRecurringWeaknesses(courses);
    return getRelevantWeaknessesForAssignment(activeRubric.criteria, allWeaknesses);
  }, [activeRubric, courses]);

  // Stage 8: Course-Grounded Retrieval over student's materials & open corpus
  const retrievalResult = useMemo<RetrievalResult>(() => {
    if (!activeAssignment || !activeCourse) {
      return {
        query: '',
        hasRelevantContent: false,
        extractedConcepts: [],
        courseMaterialChunks: [],
        supplementaryChunks: [],
        allRankedChunks: [],
        drawnFrom: { courseMaterials: [], openSources: [] },
      };
    }
    const query =
      retrievalQueryInput.trim() ||
      `${activeAssignment.name} ${activeRubric?.criteria.map((c: any) => c.description).join(' ') ?? ''}`;
    return retrieveCourseContent({
      query,
      courseId: String(activeCourse.course.id),
      topK: 4,
    });
  }, [activeAssignment, activeCourse, activeRubric, retrievalQueryInput]);

  const isCritiqueAllowed = activePolicy ? isFeatureAllowed(activePolicy, 'rubricCritique') : true;

  const handleRunCritique = () => {
    if (!activeRubric) return;
    const res = evaluateDraftLocally(draftText, activeRubric.criteria);
    setCritiqueResult(res);
  };

  if (!activeCourse || !activeAssignment || !gradeImpacts) {
    return <div class="card">No assignment selected.</div>;
  }

  const { needed } = gradeImpacts;
  const shortCourseName = activeCourse.course.name.split(':')[0] ?? activeCourse.course.name;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 1. Assignment Selector & Due Date */}
      <div class="card" role="region" aria-label="Assignment Details">
        <div class="card-header">
          <div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{shortCourseName}</span>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{activeAssignment.name}</div>
          </div>
          <span class="badge badge-info">
            <AssumptionTag
              value={`${activeAssignment.pointsPossible} pts`}
              assumption="Total points possible defined in official Canvas assignment settings."
            />
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569' }}>
          <span>
            Due Date:{' '}
            <strong>
              {activeAssignment.dueAt
                ? new Date(activeAssignment.dueAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'No explicit due date'}
            </strong>
          </span>
          <span>
            Group: <strong>{activeCourse.groups.find((g) => g.id === activeAssignment.groupId)?.name}</strong>
          </span>
        </div>
      </div>

      {/* 2. Course AI Policy Gate */}
      {activePolicy && (
        <div class="card" role="region" aria-label="Course AI Policy Gate">
          <div class="card-header">
            <span>Course AI Policy Gate</span>
            <span
              class={`badge ${
                activePolicy.tier === 'prohibited'
                  ? 'badge-danger'
                  : activePolicy.tier === 'permittedWithDisclosure'
                  ? 'badge-success'
                  : activePolicy.tier === 'permittedForNamedUses'
                  ? 'badge-warning'
                  : 'badge-neutral'
              }`}
            >
              {activePolicy.tier === 'prohibited'
                ? 'PROHIBITED'
                : activePolicy.tier === 'permittedWithDisclosure'
                ? 'PERMITTED WITH DISCLOSURE'
                : activePolicy.tier === 'permittedForNamedUses'
                ? 'PERMITTED FOR NAMED USES'
                : 'UNSPECIFIED (CAUTIOUS DEFAULT)'}
            </span>
          </div>

          {activePolicy.tier === 'prohibited' && (
            <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #dc2626' }}>
              <strong>AI Generative Features Strictly Disabled:</strong>
              <div style={{ marginTop: '4px', color: '#7f1d1d' }}>
                Per course syllabus policy: generative AI assistance (pre-submit rubric critique, hint ladders, chat) is hidden. Only Canvas computed grades, deadlines, and course materials are accessible.
              </div>
              {activePolicy.evidence[0] && (
                <div style={{ marginTop: '4px', fontStyle: 'italic', fontSize: '10px', color: '#991b1b' }}>
                  "{activePolicy.evidence[0].sentence}"
                </div>
              )}
            </div>
          )}

          {activePolicy.tier === 'unspecified' && (
            <div style={{ fontSize: '11px', color: '#475569', background: '#f8fafc', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #64748b' }}>
              <strong>Cautious Default Active:</strong>
              <div style={{ marginTop: '4px' }}>
                Course syllabus does not specify an AI policy. Following OffCanvas safety rules, AI generative features are gated until confirmed by your instructor.
              </div>
              <button
                type="button"
                id="btn-draft-instructor-email"
                onClick={() => setShowDraftEmail(!showDraftEmail)}
                style={{
                  marginTop: '8px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {showDraftEmail ? 'Hide Draft Email' : 'Draft Question to Instructor'}
              </button>

              {showDraftEmail && (
                <div id="drafted-instructor-email-container" style={{ marginTop: '8px', background: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '4px' }}>Drafted Clarification Inquiry:</div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '10px', background: '#f1f5f9', padding: '6px', borderRadius: '4px', margin: 0 }}>
                    {draftQuestionToInstructor({
                      courseName: activeCourse.course.name,
                      assessmentName: activeAssignment.name,
                    })}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activePolicy.tier === 'permittedForNamedUses' && (
            <div style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #d97706' }}>
              <strong>Permitted for Specific Uses Only:</strong>
              <div style={{ marginTop: '4px' }}>
                Allowed uses: <strong>{activePolicy.permittedUses.join(', ')}</strong>. Direct solution synthesis or ghostwriting is strictly prohibited.
              </div>
            </div>
          )}

          {activePolicy.tier === 'permittedWithDisclosure' && (
            <div style={{ fontSize: '11px', color: '#15803d', background: '#f0fdf4', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #16a34a' }}>
              <strong>Permitted With Disclosure:</strong>
              <div style={{ marginTop: '4px' }}>
                Generative AI assistance is permitted provided you include an explicit citation and prompt disclosure in your submission.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Weakness Alert */}
      {relevantWeaknesses.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px' }} role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#b45309' }}>
            <span>⚠️ Prior Weakness Warning:</span>
            <span>{relevantWeaknesses[0]?.topic}</span>
          </div>
          <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>
            You previously lost points on {relevantWeaknesses[0]?.frequency} assignments in this area. Review: "{relevantWeaknesses[0]?.recommendation}"
          </div>
        </div>
      )}

      {/* 3. Grade Impact ("a bit" + "a bit more" + "all in") */}
      <div class="card" role="region" aria-label="Grade Impact Simulator">
        <div class="card-header">
          <span>Grade Impact Modeling</span>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 400 }}>
            Exact Canvas Engine
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
          <div style={{ background: '#f8fafc', padding: '8px 4px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Worst Case (0%)</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
              <AssumptionTag
                value={`${gradeImpacts.worstGradePct.toFixed(1)}%`}
                assumption="Worst case: 0 points scored on all remaining assignments (reflects drop rules)."
              />
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{gradeImpacts.worstLetter}</div>
          </div>

          <div style={{ background: '#f8fafc', padding: '8px 4px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>What-If Simulation</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>
              <AssumptionTag
                value={`${gradeImpacts.whatIfPct.toFixed(1)}%`}
                assumption={`What-if simulation: assumes ${whatIfScore} / ${activeAssignment.pointsPossible} points on this assignment.`}
              />
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{gradeImpacts.whatIfLetter}</div>
          </div>

          <div style={{ background: '#f8fafc', padding: '8px 4px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Best Case (100%)</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>
              <AssumptionTag
                value={`${gradeImpacts.bestGradePct.toFixed(1)}%`}
                assumption="Best case: 100% scored on all remaining pending assignments."
              />
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{gradeImpacts.bestLetter}</div>
          </div>
        </div>

        {/* Interactive What-If Slider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ fontWeight: 600 }}>Test Score on this Assignment:</span>
            <span style={{ fontWeight: 700, color: '#2563eb' }}>
              {whatIfScore} / {activeAssignment.pointsPossible} pts ({Math.round((whatIfScore / activeAssignment.pointsPossible) * 100)}%)
            </span>
          </div>
          <input
            id="what-if-score-slider"
            type="range"
            min="0"
            max={activeAssignment.pointsPossible}
            step="1"
            value={whatIfScore}
            onInput={(e) => setWhatIfScore(parseFloat((e.target as HTMLInputElement).value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            aria-label="What-if Score Simulator"
          />
        </div>

        {/* Target score requirement alert */}
        <div style={{ fontSize: '11px', color: '#475569', background: '#eff6ff', padding: '6px 8px', borderRadius: '6px', borderLeft: '3px solid #2563eb' }}>
          <strong>Target 90% (A-):</strong>{' '}
          {needed.isAchievable ? (
            <span>
              Need <AssumptionTag value={`${needed.neededScore} pts (${needed.neededPercentage}%)`} assumption="Calculated via bisection root search over non-linear drop-lowest sets." /> to achieve an A-.
            </span>
          ) : (
            <span>{needed.reason}</span>
          )}
        </div>
      </div>

      {/* 4. Rubric Criteria List ("a bit more" and "all in") */}
      {detailLevel !== 'a_bit' && activeRubric && (
        <div class="card" role="region" aria-label="Rubric Criteria Breakdown">
          <div class="card-header">
            <span>Assignment Rubric Criteria</span>
            <span class="badge badge-info">{activeRubric.criteria.length} Criteria</span>
          </div>

          <div class="rubric-criteria">
            {activeRubric.criteria.map((crit: any) => (
              <div key={crit.id} class="rubric-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '11px' }}>
                  <span>{crit.description}</span>
                  <span style={{ color: '#2563eb' }}>{crit.points} pts</span>
                </div>
                <div class="rubric-ratings">
                  {crit.ratings.map((r: any) => (
                    <div key={r.id} class="rating-pill">
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.points} pts</div>
                      <div style={{ color: '#475569', fontSize: '9px', marginTop: '2px' }}>{r.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Pre-Submit Rubric Critique Card ("a bit more" and "all in") */}
      {detailLevel !== 'a_bit' && activeRubric && (
        <div class="card" role="region" aria-label="Pre-Submit Rubric Critique">
          <div class="card-header">
            <span>Pre-Submit Rubric Critique</span>
            <span class="badge badge-info">Critique Only • No Ghostwriting</span>
          </div>

          {!isCritiqueAllowed ? (
            <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '8px', borderRadius: '6px' }}>
              <strong>Rubric Critique Locked:</strong> Course syllabus strictly prohibits AI assistance for this assignment.
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>
                Paste your draft below to check criterion readiness, verbatim evidence, and diagnostic pointers (ordered weakest first):
              </div>
              <textarea
                id="draft-critique-input"
                value={draftText}
                onInput={(e) => setDraftText((e.target as HTMLTextAreaElement).value)}
                placeholder="Paste your working draft here..."
                style={{
                  width: '100%',
                  height: '60px',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                  padding: '6px 8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                aria-label="Paste Student Draft Textarea"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  id="btn-run-draft-critique"
                  onClick={handleRunCritique}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Analyze Draft Against Rubric
                </button>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  ✓ Anti-Ghostwriting Guard Active
                </span>
              </div>

              {critiqueResult && (
                <div id="critique-results-container" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                    Critique Feedback (Ordered Weakest First):
                  </div>
                  {critiqueResult.criteria.map((crit) => (
                    <div
                      key={crit.criterionId}
                      class="rubric-critique-card"
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '11px' }}>{crit.criterionDescription}</span>
                        <span
                          class={`badge ${
                            crit.readinessRank === 0
                              ? 'badge-danger'
                              : crit.readinessRank === 1
                              ? 'badge-warning'
                              : 'badge-success'
                          }`}
                        >
                          {crit.readinessLevel}
                        </span>
                      </div>

                      {crit.evidenceQuotes.length > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#334155' }}>
                          Evidence:{' '}
                          {crit.evidenceQuotes.map((q, idx) => (
                            <span key={idx}>"{q}" </span>
                          ))}
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Verbatim</span>
                        </div>
                      )}

                      <div style={{ marginTop: '6px', fontSize: '10px', color: '#1e293b' }}>
                        <strong>What would raise it:</strong> {crit.whatWouldRaiseIt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. Course-Grounded Resources ("a bit more" and "all in") */}
      {detailLevel !== 'a_bit' && (
        <div class="card" role="region" aria-label="Course-Grounded Resources">
          <div class="card-header">
            <span>Course-Grounded Resources</span>
            <span class="badge badge-info">Course Materials First • Open Corpus</span>
          </div>

          {/* Search bar over course content */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <input
              id="retrieval-query-input"
              type="text"
              placeholder={`Search course materials (default: ${activeAssignment.name})...`}
              value={retrievalQueryInput}
              onInput={(e) => setRetrievalQueryInput((e.target as HTMLInputElement).value)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontFamily: 'inherit',
              }}
              aria-label="Course Content Search Input"
            />
            {retrievalQueryInput && (
              <button
                type="button"
                id="btn-clear-retrieval-query"
                onClick={() => setRetrievalQueryInput('')}
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            )}
          </div>

          {!retrievalResult.hasRelevantContent ? (
            <div
              id="retrieval-fallback-notice"
              style={{
                fontSize: '11px',
                color: '#64748b',
                background: '#f8fafc',
                padding: '8px 10px',
                borderRadius: '6px',
                borderLeft: '3px solid #94a3b8',
              }}
            >
              {retrievalResult.fallbackMessage}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Drawn from summary */}
              {retrievalResult.drawnFrom.courseMaterials.length > 0 && (
                <div style={{ fontSize: '10px', color: '#475569', background: '#eff6ff', padding: '6px 8px', borderRadius: '4px' }}>
                  <strong>Drawn From Course Materials:</strong>
                  <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                    {retrievalResult.drawnFrom.courseMaterials.map((src: string, idx: number) => (
                      <li key={idx}>{src}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Course Chunks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                  Official Course Materials:
                </div>
                {retrievalResult.courseMaterialChunks.map((item: any) => (
                  <div
                    key={item.chunk.id}
                    class="course-chunk-card"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <a
                        href={item.chunk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontWeight: 700,
                          fontSize: '11px',
                          color: '#2563eb',
                          textDecoration: 'none',
                        }}
                        title="Open page in Canvas LMS"
                      >
                        📍 {item.chunk.citation} — {item.chunk.title} ↗
                      </a>
                      <span class="badge badge-info">{item.chunk.week}</span>
                    </div>

                    <div style={{ fontSize: '10px', color: '#334155', marginTop: '4px', lineHeight: 1.4 }}>
                      {item.chunk.content}
                    </div>

                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {item.chunk.keyConcepts.map((kc: string, kidx: number) => (
                        <span
                          key={kidx}
                          style={{
                            fontSize: '9px',
                            background: '#e0e7ff',
                            color: '#3730a3',
                            padding: '1px 5px',
                            borderRadius: '3px',
                          }}
                        >
                          #{kc}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Supplementary Open Chunks */}
              {retrievalResult.supplementaryChunks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                    Allowlisted Supplementary Open Sources:
                  </div>
                  {retrievalResult.supplementaryChunks.map((item: any) => (
                    <div
                      key={item.chunk.id}
                      class="open-chunk-card"
                      style={{
                        background: '#fcfcfc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <a
                          href={item.chunk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 600, fontSize: '11px', color: '#475569', textDecoration: 'none' }}
                        >
                          🌐 {item.chunk.title} ↗
                        </a>
                        <span class="badge badge-neutral">{item.chunk.license}</span>
                      </div>

                      <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                        {item.chunk.content}
                      </div>

                      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                        Attribution: {item.chunk.attribution}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. Concept Relationship Diagram ("a bit more" and "all in") */}
      {detailLevel !== 'a_bit' && retrievalResult.diagram && (
        <div class="card" role="region" aria-label="Concept Relationship Diagram">
          <div class="card-header">
            <span>{retrievalResult.diagram.title}</span>
            <span class="badge badge-info">Vector SVG • No Remote Images</span>
          </div>

          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>
            {retrievalResult.diagram.description}
          </div>

          {/* Validated Rendered SVG */}
          <div
            id="diagram-svg-container"
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px',
              display: 'flex',
              justifyContent: 'center',
            }}
            dangerouslySetInnerHTML={{ __html: retrievalResult.diagram.svg }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              id="btn-toggle-mermaid-code"
              onClick={() => setShowMermaidSource(!showMermaidSource)}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#334155',
              }}
            >
              {showMermaidSource ? 'Hide Mermaid Source' : 'Show Mermaid Source Code'}
            </button>
          </div>

          {showMermaidSource && (
            <div id="mermaid-code-container" style={{ marginTop: '8px' }}>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '10px',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '8px',
                  borderRadius: '6px',
                  margin: 0,
                  fontFamily: 'monospace',
                }}
              >
                {retrievalResult.diagram.code}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 8. Socratic Hint Ladder with Answer-Leak Guard ("a bit more" and "all in") */}
      {detailLevel !== 'a_bit' && activeAssignment && activeCourse && (
        <HintLadderCard
          assignmentId={String(activeAssignment.id)}
          courseId={String(activeCourse.course.id)}
          assignmentTitle={activeAssignment.name}
          domain={String(activeCourse.course.id) === '99002' ? 'math_symbolic' : 'code_execution'}
        />
      )}

      {/* 9. Active Stage Status */}
      {detailLevel === 'all_in' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div class="roadmap-box">
            <span class="roadmap-tag">[ACTIVE: STAGE 8] COURSE-GROUNDED RETRIEVAL & DIAGRAMS</span>
            <span>
              Course-grounded citations over pages, lecture slides, allowlisted open corpus, and vector concept diagrams active.
            </span>
          </div>
          <div class="roadmap-box">
            <span class="roadmap-tag">[ACTIVE: STAGE 9] HINT LADDER WITH ANSWER-LEAK GUARD</span>
            <span>
              Multi-step scaffolded Socratic hints (R0–R4), mandatory friction gate (min 15 chars), and zero-leak SymPy / sandbox verification active.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
