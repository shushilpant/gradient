/**
 * Safety Guard & Hard-Stop Module
 * 
 * HARD RULE 2 (NON-NEGOTIABLE):
 * The panel must NOT inject or run on quiz-taking pages, timed assessments,
 * or LTI/New Quizzes launches (match URL patterns and known DOM markers;
 * make the list configurable; default to not running when unsure).
 * There is NO OVERRIDE.
 * 
 * Provides shouldRunOnPage(url, dom) returning boolean.
 */

export interface SafetyGuardConfig {
  blockedUrlPatterns: RegExp[];
  blockedDomSelectors: string[];
  allowedPathPatterns: RegExp[];
  defaultDenyWhenUnsure: boolean;
}

/**
 * Blocked URL patterns: quiz-taking, in-progress submissions, New Quizzes, and LTI launches.
 * Notice: Specifically matches '/take', '/take/questions', etc., discriminating from quiz landing pages.
 */
export const DEFAULT_BLOCKED_URL_PATTERNS: RegExp[] = [
  // Classic Canvas quiz taking
  /\/courses\/\d+\/quizzes\/\d+\/take(\/.*)?$/i,
  /\/courses\/\d+\/quizzes\/\d+\/take\/questions/i,
  /\/courses\/\d+\/quizzes\/\d+\/submissions/i,

  // Assignment take / in-progress assessment submission
  /\/courses\/\d+\/assignments\/\d+\/take/i,

  // LTI / New Quizzes launches & embed containers
  /\/external_tools\/.*quiz.*/i,
  /\/external_tools\/.*assessment.*/i,
  /canvas\.quiz-lti-iad-prod\.instructure\.com/i,
  /launch_type=assessment/i,
  /launch_type=quiz/i,

  // Remote proctoring & lockdown browser indicators
  /proctorio/i,
  /honorlock/i,
  /respondus/i,
];

/**
 * Known DOM markers that unequivocally indicate active quiz-taking or timed exam environment.
 */
export const DEFAULT_BLOCKED_DOM_SELECTORS: string[] = [
  // Active quiz submission forms
  '#submit_quiz_form',
  'form.take_quiz_form',
  'form#take_quiz_form',
  'div.quiz-submission',

  // Active timers & countdown clocks
  '#quiz_timer',
  '#timer_running',
  '.quiz-timer',
  '.quiz-submission-timer',
  '[data-testid="timer-display"]',
  '[aria-label*="time remaining" i]',
  '[aria-label*="quiz timer" i]',

  // Active question containers
  '#questions.quiz-questions',
  'div.display_question.question',
  'div[data-testid="question-content"]',

  // LTI / New Quizzes embed containers
  'iframe#tool_content[src*="quiz"]',
  'iframe[data-testid="lti-frame"][src*="assessment"]',
  'iframe[src*="new_quizzes"]',
];

/**
 * Safe allowlisted Canvas course paths where OffCanvas is permitted to inject.
 * Includes near-miss landing pages (e.g. /quizzes/:id without /take, /assignments/:id).
 */
export const DEFAULT_ALLOWED_PATH_PATTERNS: RegExp[] = [
  /^https?:\/\/[^/?#]+\/(?:[?#].*)?$/i,
  /\/(?:dashboard|courses)\/?(?:[?#].*)?$/i,
  /\/courses\/\d+\/?$/i,
  /\/courses\/\d+\/grades\/?$/i,
  /\/courses\/\d+\/assignments\/?$/i,
  /\/courses\/\d+\/assignments\/\d+\/?$/i,
  /\/courses\/\d+\/assignments\/syllabus\/?$/i,
  /\/courses\/\d+\/discussion_topics(?:\/\d+)?\/?$/i,
  /\/courses\/\d+\/quizzes\/?$/i,
  /\/courses\/\d+\/quizzes\/\d+\/?$/i,        // Near-miss: Quiz landing/overview page is SAFE
  /\/courses\/\d+\/quizzes\/\d+\/edit\/?$/i,   // Near-miss: Quiz edit page is SAFE
  /\/courses\/\d+\/modules\/?.*$/i,
  /\/courses\/\d+\/pages\/?.*$/i,
  /\/courses\/\d+\/announcements\/?.*$/i,
  /\/courses\/\d+\/syllabus\/?$/i,
  /\/courses\/\d+\/files\/?.*$/i,
  /\/courses\/\d+\/calendar_events\/?.*$/i,
  /\/calendar\/?.*$/i,
];

export interface HardStopEvaluation {
  allowed: boolean;
  blocked: boolean;
  reason: string;
}

export class SafetyGuard {
  private config: SafetyGuardConfig;

  constructor(customConfig?: Partial<SafetyGuardConfig>) {
    this.config = {
      blockedUrlPatterns: customConfig?.blockedUrlPatterns ?? DEFAULT_BLOCKED_URL_PATTERNS,
      blockedDomSelectors: customConfig?.blockedDomSelectors ?? DEFAULT_BLOCKED_DOM_SELECTORS,
      allowedPathPatterns: customConfig?.allowedPathPatterns ?? DEFAULT_ALLOWED_PATH_PATTERNS,
      defaultDenyWhenUnsure: customConfig?.defaultDenyWhenUnsure ?? true,
    };
  }

  evaluate(
    url: string,
    dom?: { querySelector(selector: string): unknown | null } | null
  ): HardStopEvaluation {
    if (!url || typeof url !== 'string') {
      return { allowed: false, blocked: true, reason: 'Invalid or missing URL (default deny)' };
    }

    // 1. Check blocked URL patterns (Hard Stop)
    for (const pattern of this.config.blockedUrlPatterns) {
      if (pattern.test(url)) {
        return {
          allowed: false,
          blocked: true,
          reason: `Blocked by URL safety rule: matches assessment pattern '${pattern.source}'`,
        };
      }
    }

    // 2. Check active DOM markers (timers, submission forms)
    if (dom) {
      for (const selector of this.config.blockedDomSelectors) {
        try {
          const elem = dom.querySelector(selector);
          if (elem) {
            return {
              allowed: false,
              blocked: true,
              reason: `Blocked by DOM safety marker: detected active assessment element '${selector}'`,
            };
          }
        } catch {
          continue;
        }
      }
    }

    // 3. Default-deny when unsure: verify URL path belongs to recognised safe Canvas course spaces
    if (this.config.defaultDenyWhenUnsure) {
      const isRecognizedSafe = this.config.allowedPathPatterns.some((pattern) => pattern.test(url));
      if (!isRecognizedSafe) {
        return {
          allowed: false,
          blocked: true,
          reason: `Blocked by fail-closed policy: URL '${url}' is outside recognised safe Canvas course views`,
        };
      }
    }

    return {
      allowed: true,
      blocked: false,
      reason: 'Safe to inject: allowlisted Canvas course page with zero assessment markers',
    };
  }

  canInject(
    url: string,
    dom?: { querySelector(selector: string): unknown | null } | null
  ): HardStopEvaluation {
    return this.evaluate(url, dom);
  }
}

export const defaultSafetyGuard = new SafetyGuard();

/**
 * Hard-stop module primary entry point:
 * Returns boolean whether the OffCanvas panel is permitted to inject or run on the page.
 * Returns false on quiz-taking pages, timed assessments, LTI launches, or unknown paths.
 */
export function shouldRunOnPage(
  url: string,
  dom?: { querySelector(selector: string): unknown | null } | null,
  config?: Partial<SafetyGuardConfig>
): boolean {
  const guard = config ? new SafetyGuard(config) : defaultSafetyGuard;
  return guard.evaluate(url, dom).allowed;
}
