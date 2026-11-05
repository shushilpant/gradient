"""
GRADIENT Backend: Local FastAPI Service

HARD RULE 6 (NON-NEGOTIABLE):
Coursework is minimized and sent only to installed loopback Ollama models.
Assistant jobs keep results in bounded, expiring process memory, never a database.
Optional public research sends disclosed search terms to external providers.
"""

from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sympy as sp

try:
    from computer_agent import router as computer_agent_router
except ImportError:
    from backend.computer_agent import router as computer_agent_router

try:
    from local_assistant import router as local_assistant_router
except ImportError:
    from backend.local_assistant import router as local_assistant_router

try:
    from policy_extractor import (
        ExtractPolicyRequest,
        ExtractPolicyResponse,
        extract_policy,
    )
    from rubric_feedback import (
        CritiqueDraftRequest,
        CritiqueDraftResponse,
        generate_draft_critique,
    )
    from retrieval_service import (
        RetrievalQueryRequest,
        query_course_materials,
    )
    from leak_guard import (
        HintLadderResponse,
        generate_hint_ladder,
        check_answer_leak,
    )
    from scheduler_service import (
        BusyBlockData,
        SchedulerPreferencesData,
        AssignmentStudyRequirementData,
        StudyBlockData,
        SchedulePlanResponse,
        schedule_study_blocks,
        replan_study_schedule,
        export_schedule_to_ics,
        parse_ics_to_busy_blocks,
    )
    from change_radar import (
        KnownAssignmentInfo,
        AnnouncementItem,
        DetectedDateChange,
        scan_announcements_for_changes,
    )
except ImportError:
    from backend.policy_extractor import (
        ExtractPolicyRequest,
        ExtractPolicyResponse,
        extract_policy,
    )
    from backend.rubric_feedback import (
        CritiqueDraftRequest,
        CritiqueDraftResponse,
        generate_draft_critique,
    )
    from backend.retrieval_service import (
        RetrievalQueryRequest,
        query_course_materials,
    )
    from backend.leak_guard import (
        HintLadderResponse,
        generate_hint_ladder,
        check_answer_leak,
    )
    from backend.scheduler_service import (
        BusyBlockData,
        SchedulerPreferencesData,
        AssignmentStudyRequirementData,
        StudyBlockData,
        SchedulePlanResponse,
        schedule_study_blocks,
        replan_study_schedule,
        export_schedule_to_ics,
        parse_ics_to_busy_blocks,
    )
    from backend.change_radar import (
        KnownAssignmentInfo,
        AnnouncementItem,
        DetectedDateChange,
        scan_announcements_for_changes,
    )

app = FastAPI(
    title="GRADIENT Stateless Backend",
    version="0.1.0",
    description="Stateless optimization and verification service for GRADIENT Canvas LMS companion",
)

# CORS configuration for browser extension content scripts and panel
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(?:chrome-extension://[a-p]{32}|https://(?:[a-zA-Z0-9-]+\.)?instructure\.com|https://canvas\.usm\.edu|https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?)$",
    allow_credentials=False,  # Stateless: no cookies or server sessions
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(local_assistant_router)
app.include_router(computer_agent_router)
try:
    from sandbox_mirror import router as sandbox_mirror_router
except ImportError:
    from backend.sandbox_mirror import router as sandbox_mirror_router
app.include_router(sandbox_mirror_router)


class HealthResponse(BaseModel):
    status: str
    service: str
    stateless: bool = True
    storage_enabled: bool = False


class SymPyVerifyRequest(BaseModel):
    expression: str = Field(..., description="Mathematical or algebraic formula to verify")
    expected_equivalent: Optional[str] = Field(None, description="Optional target equivalence formula")


class SymPyVerifyResponse(BaseModel):
    valid: bool
    simplified: str
    is_equivalent: Optional[bool] = None
    latex: str


class PayloadInspectionResponse(BaseModel):
    received_bytes: int
    fields_received: List[str]
    retention_policy: str = "zero-storage-ephemeral"
    what_is_sent_summary: Dict[str, Any]


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Stateless health probe."""
    return HealthResponse(
        status="ok",
        service="gradient-backend",
        stateless=True,
        storage_enabled=False,
    )


@app.post("/api/v1/inspect-payload", response_model=PayloadInspectionResponse)
async def inspect_payload(request: Request) -> PayloadInspectionResponse:
    """
    Transparent inspect-payload endpoint supporting UI 'what is sent' view.
    Reflects the exact payload received and explicitly certifies zero server retention.
    """
    body = await request.body()
    try:
        data = await request.json()
    except Exception:
        data = {}

    fields = list(data.keys()) if isinstance(data, dict) else ["<non-dict-body>"]

    return PayloadInspectionResponse(
        received_bytes=len(body),
        fields_received=fields,
        retention_policy="zero-storage-ephemeral",
        what_is_sent_summary={
            "field_count": len(fields),
            "payload_size_bytes": len(body),
            "stored_in_database": False,
            "logged_to_disk": False,
        },
    )


@app.post("/api/v1/verify-algebra", response_model=SymPyVerifyResponse)
def verify_algebra(payload: SymPyVerifyRequest) -> SymPyVerifyResponse:
    """
    SymPy algebraic verification for grade formulas, weighting sums, or student proofs.
    """
    try:
        expr = sp.sympify(payload.expression, evaluate=True)
        simplified = sp.simplify(expr)
        latex_str = sp.latex(simplified)

        is_equiv: Optional[bool] = None
        if payload.expected_equivalent:
            target = sp.sympify(payload.expected_equivalent, evaluate=True)
            diff = sp.simplify(expr - target)
            is_equiv = bool(diff == 0)

        return SymPyVerifyResponse(
            valid=True,
            simplified=str(simplified),
            is_equivalent=is_equiv,
            latex=latex_str,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SymPy parse error: {str(e)}")


@app.post("/extract-policy", response_model=ExtractPolicyResponse)
@app.post("/api/v1/extract-policy", response_model=ExtractPolicyResponse)
def extract_ai_policy(payload: ExtractPolicyRequest) -> ExtractPolicyResponse:
    """
    Stateless extraction of course AI policy from syllabus text.
    Returns schema-constrained policy classification and verbatim evidence spans.
    """
    text = payload.get_text()
    if not text.strip():
        raise HTTPException(status_code=400, detail="Syllabus text cannot be empty.")
    return extract_policy(text)


@app.post("/critique-draft", response_model=CritiqueDraftResponse)
@app.post("/api/v1/critique-draft", response_model=CritiqueDraftResponse)
def critique_draft(payload: CritiqueDraftRequest) -> CritiqueDraftResponse:
    """
    Stateless pre-submit rubric-aware feedback on student drafts.
    Returns readiness level, verbatim evidence quotes, and diagnostic guidance.
    Enforces no rewrites, weakest first ordering, and zero predicted numeric grades.
    """
    if not payload.draft.strip():
        raise HTTPException(status_code=400, detail="Draft text cannot be empty.")
    return generate_draft_critique(payload.draft, payload.rubric)


@app.post("/retrieve-course-content")
@app.post("/api/v1/retrieval/query")
def retrieve_course_content(payload: RetrievalQueryRequest) -> Dict[str, Any]:
    """
    Retrieval over student's own course content and allowlisted open corpus.
    Ranks course materials first, formats citations with Canvas links, and validates Mermaid diagrams.
    Returns clear fallback notice if no relevant material exists.
    """
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    return query_course_materials(payload)


class HintLadderRequest(BaseModel):
    problem_text: str = Field(..., min_length=5)
    assignment_id: str = "assign_1"
    course_id: str = "course_1"
    student_attempt: Optional[str] = None
    domain: str = "math_symbolic"
    target_rung: str = "R0"
    is_adversarial: bool = False


@app.post("/hint-ladder")
@app.post("/api/v1/hint-ladder/generate", response_model=HintLadderResponse)
def get_hint_ladder(payload: HintLadderRequest) -> HintLadderResponse:
    """
    Structured 5-rung hint ladder with friction gates (R3/R4 require attempt text)
    and SymPy / sandbox answer-leak guard verification.
    """
    return generate_hint_ladder(
        problem_text=payload.problem_text,
        assignment_id=payload.assignment_id,
        course_id=payload.course_id,
        student_attempt=payload.student_attempt,
        domain=payload.domain,
        target_rung=payload.target_rung,
        is_adversarial=payload.is_adversarial,
    )


# ---------------------------------------------------------------------------
# Stage 10: Scheduling and Change Radar Endpoints
# ---------------------------------------------------------------------------

class GenerateScheduleRequest(BaseModel):
    requirements: List[AssignmentStudyRequirementData]
    busy_blocks: List[BusyBlockData] = []
    horizon_start: str
    horizon_days: int = 14
    preferences: Optional[SchedulerPreferencesData] = None
    force_solver: Optional[str] = None


@app.post("/api/v1/schedule/generate", response_model=SchedulePlanResponse)
def generate_schedule(payload: GenerateScheduleRequest) -> SchedulePlanResponse:
    """
    Generates academic study schedule placing study blocks in 30-min slots
    using OR-Tools CP-SAT with a greedy fallback.
    """
    return schedule_study_blocks(
        requirements=payload.requirements,
        busy_blocks=payload.busy_blocks,
        horizon_start_str=payload.horizon_start,
        horizon_days=payload.horizon_days,
        preferences=payload.preferences,
        force_solver=payload.force_solver,
    )


class ReplanScheduleRequest(BaseModel):
    current_plan: SchedulePlanResponse
    missed_block_ids: List[str]
    new_busy_blocks: List[BusyBlockData] = []
    replan_time: str
    requirements: List[AssignmentStudyRequirementData]
    preferences: Optional[SchedulerPreferencesData] = None


@app.post("/api/v1/schedule/replan", response_model=SchedulePlanResponse)
def replan_schedule(payload: ReplanScheduleRequest) -> SchedulePlanResponse:
    """
    Performs rolling replan when study blocks are missed or logged late,
    retaining completed blocks and preserving stable UIDs across runs.
    """
    return replan_study_schedule(
        current_plan=payload.current_plan,
        missed_block_ids=payload.missed_block_ids,
        new_busy_blocks=payload.new_busy_blocks,
        replan_time_str=payload.replan_time,
        requirements=payload.requirements,
        preferences=payload.preferences,
    )


class ExportIcsRequest(BaseModel):
    blocks: List[StudyBlockData]
    calendar_name: str = "GRADIENT Study Schedule"


@app.post("/api/v1/schedule/export-ics")
def export_ics(payload: ExportIcsRequest) -> Dict[str, Any]:
    """
    Exports study blocks to RFC 5545 iCalendar (.ics) format with stable UIDs.
    """
    ics_str = export_schedule_to_ics(payload.blocks, payload.calendar_name)
    return {
        "ics_content": ics_str,
        "content_type": "text/calendar",
        "block_count": len(payload.blocks),
    }


class ParseIcsRequest(BaseModel):
    ics_content: str


@app.post("/api/v1/schedule/parse-ics")
def parse_ics(payload: ParseIcsRequest) -> Dict[str, Any]:
    """
    Parses pasted or uploaded iCal/ICS feeds into busy blocks for scheduling.
    """
    busy_blocks = parse_ics_to_busy_blocks(payload.ics_content)
    return {
        "busy_blocks": busy_blocks,
        "count": len(busy_blocks),
    }


class ScanAnnouncementsRequest(BaseModel):
    announcements: List[AnnouncementItem]
    known_assignments: List[KnownAssignmentInfo]


@app.post("/api/v1/change-radar/scan")
def scan_announcements(payload: ScanAnnouncementsRequest) -> Dict[str, Any]:
    """
    Scans course announcements for date modifications, extracting verbatim quotes
    and requiring human confirmation before updating due dates.
    """
    changes = scan_announcements_for_changes(payload.announcements, payload.known_assignments)
    return {
        "detected_changes": changes,
        "count": len(changes),
    }





try:
    from assignment_pdf import router as assignment_pdf_router
except ImportError:
    from backend.assignment_pdf import router as assignment_pdf_router
app.include_router(assignment_pdf_router)

try:
    from packet_share import router as packet_share_router
except ImportError:
    from backend.packet_share import router as packet_share_router
app.include_router(packet_share_router)
