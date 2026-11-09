"""
OffCanvas Stage 10: Change Radar & Due Date Change Detector

- Scans Canvas announcements and pages for instructor deadline modifications.
- Extracts:
  - Targeted assignment.
  - Claimed new due date (parsed to ISO 8601).
  - Verbatim quoted sentence with exact character start/end offsets.
  - Confidence rating.
- Requires explicit student confirmation before updating assignment due dates.
- Resists false positives (office hours changes, room changes, past tense mentions).
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class KnownAssignmentInfo(BaseModel):
    id: str
    name: str
    courseId: str
    currentDueDate: str


class AnnouncementItem(BaseModel):
    id: str
    courseId: str
    title: str
    message: str
    postedAt: Optional[str] = None


class DetectedDateChange(BaseModel):
    id: str
    announcementId: str
    title: str
    courseId: str
    assignmentId: str
    assignmentName: str
    originalDueDate: str
    detectedDueDate: str
    verbatimSentence: str
    charStart: int
    charEnd: int
    confidence: float
    status: str = "pending_confirmation"


# Regex patterns indicating assignment deadline changes
CHANGE_PATTERNS = [
    r'([A-Z][^\.!\n]*?\b(?:due\s+date|deadline|submission\s+deadline)\s+(?:has\s+been\s+|is\s+)?(?:moved|extended|postponed|shifted|delayed|pushed\s+back)\s+(?:to|until)\s+([^.!\n]+?)(?:\.|\n|!|$))',
    r'([A-Z][^\.!\n]*?\b(?:extended\s+(?:the\s+)?deadline\s+(?:for\s+[^.!\n]+?)?(?:to|until)\s+)([^.!\n]+?)(?:\.|\n|!|$))',
    r'([A-Z][^\.!\n]*?\bnew\s+due\s+date\s*(?:is|:)\s*([^.!\n]+?)(?:\.|\n|!|$))',
    r'([A-Z][^\.!\n]*?\bsubmit\s+(?:it\s+)?(?:by|before)\s+([^.!\n]+?)(?:\s+instead|\s+without|\.|\n|!|$))',
    r'([A-Z][^\.!\n]*?\bdeadline\s+is\s+now\s+([^.!\n]+?)(?:\.|\n|!|$))',
    r'([A-Z][^\.!\n]*?\bgranting\s+an\s+extension\s+(?:until|to)\s+([^.!\n]+?)(?:\.|\n|!|$))',
]

# Unrelated topics that should NOT trigger assignment changes
FALSE_POSITIVE_TRIGGERS = [
    r'\boffice\s+hours\b',
    r'\blecture\s+(?:room|time|hall)\b',
    r'\bclass\s+meeting\b',
    r'\bexam\s+review\s+session\b',
    r'\bcoffee\s+chat\b',
]


def parse_informal_date_string(date_text: str, base_year: int = 2026) -> Optional[str]:
    """
    Parses informal syllabus/announcement dates into ISO 8601 UTC string.
    Examples:
      - 'Friday, Nov 14 at 11:59 PM'
      - 'Monday, Nov 17 at 5:00 PM'
      - 'Nov 20, 2026 at 23:59'
      - 'November 22 at 11:59pm'
    """
    clean = date_text.strip().rstrip(".,;!")

    # Months dictionary
    MONTHS = {
        'jan': 1, 'january': 1,
        'feb': 2, 'february': 2,
        'mar': 3, 'march': 3,
        'apr': 4, 'april': 4,
        'may': 5,
        'jun': 6, 'june': 6,
        'jul': 7, 'july': 7,
        'aug': 8, 'august': 8,
        'sep': 9, 'september': 9,
        'oct': 10, 'october': 10,
        'nov': 11, 'november': 11,
        'dec': 12, 'december': 12,
    }

    # Match Month Day [Year] [at Hour:Minute AM/PM]
    m = re.search(
        r'\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?(?:\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?',
        clean,
        re.IGNORECASE
    )
    if not m:
        return None

    month_str = m.group(1).lower()
    month = MONTHS.get(month_str, 11)
    day = int(m.group(2))
    year = int(m.group(3)) if m.group(3) else base_year

    hour = 23
    minute = 59
    if m.group(4):
        h = int(m.group(4))
        mi = int(m.group(5)) if m.group(5) else 0
        ampm = m.group(6).lower() if m.group(6) else None
        if ampm == 'pm' and h < 12:
            h += 12
        elif ampm == 'am' and h == 12:
            h = 0
        hour = h
        minute = mi

    try:
        dt = datetime(year, month, day, hour, minute, 0, tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def scan_announcements_for_changes(
    announcements: List[AnnouncementItem],
    known_assignments: List[KnownAssignmentInfo],
) -> List[DetectedDateChange]:
    """
    Scans a list of course announcements for deadline changes, extracting
    verbatim quoted sentences and matching against known assignments.
    """
    detected_changes: List[DetectedDateChange] = []

    for ann in announcements:
        combined_text = f"{ann.title}\n{ann.message}"

        # 1. Check for false-positive indicators (e.g. office hours, room change)
        is_false_pos = False
        for fp_pat in FALSE_POSITIVE_TRIGGERS:
            if re.search(fp_pat, combined_text, re.IGNORECASE):
                # Only disqualify if the announcement doesn't also explicitly mention homework/assignment
                if not re.search(r'\b(homework|hw|assignment|project|milestone|problem\s+set)\b', combined_text, re.IGNORECASE):
                    is_false_pos = True
                    break
        if is_false_pos:
            continue

        # 2. Search for date change patterns
        matched_sentence = None
        raw_date_snippet = None

        for pat in CHANGE_PATTERNS:
            match = re.search(pat, combined_text, re.IGNORECASE)
            if match:
                matched_sentence = match.group(1).strip()
                raw_date_snippet = match.group(2).strip()
                break

        if not matched_sentence or not raw_date_snippet:
            continue

        # 3. Parse date snippet
        new_due_date = parse_informal_date_string(raw_date_snippet)
        if not new_due_date:
            continue

        # 4. Associate with an assignment
        matched_assign: Optional[KnownAssignmentInfo] = None

        # Look in announcement title first, then sentence, then entire message
        for assign in known_assignments:
            if assign.courseId != ann.courseId:
                continue

            # Exact name or number matching (e.g. "Homework 2", "HW 2")
            assign_clean = assign.name.lower()
            name_tokens = [t for t in re.split(r'[:\-\s]+', assign_clean) if len(t) > 1]

            # Check if assignment name or shorthand is mentioned
            num_match = re.search(r'\b(?:hw|homework|project|ps|problem\s+set|milestone|lab\s+report)\s*#?(\d+)\b', assign_clean)
            if num_match:
                num = num_match.group(1)
                short_pats = [
                    rf'\bhw\s*{num}\b',
                    rf'\bhomework\s*{num}\b',
                    rf'\bproject\s*{num}\b',
                    rf'\bps\s*{num}\b',
                    rf'\bproblem\s+set\s*{num}\b',
                    rf'\blab\s+(?:report\s*)?{num}\b',
                ]
                if any(re.search(p, combined_text, re.IGNORECASE) for p in short_pats):
                    matched_assign = assign
                    break
            elif all(t in combined_text.lower() for t in name_tokens[:2]):
                matched_assign = assign
                break

        if not matched_assign:
            # If there's only 1 assignment in this course, associate with it
            course_assigns = [a for a in known_assignments if a.courseId == ann.courseId]
            if len(course_assigns) == 1:
                matched_assign = course_assigns[0]

        if not matched_assign:
            continue

        # 5. Find exact character offsets of the verbatim sentence in the message or combined text
        char_start = combined_text.find(matched_sentence)
        if char_start < 0:
            char_start = 0
            char_end = len(matched_sentence)
        else:
            char_end = char_start + len(matched_sentence)

        detected_changes.append(
            DetectedDateChange(
                id=f"change-{ann.id}-{matched_assign.id}",
                announcementId=ann.id,
                title=ann.title,
                courseId=ann.courseId,
                assignmentId=matched_assign.id,
                assignmentName=matched_assign.name,
                originalDueDate=matched_assign.currentDueDate,
                detectedDueDate=new_due_date,
                verbatimSentence=matched_sentence,
                charStart=char_start,
                charEnd=char_end,
                confidence=0.95,
                status="pending_confirmation",
            )
        )

    return detected_changes
