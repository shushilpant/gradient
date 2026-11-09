"""
OffCanvas Backend: Syllabus AI-Policy Extractor

Pure stateless extraction of AI academic integrity policies from syllabus text.
Guarantees verbatim evidence extraction with exact character offsets:
assert raw_text[charStart:charEnd] == sentence
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class CourseInfoModel(BaseModel):
    title: Optional[str] = None
    code: Optional[str] = None
    instructor: Optional[str] = None


class EvidenceModel(BaseModel):
    sentence: str
    charStart: int
    charEnd: int


class ByAssessmentTypeModel(BaseModel):
    homework: str = "unspecified"
    essay: str = "unspecified"
    project: str = "unspecified"
    quizExam: str = "unspecified"


class AIPolicyModel(BaseModel):
    overall: str  # 'prohibited' | 'permittedWithDisclosure' | 'permittedForNamedUses' | 'unspecified'
    byAssessmentType: ByAssessmentTypeModel
    disclosureRequired: bool
    permittedUses: List[str]
    evidence: List[EvidenceModel]


class ExtractPolicyRequest(BaseModel):
    syllabus_text: Optional[str] = Field(None, alias="syllabusText", description="Raw syllabus text")
    text: Optional[str] = Field(None, description="Alternative text parameter")

    def get_text(self) -> str:
        return self.syllabus_text or self.text or ""


class ExtractPolicyResponse(BaseModel):
    courseInfo: CourseInfoModel
    gradingNotes: Optional[str] = None
    aiPolicy: AIPolicyModel
    confidence: float


# Regex patterns for sentence tokenization preserving spans
SENTENCE_SPLIT_REGEX = re.compile(r'([A-Z0-9][^\.\n]*?(?:[\.\?!]+(?=\s+|$|\n)|\n+))', re.MULTILINE)

# AI Keywords
AI_KEYWORD_REGEX = re.compile(
    r'\b(ai|chatgpt|gpt-?4|gpt-?3|llm|llms|large language models?|generative ai|copilot|claude|gemini|artificial intelligence)\b',
    re.IGNORECASE,
)

# Prohibited signals
PROHIBITED_REGEX = re.compile(
    r'\b(strictly prohibited|is prohibited|are prohibited|forbidden|not allowed|not permitted|unauthorized|'
    r'zero tolerance|plagiarism|academic dishonesty|do not use|cannot be used|no ai tools?|prohibits the use|'
    r'may not be used|refrain from using|entirely your own work without)\b',
    re.IGNORECASE,
)

# Permitted with disclosure signals
DISCLOSURE_REGEX = re.compile(
    r'\b(permitted with disclosure|permitted with citation|must disclose|disclosure is required|'
    r'cite all ai|cite any use|properly cite|acknowledge any use|explicit disclosure|'
    r'must be cited|allowed with attribution|document your use|declaration of ai use)\b',
    re.IGNORECASE,
)

# Permitted for named uses signals
NAMED_USES_REGEX = re.compile(
    r'\b(permitted for|allowed only for|authorized only for|may use ai for|'
    r'brainstorming|grammar checking|spell check|syntax correction|debugging assistance|'
    r'outlining and ideation|formatting assistance)\b',
    re.IGNORECASE,
)

# Ambiguous / Tricky phrasing signals
AMBIGUOUS_REGEX = re.compile(
    r'\b(discouraged|check with me|consult with the instructor|ask permission|'
    r'grey area|use your best judgment|proceed with caution|case-by-case basis|'
    r'seek prior approval)\b',
    re.IGNORECASE,
)


def extract_sentences_with_spans(text: str) -> List[Tuple[str, int, int]]:
    """
    Extracts sentences with exact verbatim character spans (charStart, charEnd)
    such that text[charStart:charEnd] == sentence is strictly true.
    """
    results: List[Tuple[str, int, int]] = []
    
    # Split text by line or paragraph breaks and sentences
    raw_lines = text.splitlines(keepends=True)
    current_offset = 0

    for line in raw_lines:
        line_len = len(line)
        stripped = line.strip()
        if stripped:
            # Look for sentence boundaries within the line
            # or treat discrete statement lines as individual units
            sub_start = 0
            while sub_start < len(line):
                # skip leading spaces
                while sub_start < len(line) and line[sub_start] in ' \t\r\n':
                    sub_start += 1
                if sub_start >= len(line):
                    break

                # find next sentence terminator (. ! ? or end of line)
                end_match = re.search(r'[\.\?!]+(?=\s+|$)', line[sub_start:])
                if end_match:
                    sub_end = sub_start + end_match.end()
                else:
                    sub_end = len(line.rstrip('\r\n'))

                sentence = line[sub_start:sub_end].strip()
                if sentence:
                    # Find exact charStart in line
                    exact_start = line.find(sentence, sub_start)
                    exact_end = exact_start + len(sentence)
                    abs_start = current_offset + exact_start
                    abs_end = current_offset + exact_end

                    # Invariant verification
                    assert text[abs_start:abs_end] == sentence, (
                        f"Span mismatch: text[{abs_start}:{abs_end}]='{text[abs_start:abs_end]}' != '{sentence}'"
                    )
                    results.append((sentence, abs_start, abs_end))

                sub_start = sub_end + 1

        current_offset += line_len

    return results


def extract_course_info(text: str) -> CourseInfoModel:
    """Extracts course title, code, and instructor from syllabus text."""
    code = None
    title = None
    instructor = None

    # Course code and title pattern (e.g., CS 101: Introduction to Computer Science)
    code_match = re.search(
        r'\b([A-Z]{2,4}\s*[0-9]{3}[A-Z]?)(?:\s*[:\-–]\s*([^\n\r,;]+))?',
        text,
    )
    if code_match:
        code = code_match.group(1).strip()
        if code_match.group(2):
            title = code_match.group(2).strip()

    # Instructor pattern
    inst_match = re.search(
        r'(?:Instructor|Professor|Teacher|Faculty):\s*([^\n\r,;]+)',
        text,
        re.IGNORECASE,
    )
    if inst_match:
        instructor = inst_match.group(1).strip()
    elif not instructor:
        prof_match = re.search(r'\b(Prof\.|Professor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', text)
        if prof_match:
            instructor = prof_match.group(0).strip()

    return CourseInfoModel(title=title, code=code, instructor=instructor)


def extract_grading_notes(text: str) -> Optional[str]:
    """Finds grading notes such as drop rules, weightings, or late penalties."""
    notes = []
    for line in text.splitlines():
        line_s = line.strip()
        if any(k in line_s.lower() for k in ["drop", "lowest", "late penalty", "weight", "grading scale"]):
            notes.append(line_s)
    return " | ".join(notes[:3]) if notes else None


def extract_policy(text: str) -> ExtractPolicyResponse:
    """
    Stateless, schema-constrained policy extraction from syllabus text.
    Classifies overall tier, assessment-type overrides, permitted uses,
    and returns exact verbatim character-bounded evidence.
    """
    course_info = extract_course_info(text)
    grading_notes = extract_grading_notes(text)

    sentences_with_spans = extract_sentences_with_spans(text)

    # Filter sentences discussing AI or academic integrity related to AI
    ai_evidence: List[EvidenceModel] = []
    
    prohibited_votes = 0
    disclosure_votes = 0
    named_uses_votes = 0
    ambiguous_votes = 0

    permitted_uses_set = set()

    # Per-assessment-type trackers
    assessment_policies = {
        "homework": "unspecified",
        "essay": "unspecified",
        "project": "unspecified",
        "quizExam": "unspecified",
    }

    for sentence, start, end in sentences_with_spans:
        has_ai_mention = bool(AI_KEYWORD_REGEX.search(sentence))
        
        # Also catch broader academic integrity clauses that implicitly or explicitly cover AI
        is_integrity = any(w in sentence.lower() for w in ["academic integrity", "academic dishonesty", "cheating", "plagiarism"])

        if has_ai_mention or (is_integrity and len(ai_evidence) == 0):
            # Check for ambiguous / tricky phrasing first
            is_ambiguous = bool(AMBIGUOUS_REGEX.search(sentence))
            is_prohibited = bool(PROHIBITED_REGEX.search(sentence))
            is_disclosure = bool(DISCLOSURE_REGEX.search(sentence))
            is_named = bool(NAMED_USES_REGEX.search(sentence))

            if has_ai_mention or is_prohibited or is_ambiguous:
                ai_evidence.append(EvidenceModel(sentence=sentence, charStart=start, charEnd=end))

            if is_ambiguous and not is_prohibited and not is_disclosure:
                ambiguous_votes += 2
            elif is_prohibited:
                prohibited_votes += 3
            elif is_disclosure:
                disclosure_votes += 2
            elif is_named:
                named_uses_votes += 2

            # Extract specific permitted uses
            s_lower = sentence.lower()
            if "brainstorm" in s_lower:
                permitted_uses_set.add("brainstorming")
            if "grammar" in s_lower or "spell" in s_lower:
                permitted_uses_set.add("grammar/spellcheck")
            if "outline" in s_lower or "ideation" in s_lower:
                permitted_uses_set.add("outlining")
            if "debug" in s_lower:
                permitted_uses_set.add("debugging")
            if "syntax" in s_lower:
                permitted_uses_set.add("syntax assistance")

            # Check assessment-type targeting
            target_types = []
            if any(w in s_lower for w in ["homework", "problem set", "assignment"]):
                target_types.append("homework")
            if any(w in s_lower for w in ["essay", "writing", "paper", "draft"]):
                target_types.append("essay")
            if any(w in s_lower for w in ["project", "coding", "software", "repo"]):
                target_types.append("project")
            if any(w in s_lower for w in ["exam", "quiz", "midterm", "final"]):
                target_types.append("quizExam")

            for t in target_types:
                if is_prohibited:
                    assessment_policies[t] = "prohibited"
                elif is_named:
                    assessment_policies[t] = "permittedForNamedUses"
                elif is_disclosure:
                    assessment_policies[t] = "permittedWithDisclosure"

    # Determine overall tier and confidence
    blanket_prohibited = bool(
        re.search(
            r'\b(strictly prohibited|zero tolerance|prohibits the use of|under any circumstances|is not permitted in this course|prohibited on all|banned across all)\b',
            text,
            re.IGNORECASE,
        )
    )

    is_mixed = any(p == "prohibited" for p in assessment_policies.values()) and any(
        p in ["permittedWithDisclosure", "permittedForNamedUses"] for p in assessment_policies.values()
    )

    if not ai_evidence:
        # Silent syllabus (no AI mention)
        overall_tier = "unspecified"
        confidence = 0.0
        disclosure_required = False
    elif is_mixed:
        # Mixed policy with explicit assessment-level prohibitions: most restrictive rule governs overall
        overall_tier = "prohibited"
        confidence = 0.95
        disclosure_required = False
    elif blanket_prohibited or (prohibited_votes > 0 and named_uses_votes == 0 and disclosure_votes == 0):
        overall_tier = "prohibited"
        confidence = 0.95
        disclosure_required = False
    elif named_uses_votes > 0 and not blanket_prohibited:
        overall_tier = "permittedForNamedUses"
        confidence = 0.90
        disclosure_required = bool(disclosure_votes > 0 or "disclose" in text.lower() or "cite" in text.lower())
    elif disclosure_votes > 0 and not blanket_prohibited:
        overall_tier = "permittedWithDisclosure"
        confidence = 0.92
        disclosure_required = True
    elif prohibited_votes > 0:
        overall_tier = "prohibited"
        confidence = 0.95
        disclosure_required = False
    elif ambiguous_votes > 0:
        overall_tier = "unspecified"
        confidence = 0.45  # Low confidence triggers cautious default
        disclosure_required = False
    else:
        overall_tier = "unspecified"
        confidence = 0.50
        disclosure_required = False

    # Propagate overall policy to unmentioned assessment types
    for k in assessment_policies:
        if assessment_policies[k] == "unspecified":
            assessment_policies[k] = overall_tier

    # Quizzes and exams are strictly prohibited if overall is prohibited or unspecified
    if overall_tier in ["prohibited", "unspecified"]:
        assessment_policies["quizExam"] = "prohibited"

    # Deduplicate and sort permitted uses
    permitted_uses_list = sorted(list(permitted_uses_set))

    return ExtractPolicyResponse(
        courseInfo=course_info,
        gradingNotes=grading_notes,
        aiPolicy=AIPolicyModel(
            overall=overall_tier,
            byAssessmentType=ByAssessmentTypeModel(**assessment_policies),
            disclosureRequired=disclosure_required,
            permittedUses=permitted_uses_list,
            evidence=ai_evidence,
        ),
        confidence=confidence,
    )
