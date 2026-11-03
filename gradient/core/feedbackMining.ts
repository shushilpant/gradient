/**
 * GRADIENT Stage 7: Local Feedback Mining Engine
 * 
 * Analyzes the student's own historical rubric assessments and instructor comments
 * across past assignments and courses to identify, cluster, and rank recurring weaknesses.
 * 
 * Feeds:
 * 1. Dashboard View: "Top Recurring Weaknesses" alert card
 * 2. Assignment View: Contextual warnings for matching rubric criteria
 * 3. Hint Ladder: Tailored scaffolding emphasis
 */

import { type CourseOptimizationInput } from './optimiser.js';
import { type RubricCriterion } from './schema.js';

export interface HistoricalLossItem {
  courseId: string;
  courseName: string;
  assignmentId: string;
  assignmentName: string;
  criterionId: string;
  criterionDescription: string;
  pointsEarned: number;
  pointsPossible: number;
  pointsLost: number;
  lossPercentage: number;
  instructorComment?: string;
}

export interface RecurringWeakness {
  id: string;
  topic: string;
  frequency: number; // Number of distinct assignments where points were lost
  totalPointsLost: number;
  averageLossPct: number;
  severity: 'high' | 'medium' | 'low';
  underlyingData: HistoricalLossItem[];
  recommendation: string;
}

// Topic classification keywords for clustering past rubric losses
const TOPIC_CLUSTERS: Record<string, { title: string; keywords: string[]; advice: string }> = {
  edgeCasesAndComplexity: {
    title: 'Algorithmic Complexity & Edge Cases',
    keywords: [
      'asymptotic',
      'big-o',
      'complexity',
      'runtime',
      'edge case',
      'base case',
      'worst-case',
      'efficiency',
      'memoization',
      'tabulation',
    ],
    advice:
      'Prioritize testing 0, 1, and negative boundary inputs, and explicitly state asymptotic bounds before writing implementation code.',
  },
  mathematicalRigor: {
    title: 'Mathematical Rigor & Proof Structure',
    keywords: [
      'proof',
      'derivation',
      'recurrence',
      'induction',
      'theorem',
      'algebra',
      'formal',
      'discrete',
      'probability',
    ],
    advice:
      'State induction hypotheses and base conditions explicitly; verify algebraic step transitions with SymPy algebraic tools.',
  },
  empiricalEvaluation: {
    title: 'Empirical Benchmark & Evaluation Report',
    keywords: [
      'benchmark',
      'empirical',
      'evaluation',
      'chart',
      'measurement',
      'experiment',
      'data analysis',
      'scaling',
    ],
    advice:
      'Include comparative baselines and variance error bars on charts, and connect empirical runtime scaling back to theoretical complexity.',
  },
  codeQualityAndModularity: {
    title: 'Code Quality, Modularity & Testing',
    keywords: [
      'code quality',
      'modularity',
      'pure function',
      'clean code',
      'unit test',
      'architecture',
      'refactor',
    ],
    advice:
      'Separate business logic into small pure functions with explicit TypeScript/Python types and write unit tests for each helper.',
  },
  citationsAndDocumentation: {
    title: 'Citation Standards & Documentation',
    keywords: [
      'citation',
      'reference',
      'sources',
      'bibliography',
      'literature',
      'documentation',
      'comments',
    ],
    advice:
      'Document external sources and algorithms with formal references, and include explanatory docstrings on public APIs.',
  },
};

/**
 * Classifies a criterion description and instructor comment into a standard weakness topic.
 */
function classifyCriterionTopic(description: string, comment?: string): string {
  const descLower = description.toLowerCase();
  for (const [clusterKey, cluster] of Object.entries(TOPIC_CLUSTERS)) {
    if (cluster.keywords.some((kw) => descLower.includes(kw))) {
      return clusterKey;
    }
  }

  if (comment) {
    const commentLower = comment.toLowerCase();
    for (const [clusterKey, cluster] of Object.entries(TOPIC_CLUSTERS)) {
      if (cluster.keywords.some((kw) => commentLower.includes(kw))) {
        return clusterKey;
      }
    }
  }

  return 'generalAnalysis';
}

/**
 * Mines the student's past submissions and rubric assessments across all courses.
 * Performs local deterministic clustering and ranking.
 */
export function mineRecurringWeaknesses(
  courses: CourseOptimizationInput[]
): RecurringWeakness[] {
  const clusterMap: Record<string, HistoricalLossItem[]> = {};

  for (const courseItem of courses) {
    const courseId = String(courseItem.course.id);
    const courseName = courseItem.course.name.split(':')[0] ?? courseItem.course.name;

    for (const assign of courseItem.assignments) {
      const sub = courseItem.submissions.find((s) => s.assignmentId === assign.id);
      if (!sub || sub.score === null) continue;

      // 1. Check if submission has structured rubric assessment
      if (sub.rubricAssessment && assign.rubric && assign.rubric.length > 0) {
        for (const crit of assign.rubric) {
          const assessment = sub.rubricAssessment[crit.id];
          if (assessment) {
            const pointsLost = Math.max(0, crit.points - assessment.points);
            if (pointsLost > 0) {
              const topicKey = classifyCriterionTopic(crit.description, assessment.comments);
              if (!clusterMap[topicKey]) clusterMap[topicKey] = [];

              clusterMap[topicKey].push({
                courseId,
                courseName,
                assignmentId: assign.id,
                assignmentName: assign.name,
                criterionId: crit.id,
                criterionDescription: crit.description,
                pointsEarned: assessment.points,
                pointsPossible: crit.points,
                pointsLost,
                lossPercentage: (pointsLost / crit.points) * 100,
                instructorComment: assessment.comments,
              });
            }
          }
        }
      } else if (sub.score < assign.pointsPossible && assign.rubric && assign.rubric.length > 0) {
        // 2. Fallback: assignment had a rubric and points were lost, attribute proportionally
        const totalLost = assign.pointsPossible - sub.score;
        const lossRatio = totalLost / assign.pointsPossible;

        for (const crit of assign.rubric) {
          const critLost = crit.points * lossRatio;
          const topicKey = classifyCriterionTopic(crit.description);
          if (!clusterMap[topicKey]) clusterMap[topicKey] = [];

          clusterMap[topicKey].push({
            courseId,
            courseName,
            assignmentId: assign.id,
            assignmentName: assign.name,
            criterionId: crit.id,
            criterionDescription: crit.description,
            pointsEarned: Math.round(crit.points - critLost),
            pointsPossible: crit.points,
            pointsLost: Math.round(critLost),
            lossPercentage: Math.round(lossRatio * 100),
          });
        }
      }
    }
  }

  // Build ranked RecurringWeakness summaries
  const results: RecurringWeakness[] = [];

  for (const [topicKey, items] of Object.entries(clusterMap)) {
    if (items.length === 0) continue;

    const clusterDef = TOPIC_CLUSTERS[topicKey] ?? {
      title: 'General Analytical Rigor',
      keywords: [],
      advice: 'Review rubric criteria requirements thoroughly prior to final submission.',
    };

    const distinctAssignments = new Set(items.map((i) => `${i.courseId}:${i.assignmentId}`)).size;
    const totalPointsLost = items.reduce((sum, i) => sum + i.pointsLost, 0);
    const avgLossPct = items.reduce((sum, i) => sum + i.lossPercentage, 0) / items.length;

    let severity: 'high' | 'medium' | 'low' = 'low';
    if (distinctAssignments >= 2 || totalPointsLost >= 25 || avgLossPct >= 30) {
      severity = distinctAssignments >= 3 || totalPointsLost >= 40 ? 'high' : 'medium';
    }

    results.push({
      id: `weakness_${topicKey}`,
      topic: clusterDef.title,
      frequency: distinctAssignments,
      totalPointsLost,
      averageLossPct: Math.round(avgLossPct),
      severity,
      underlyingData: items,
      recommendation: clusterDef.advice,
    });
  }

  // Sort by severity (high > medium > low), then totalPointsLost descending
  const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  results.sort((a, b) => {
    const sDiff = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
    if (sDiff !== 0) return sDiff;
    return b.totalPointsLost - a.totalPointsLost;
  });

  return results;
}

/**
 * Matches an upcoming assignment's rubric criteria against mined historical weaknesses.
 * Returns only weaknesses relevant to the current assignment.
 */
export function getRelevantWeaknessesForAssignment(
  assignmentRubric: RubricCriterion[] | undefined,
  recurringWeaknesses: RecurringWeakness[]
): RecurringWeakness[] {
  if (!assignmentRubric || assignmentRubric.length === 0 || recurringWeaknesses.length === 0) {
    return [];
  }

  const combinedRubricText = assignmentRubric.map((c) => c.description).join(' ').toLowerCase();

  return recurringWeaknesses.filter((w) => {
    const cluster = Object.values(TOPIC_CLUSTERS).find((c) => c.title === w.topic);
    if (!cluster) return false;
    return cluster.keywords.some((kw) => combinedRubricText.includes(kw));
  });
}
