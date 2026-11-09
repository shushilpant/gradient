import {
  type AnnouncementChangeAlert,
  AnnouncementChangeAlertSchema,
} from './schedulerSchema.js';

export interface KnownAssignment {
  id: string;
  name: string;
  courseId: string;
  dueAt: string;
}

export interface AnnouncementInput {
  id: string;
  courseId: string;
  title: string;
  message: string;
  postedAt?: string;
}

const CHANGE_PATTERNS = [
  /([A-Z][^\.!\n]*?\b(?:due\s+date|deadline|submission\s+deadline)\s+(?:has\s+been\s+|is\s+)?(?:moved|extended|postponed|shifted|delayed|pushed\s+back)\s+(?:to|until)\s+([^.!\n]+?)(?:\.|\n|!|$))/i,
  /([A-Z][^\.!\n]*?\b(?:extended\s+(?:the\s+)?deadline\s+(?:for\s+[^.!\n]+?)?(?:to|until)\s+)([^.!\n]+?)(?:\.|\n|!|$))/i,
  /([A-Z][^\.!\n]*?\bnew\s+due\s+date\s*(?:is|:)\s*([^.!\n]+?)(?:\.|\n|!|$))/i,
  /([A-Z][^\.!\n]*?\bsubmit\s+(?:it\s+)?(?:by|before)\s+([^.!\n]+?)(?:\s+instead|\s+without|\.|\n|!|$))/i,
  /([A-Z][^\.!\n]*?\bdeadline\s+is\s+now\s+([^.!\n]+?)(?:\.|\n|!|$))/i,
  /([A-Z][^\.!\n]*?\bgranting\s+an\s+extension\s+(?:until|to)\s+([^.!\n]+?)(?:\.|\n|!|$))/i,
];

const FALSE_POSITIVE_TRIGGERS = [
  /\boffice\s+hours\b/i,
  /\blecture\s+(?:room|time|hall)\b/i,
  /\bclass\s+meeting\b/i,
  /\bexam\s+review\s+session\b/i,
  /\bcoffee\s+chat\b/i,
];

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Parses informal date strings from announcements into an ISO 8601 UTC string.
 */
export function parseInformalDate(dateStr: string, baseYear = 2026): string | null {
  const clean = dateStr.trim().replace(/[.,;!]$/, '');

  const regex = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?(?:\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i;
  const m = clean.match(regex);
  if (!m) return null;

  const monthIdx = MONTH_NAMES[m[1]!.toLowerCase()];
  if (monthIdx === undefined) return null;

  const day = parseInt(m[2]!, 10);
  const year = m[3] ? parseInt(m[3], 10) : baseYear;

  let hour = 23;
  let minute = 59;
  if (m[4]) {
    let h = parseInt(m[4], 10);
    const mi = m[5] ? parseInt(m[5], 10) : 0;
    const ampm = m[6]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    hour = h;
    minute = mi;
  }

  const d = new Date(Date.UTC(year, monthIdx, day, hour, minute, 0));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Scans course announcements and syllabus notes for due date change alerts.
 */
export function scanAnnouncementsForChanges(
  announcements: AnnouncementInput[],
  knownAssignments: KnownAssignment[]
): AnnouncementChangeAlert[] {
  const alerts: AnnouncementChangeAlert[] = [];

  for (const ann of announcements) {
    const combined = `${ann.title}\n${ann.message}`;

    // Check false positive markers unless assignment words are present
    const isFalsePos = FALSE_POSITIVE_TRIGGERS.some((pat) => pat.test(combined));
    const hasAssignWord = /\b(homework|hw|assignment|project|milestone|problem\s+set)\b/i.test(combined);
    if (isFalsePos && !hasAssignWord) {
      continue;
    }

    let matchedSentence: string | null = null;
    let rawDateSnippet: string | null = null;

    for (const pat of CHANGE_PATTERNS) {
      const match = combined.match(pat);
      if (match) {
        matchedSentence = match[1]!.trim();
        rawDateSnippet = match[2]!.trim();
        break;
      }
    }

    if (!matchedSentence || !rawDateSnippet) {
      continue;
    }

    const detectedDate = parseInformalDate(rawDateSnippet);
    if (!detectedDate) {
      continue;
    }

    // Match assignment
    let matchedAssign: KnownAssignment | null = null;
    const courseAssigns = knownAssignments.filter((a) => a.courseId === ann.courseId);

    for (const assign of courseAssigns) {
      const assignClean = assign.name.toLowerCase();
      const numMatch = assignClean.match(/\b(?:hw|homework|project|ps|problem\s+set|milestone|lab\s+report)\s*#?(\d+)\b/i);
      if (numMatch) {
        const num = numMatch[1];
        const shortPats = [
          new RegExp(`\\bhw\\s*${num}\\b`, 'i'),
          new RegExp(`\\bhomework\\s*${num}\\b`, 'i'),
          new RegExp(`\\bproject\\s*${num}\\b`, 'i'),
          new RegExp(`\\bps\\s*${num}\\b`, 'i'),
          new RegExp(`\\bproblem\\s+set\\s*${num}\\b`, 'i'),
          new RegExp(`\\blab\\s+(?:report\\s*)?${num}\\b`, 'i'),
        ];
        if (shortPats.some((p) => p.test(combined))) {
          matchedAssign = assign;
          break;
        }
      } else {
        const nameTokens = assignClean.split(/[:\-\s]+/).filter((t) => t.length > 2);
        if (nameTokens.length > 0 && nameTokens.slice(0, 2).every((t) => combined.toLowerCase().includes(t))) {
          matchedAssign = assign;
          break;
        }
      }
    }

    if (!matchedAssign && courseAssigns.length === 1) {
      matchedAssign = courseAssigns[0]!;
    }

    if (!matchedAssign) {
      continue;
    }

    const charStart = Math.max(0, combined.indexOf(matchedSentence));
    const charEnd = charStart + matchedSentence.length;

    const rawAlert = {
      id: `change-${ann.id}-${matchedAssign.id}`,
      announcementId: ann.id,
      title: ann.title,
      courseId: ann.courseId,
      assignmentId: matchedAssign.id,
      assignmentName: matchedAssign.name,
      originalDueDate: matchedAssign.dueAt,
      detectedDueDate: detectedDate,
      verbatimSentence: matchedSentence,
      charStart,
      charEnd,
      confidence: 0.95,
      status: 'pending_confirmation' as const,
    };

    alerts.push(AnnouncementChangeAlertSchema.parse(rawAlert));
  }

  return alerts;
}
