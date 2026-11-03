"""
GRADIENT Stage 10: Academic Study Scheduler & OR-Tools CP-SAT Constraint Engine

- Discretizes planning horizon into 30-minute slots.
- OR-Tools CP-SAT formulation:
  - Hard: No overlaps with busy blocks.
  - Hard: No overlaps with sleep window.
  - Hard: At most one assignment per slot.
  - Hard: Slots must end before (deadline - buffer).
  - Hard: Daily study hours <= dailyCapHours.
  - Hard: Contiguous study runs <= maxBlockLengthHours.
  - Objective: Minimize lateness risk, reward preferred hours, smooth daily load.
- Fallback: Deterministic EDF (Earliest Deadline First) greedy scheduler.
- Rolling Replan: Preserves completed blocks, reschedules missed blocks with stable UIDs.
- Crunch Radar: Calculates weekly workload vs capacity, identifying crunch risk.
- RFC 5545 iCalendar (ICS) generation with stable UIDs and parser for busy blocks.
"""

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

try:
    from ortools.sat.python import cp_model
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class BusyBlockData(BaseModel):
    id: str
    title: str
    startTime: str  # ISO 8601
    endTime: str    # ISO 8601
    source: str = "manual"


class HourRangeData(BaseModel):
    startHour: float
    endHour: float


class SchedulerPreferencesData(BaseModel):
    sleepWindow: HourRangeData = HourRangeData(startHour=23.0, endHour=7.0)
    maxBlockLengthHours: float = 2.0
    preferredHours: List[HourRangeData] = [
        HourRangeData(startHour=9.0, endHour=12.0),
        HourRangeData(startHour=14.0, endHour=18.0),
    ]
    dailyCapHours: float = 6.0
    finishBeforeDeadlineBufferHours: float = 2.0


class AssignmentStudyRequirementData(BaseModel):
    assignmentId: str
    courseId: str
    assignmentName: str
    courseCode: str
    dueAt: str
    hoursNeeded: float
    priorityWeight: float = 1.0


class StudyBlockData(BaseModel):
    id: str
    assignmentId: str
    courseId: str
    assignmentName: str
    courseCode: str
    startTime: str
    endTime: str
    durationMinutes: int
    blockIndex: int
    totalBlocks: int
    status: str = "scheduled"  # scheduled | completed | missed
    sequence: int = 0


class CrunchWeekData(BaseModel):
    weekNumber: int
    startDate: str
    endDate: str
    scheduledStudyHours: float
    capacityHours: float
    assignmentsDueCount: int
    crunchRatio: float
    crunchLevel: str  # balanced | moderate | high


class CrunchRadarReportData(BaseModel):
    weeks: List[CrunchWeekData]
    totalHoursScheduled: float
    highestCrunchWeek: Optional[int] = None
    recommendations: List[str]


class SchedulePlanResponse(BaseModel):
    blocks: List[StudyBlockData]
    solverUsed: str  # "ortools_cpsat" | "greedy_fallback"
    isFeasible: bool
    scheduledHours: float
    requestedHours: float
    crunchRadar: CrunchRadarReportData
    unplacedRequirements: Optional[List[AssignmentStudyRequirementData]] = None


# ---------------------------------------------------------------------------
# Slot Helpers
# ---------------------------------------------------------------------------

def parse_iso_datetime(iso_str: str) -> datetime:
    """Parses ISO string into timezone-aware UTC datetime."""
    clean = iso_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def format_iso_datetime(dt: datetime) -> str:
    """Formats datetime into ISO 8601 UTC string."""
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def is_sleep_time(dt: datetime, sleep_window: HourRangeData) -> bool:
    hour = dt.hour + dt.minute / 60.0
    if sleep_window.startHour > sleep_window.endHour:
        return hour >= sleep_window.startHour or hour < sleep_window.endHour
    else:
        return sleep_window.startHour <= hour < sleep_window.endHour


def is_busy_time(start_dt: datetime, end_dt: datetime, busy_blocks: List[BusyBlockData]) -> bool:
    for b in busy_blocks:
        b_start = parse_iso_datetime(b.startTime)
        b_end = parse_iso_datetime(b.endTime)
        if start_dt < b_end and end_dt > b_start:
            return True
    return False


def is_preferred_time(dt: datetime, preferred_ranges: List[HourRangeData]) -> bool:
    hour = dt.hour + dt.minute / 60.0
    for r in preferred_ranges:
        if r.startHour <= hour < r.endHour:
            return True
    return False


# ---------------------------------------------------------------------------
# Crunch Radar
# ---------------------------------------------------------------------------

def calculate_crunch_radar(
    blocks: List[StudyBlockData],
    busy_blocks: List[BusyBlockData],
    requirements: List[AssignmentStudyRequirementData],
    horizon_start: datetime,
    horizon_days: int = 14,
    sleep_hours_per_day: float = 8.0,
) -> CrunchRadarReportData:
    num_weeks = math.ceil(horizon_days / 7)
    weeks: List[CrunchWeekData] = []

    for w in range(num_weeks):
        w_start = horizon_start + timedelta(days=w * 7)
        w_end = w_start + timedelta(days=7)

        # Scheduled study hours in this week
        week_study_hours = sum(
            b.durationMinutes / 60.0
            for b in blocks
            if w_start <= parse_iso_datetime(b.startTime) < w_end
        )

        # Busy hours in this week
        week_busy_hours = 0.0
        for busy in busy_blocks:
            b_start = max(w_start, parse_iso_datetime(busy.startTime))
            b_end = min(w_end, parse_iso_datetime(busy.endTime))
            if b_end > b_start:
                week_busy_hours += (b_end - b_start).total_seconds() / 3600.0

        # Available capacity hours (awake & non-busy)
        total_week_hours = 7 * 24.0
        total_sleep_hours = 7 * sleep_hours_per_day
        capacity_hours = max(10.0, total_week_hours - total_sleep_hours - week_busy_hours)

        # Assignments due in this week
        assignments_due = sum(
            1 for req in requirements
            if w_start <= parse_iso_datetime(req.dueAt) < w_end
        )

        crunch_ratio = week_study_hours / capacity_hours if capacity_hours > 0 else 1.0
        crunch_level = "balanced"
        if crunch_ratio > 0.4 or week_study_hours >= 22.0 or assignments_due >= 3:
            crunch_level = "high"
        elif crunch_ratio >= 0.22 or week_study_hours >= 12.0:
            crunch_level = "moderate"

        weeks.append(
            CrunchWeekData(
                weekNumber=w + 1,
                startDate=format_iso_datetime(w_start),
                endDate=format_iso_datetime(w_end),
                scheduledStudyHours=round(week_study_hours, 1),
                capacityHours=round(capacity_hours, 1),
                assignmentsDueCount=assignments_due,
                crunchRatio=round(crunch_ratio, 2),
                crunchLevel=crunch_level,
            )
        )

    recommendations = []
    high_crunch = next((w for w in weeks if w.crunchLevel == "high"), None)
    if high_crunch:
        recommendations.append(
            f"Week {high_crunch.weekNumber} Crunch Alert: {high_crunch.scheduledStudyHours}h study load across "
            f"{high_crunch.assignmentsDueCount} deadlines. Consider shifting study blocks into preceding weeks."
        )
    else:
        recommendations.append("Study load is well balanced with healthy cognitive buffers.")

    total_hours = sum(b.durationMinutes / 60.0 for b in blocks)
    return CrunchRadarReportData(
        weeks=weeks,
        totalHoursScheduled=round(total_hours, 1),
        highestCrunchWeek=high_crunch.weekNumber if high_crunch else None,
        recommendations=recommendations,
    )


# ---------------------------------------------------------------------------
# Greedy Fallback Scheduler
# ---------------------------------------------------------------------------

def schedule_greedy(
    requirements: List[AssignmentStudyRequirementData],
    busy_blocks: List[BusyBlockData],
    horizon_start: datetime,
    horizon_days: int,
    prefs: SchedulerPreferencesData,
    existing_blocks: Optional[List[StudyBlockData]] = None,
) -> SchedulePlanResponse:
    existing_blocks = existing_blocks or []
    total_slots = horizon_days * 48

    # Build slot structures
    slot_starts = [horizon_start + timedelta(minutes=30 * i) for i in range(total_slots)]
    slot_ends = [slot_starts[i] + timedelta(minutes=30) for i in range(total_slots)]
    slot_days = [i // 48 for i in range(total_slots)]

    slot_is_sleep = [is_sleep_time(slot_starts[i], prefs.sleepWindow) for i in range(total_slots)]
    slot_is_busy = [is_busy_time(slot_starts[i], slot_ends[i], busy_blocks) for i in range(total_slots)]
    slot_is_preferred = [is_preferred_time(slot_starts[i], prefs.preferredHours) for i in range(total_slots)]

    slot_occupied: Dict[int, str] = {}
    daily_slots_used = [0] * horizon_days
    max_slots_per_day = int(prefs.dailyCapHours * 2)
    max_consecutive_slots = int(prefs.maxBlockLengthHours * 2)

    # Pre-mark completed blocks
    for eb in existing_blocks:
        if eb.status == "completed":
            eb_s = parse_iso_datetime(eb.startTime)
            eb_e = parse_iso_datetime(eb.endTime)
            for i in range(total_slots):
                if slot_starts[i] >= eb_s and slot_ends[i] <= eb_e:
                    slot_occupied[i] = eb.assignmentId
                    daily_slots_used[slot_days[i]] += 1

    # Sort assignments: EDF
    sorted_reqs = sorted(
        requirements,
        key=lambda r: (parse_iso_datetime(r.dueAt), -r.priorityWeight)
    )

    scheduled_slots_by_req: Dict[str, List[int]] = {}
    unplaced: List[AssignmentStudyRequirementData] = []

    for req in sorted_reqs:
        slots_needed = math.ceil(req.hoursNeeded * 2)
        deadline_limit = parse_iso_datetime(req.dueAt) - timedelta(hours=prefs.finishBeforeDeadlineBufferHours)
        assigned: List[int] = []

        # Find candidate slots
        candidates = []
        for i in range(total_slots):
            if i in slot_occupied or slot_is_sleep[i] or slot_is_busy[i]:
                continue
            if slot_ends[i] > deadline_limit:
                continue
            d = slot_days[i]
            if daily_slots_used[d] >= max_slots_per_day:
                continue
            candidates.append(i)

        # Score candidates to smooth daily load
        def score_slot(idx: int) -> float:
            d = slot_days[idx]
            usage = daily_slots_used[d]
            pref_bonus = 15.0 if slot_is_preferred[idx] else 0.0
            urgency_bonus = max(0.0, 10.0 - d * 0.5)
            load_penalty = usage * 5.0
            return pref_bonus + urgency_bonus - load_penalty

        candidates.sort(key=score_slot, reverse=True)

        for idx in candidates:
            if slots_needed <= 0:
                break
            d = slot_days[idx]
            if daily_slots_used[d] >= max_slots_per_day:
                continue

            # Check consecutive slots
            c_before = 0
            k = idx - 1
            while k in slot_occupied and slot_occupied[k] == req.assignmentId:
                c_before += 1
                k -= 1
            c_after = 0
            k = idx + 1
            while k in slot_occupied and slot_occupied[k] == req.assignmentId:
                c_after += 1
                k += 1

            if c_before + 1 + c_after > max_consecutive_slots:
                continue

            slot_occupied[idx] = req.assignmentId
            daily_slots_used[d] += 1
            assigned.append(idx)
            slots_needed -= 1

        if assigned:
            scheduled_slots_by_req[req.assignmentId] = sorted(assigned)
        if slots_needed > 0:
            unplaced.append(
                AssignmentStudyRequirementData(
                    assignmentId=req.assignmentId,
                    courseId=req.courseId,
                    assignmentName=req.assignmentName,
                    courseCode=req.courseCode,
                    dueAt=req.dueAt,
                    hoursNeeded=slots_needed * 0.5,
                    priorityWeight=req.priorityWeight,
                )
            )

    # Group into StudyBlocks
    all_blocks: List[StudyBlockData] = []
    for req in sorted_reqs:
        indices = scheduled_slots_by_req.get(req.assignmentId, [])
        if not indices:
            continue

        runs: List[Tuple[int, int]] = []
        cur_start: Optional[int] = None
        cur_end: Optional[int] = None

        for idx in indices:
            if cur_start is None:
                cur_start = idx
                cur_end = idx
            elif idx == cur_end + 1:
                cur_end = idx
            else:
                runs.append((cur_start, cur_end))
                cur_start = idx
                cur_end = idx
        if cur_start is not None and cur_end is not None:
            runs.append((cur_start, cur_end))

        for b_idx, (r_s, r_e) in enumerate(runs):
            s_time = slot_starts[r_s]
            e_time = slot_ends[r_e]
            dur = (r_e - r_s + 1) * 30
            stable_uid = f"gradient-{req.courseId}-{req.assignmentId}-b{b_idx}@gradient.app"

            prev = next((b for b in existing_blocks if b.id == stable_uid), None)
            seq = (prev.sequence + 1) if prev else 0

            all_blocks.append(
                StudyBlockData(
                    id=stable_uid,
                    assignmentId=req.assignmentId,
                    courseId=req.courseId,
                    assignmentName=req.assignmentName,
                    courseCode=req.courseCode,
                    startTime=format_iso_datetime(s_time),
                    endTime=format_iso_datetime(e_time),
                    durationMinutes=dur,
                    blockIndex=b_idx,
                    totalBlocks=len(runs),
                    status="scheduled",
                    sequence=seq,
                )
            )

    all_blocks.sort(key=lambda b: parse_iso_datetime(b.startTime))
    req_hours = sum(r.hoursNeeded for r in requirements)
    sched_hours = sum(b.durationMinutes / 60.0 for b in all_blocks)

    radar = calculate_crunch_radar(
        all_blocks, busy_blocks, requirements, horizon_start, horizon_days
    )

    return SchedulePlanResponse(
        blocks=all_blocks,
        solverUsed="greedy_fallback",
        isFeasible=len(unplaced) == 0,
        scheduledHours=round(sched_hours, 1),
        requestedHours=round(req_hours, 1),
        crunchRadar=radar,
        unplacedRequirements=unplaced if unplaced else None,
    )


# ---------------------------------------------------------------------------
# OR-Tools CP-SAT Solver
# ---------------------------------------------------------------------------

def schedule_ortools_cpsat(
    requirements: List[AssignmentStudyRequirementData],
    busy_blocks: List[BusyBlockData],
    horizon_start: datetime,
    horizon_days: int,
    prefs: SchedulerPreferencesData,
    existing_blocks: Optional[List[StudyBlockData]] = None,
) -> SchedulePlanResponse:
    """
    Formulates and solves the academic study scheduling problem using OR-Tools CP-SAT.
    """
    if not ORTOOLS_AVAILABLE:
        return schedule_greedy(requirements, busy_blocks, horizon_start, horizon_days, prefs, existing_blocks)

    total_slots = horizon_days * 48
    slot_starts = [horizon_start + timedelta(minutes=30 * i) for i in range(total_slots)]
    slot_ends = [slot_starts[i] + timedelta(minutes=30) for i in range(total_slots)]
    slot_days = [i // 48 for i in range(total_slots)]

    slot_is_sleep = [is_sleep_time(slot_starts[i], prefs.sleepWindow) for i in range(total_slots)]
    slot_is_busy = [is_busy_time(slot_starts[i], slot_ends[i], busy_blocks) for i in range(total_slots)]
    slot_is_preferred = [is_preferred_time(slot_starts[i], prefs.preferredHours) for i in range(total_slots)]

    model = cp_model.CpModel()

    # Decision variables: x[a_idx, t_idx] in {0, 1}
    x: Dict[Tuple[int, int], cp_model.IntVar] = {}
    for a_idx, req in enumerate(requirements):
        for t in range(total_slots):
            x[(a_idx, t)] = model.NewBoolVar(f"x_a{a_idx}_t{t}")

    # Hard Constraint 1: Sleep and Busy slots must be 0
    for a_idx in range(len(requirements)):
        for t in range(total_slots):
            if slot_is_sleep[t] or slot_is_busy[t]:
                model.Add(x[(a_idx, t)] == 0)

    # Hard Constraint 2: At most 1 assignment per slot
    for t in range(total_slots):
        model.Add(sum(x[(a_idx, t)] for a_idx in range(len(requirements))) <= 1)

    # Hard Constraint 3: Slots must complete before (deadline - buffer)
    for a_idx, req in enumerate(requirements):
        dl = parse_iso_datetime(req.dueAt) - timedelta(hours=prefs.finishBeforeDeadlineBufferHours)
        for t in range(total_slots):
            if slot_ends[t] > dl:
                model.Add(x[(a_idx, t)] == 0)

    # Hard Constraint 4: Total slots per assignment
    for a_idx, req in enumerate(requirements):
        target_slots = math.ceil(req.hoursNeeded * 2)
        model.Add(sum(x[(a_idx, t)] for t in range(total_slots)) == target_slots)

    # Hard Constraint 5: Daily cap
    max_slots_per_day = int(prefs.dailyCapHours * 2)
    for d in range(horizon_days):
        day_slots = [t for t in range(total_slots) if slot_days[t] == d]
        model.Add(
            sum(x[(a_idx, t)] for a_idx in range(len(requirements)) for t in day_slots) <= max_slots_per_day
        )

    # Hard Constraint 6: Max consecutive block length
    max_consecutive = int(prefs.maxBlockLengthHours * 2)
    window_size = max_consecutive + 1
    for a_idx in range(len(requirements)):
        for d in range(horizon_days):
            day_slots = [t for t in range(total_slots) if slot_days[t] == d]
            if len(day_slots) >= window_size:
                for w in range(len(day_slots) - window_size + 1):
                    window = day_slots[w : w + window_size]
                    model.Add(sum(x[(a_idx, t)] for t in window) <= max_consecutive)

    # Objective:
    # 1. Minimise lateness (earlier slots preferred)
    # 2. Reward preferred hours
    # 3. Smooth daily load (minimize max daily slots)
    max_daily_slots = model.NewIntVar(0, max_slots_per_day, "max_daily_slots")
    for d in range(horizon_days):
        day_slots = [t for t in range(total_slots) if slot_days[t] == d]
        model.Add(
            sum(x[(a_idx, t)] for a_idx in range(len(requirements)) for t in day_slots) <= max_daily_slots
        )

    objective_terms = []
    # Penalize later slots
    for a_idx in range(len(requirements)):
        for t in range(total_slots):
            objective_terms.append(x[(a_idx, t)] * (t // 4))  # slight penalty for later slots
            if slot_is_preferred[t]:
                objective_terms.append(x[(a_idx, t)] * (-20))  # bonus for preferred

    objective_terms.append(max_daily_slots * 50)  # load smoothing
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 3.0
    solver.parameters.num_workers = 1
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Extract solution
        all_blocks: List[StudyBlockData] = []
        for a_idx, req in enumerate(requirements):
            indices = [t for t in range(total_slots) if solver.Value(x[(a_idx, t)]) == 1]
            if not indices:
                continue

            runs: List[Tuple[int, int]] = []
            cur_s: Optional[int] = None
            cur_e: Optional[int] = None
            for idx in indices:
                if cur_s is None:
                    cur_s = idx
                    cur_e = idx
                elif idx == cur_e + 1:
                    cur_e = idx
                else:
                    runs.append((cur_s, cur_e))
                    cur_s = idx
                    cur_e = idx
            if cur_s is not None and cur_e is not None:
                runs.append((cur_s, cur_e))

            for b_idx, (r_s, r_e) in enumerate(runs):
                s_time = slot_starts[r_s]
                e_time = slot_ends[r_e]
                dur = (r_e - r_s + 1) * 30
                stable_uid = f"gradient-{req.courseId}-{req.assignmentId}-b{b_idx}@gradient.app"

                prev = next((b for b in (existing_blocks or []) if b.id == stable_uid), None)
                seq = (prev.sequence + 1) if prev else 0

                all_blocks.append(
                    StudyBlockData(
                        id=stable_uid,
                        assignmentId=req.assignmentId,
                        courseId=req.courseId,
                        assignmentName=req.assignmentName,
                        courseCode=req.courseCode,
                        startTime=format_iso_datetime(s_time),
                        endTime=format_iso_datetime(e_time),
                        durationMinutes=dur,
                        blockIndex=b_idx,
                        totalBlocks=len(runs),
                        status="scheduled",
                        sequence=seq,
                    )
                )

        all_blocks.sort(key=lambda b: parse_iso_datetime(b.startTime))
        req_hours = sum(r.hoursNeeded for r in requirements)
        sched_hours = sum(b.durationMinutes / 60.0 for b in all_blocks)

        radar = calculate_crunch_radar(
            all_blocks, busy_blocks, requirements, horizon_start, horizon_days
        )

        return SchedulePlanResponse(
            blocks=all_blocks,
            solverUsed="ortools_cpsat",
            isFeasible=True,
            scheduledHours=round(sched_hours, 1),
            requestedHours=round(req_hours, 1),
            crunchRadar=radar,
        )

    # Infeasible or timed out with CP-SAT -> invoke greedy fallback
    return schedule_greedy(requirements, busy_blocks, horizon_start, horizon_days, prefs, existing_blocks)


def schedule_study_blocks(
    requirements: List[AssignmentStudyRequirementData],
    busy_blocks: List[BusyBlockData],
    horizon_start_str: str,
    horizon_days: int = 14,
    preferences: Optional[SchedulerPreferencesData] = None,
    existing_blocks: Optional[List[StudyBlockData]] = None,
    force_solver: Optional[str] = None,
) -> SchedulePlanResponse:
    """
    Main dispatch: uses OR-Tools CP-SAT by default, falling back cleanly to greedy if needed.
    """
    prefs = preferences or SchedulerPreferencesData()
    h_start = parse_iso_datetime(horizon_start_str)

    # Align to 30-minute slot
    remainder = h_start.minute % 30
    h_start = h_start - timedelta(minutes=remainder, seconds=h_start.second, microseconds=h_start.microsecond)

    if force_solver == "greedy":
        return schedule_greedy(requirements, busy_blocks, h_start, horizon_days, prefs, existing_blocks)

    try:
        return schedule_ortools_cpsat(requirements, busy_blocks, h_start, horizon_days, prefs, existing_blocks)
    except Exception:
        return schedule_greedy(requirements, busy_blocks, h_start, horizon_days, prefs, existing_blocks)


# ---------------------------------------------------------------------------
# Rolling Replan
# ---------------------------------------------------------------------------

def replan_study_schedule(
    current_plan: SchedulePlanResponse,
    missed_block_ids: List[str],
    new_busy_blocks: List[BusyBlockData],
    replan_time_str: str,
    requirements: List[AssignmentStudyRequirementData],
    preferences: Optional[SchedulerPreferencesData] = None,
) -> SchedulePlanResponse:
    replan_dt = parse_iso_datetime(replan_time_str)

    # Update status of existing blocks
    updated_blocks: List[StudyBlockData] = []
    for b in current_plan.blocks:
        if b.id in missed_block_ids:
            updated_blocks.append(b.model_copy(update={"status": "missed"}))
        elif parse_iso_datetime(b.endTime) <= replan_dt:
            updated_blocks.append(b.model_copy(update={"status": "completed"}))
        else:
            updated_blocks.append(b)

    # Compute remaining hours per assignment
    remaining_reqs: List[AssignmentStudyRequirementData] = []
    for req in requirements:
        completed_hours = sum(
            b.durationMinutes / 60.0
            for b in updated_blocks
            if b.assignmentId == req.assignmentId and b.status == "completed"
        )
        remaining = max(0.0, req.hoursNeeded - completed_hours)
        if remaining > 0:
            remaining_reqs.append(req.model_copy(update={"hoursNeeded": remaining}))

    return schedule_study_blocks(
        requirements=remaining_reqs,
        busy_blocks=new_busy_blocks,
        horizon_start_str=replan_time_str,
        horizon_days=14,
        preferences=preferences,
        existing_blocks=updated_blocks,
    )


# ---------------------------------------------------------------------------
# RFC 5545 iCalendar (ICS) Export & Parser
# ---------------------------------------------------------------------------

def format_ics_timestamp(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def parse_ics_timestamp(ts_str: str) -> datetime:
    clean = ts_str.strip().replace("VALUE=DATE:", "")
    m = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$", clean)
    if m:
        y, mo, d, h, mi, s = map(int, m.groups()[:6])
        return datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc)
    m_day = re.match(r"^(\d{4})(\d{2})(\d{2})$", clean)
    if m_day:
        y, mo, d = map(int, m_day.groups())
        return datetime(y, mo, d, 0, 0, 0, tzinfo=timezone.utc)
    return parse_iso_datetime(clean)


def export_schedule_to_ics(blocks: List[StudyBlockData], calendar_name: str = "GRADIENT Study Schedule") -> str:
    now_stamp = format_ics_timestamp(datetime.now(timezone.utc))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GRADIENT//Study Scheduler//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{calendar_name}",
    ]
    for b in blocks:
        dt_s = format_ics_timestamp(parse_iso_datetime(b.startTime))
        dt_e = format_ics_timestamp(parse_iso_datetime(b.endTime))
        summary = f"[GRADIENT] Study: {b.assignmentName} ({b.courseCode})"
        desc = (
            f"Block {b.blockIndex + 1} of {b.totalBlocks} ({b.durationMinutes} min)\\n"
            f"Assignment: {b.assignmentName}\\nCourse: {b.courseCode}\\nStatus: {b.status.upper()}"
        )
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{b.id}",
            f"SEQUENCE:{b.sequence}",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART:{dt_s}",
            f"DTEND:{dt_e}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:{desc}",
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def parse_ics_to_busy_blocks(ics_text: str) -> List[BusyBlockData]:
    busy_blocks: List[BusyBlockData] = []
    lines = ics_text.splitlines()

    # Unfold lines
    unfolded: List[str] = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and unfolded:
            unfolded[-1] += line[1:]
        elif line.strip():
            unfolded.append(line.strip())

    in_event = False
    cur_uid: Optional[str] = None
    cur_summary = "Busy"
    cur_start: Optional[str] = None
    cur_end: Optional[str] = None

    for line in unfolded:
        if line == "BEGIN:VEVENT":
            in_event = True
            cur_uid = None
            cur_summary = "Busy"
            cur_start = None
            cur_end = None
        elif line == "END:VEVENT":
            if in_event and cur_start and cur_end:
                busy_blocks.append(
                    BusyBlockData(
                        id=cur_uid or f"busy-{len(busy_blocks)+1}",
                        title=cur_summary,
                        startTime=cur_start,
                        endTime=cur_end,
                        source="pasted_ical",
                    )
                )
            in_event = False
        elif in_event:
            colon = line.find(":")
            if colon > 0:
                prop_name = line[:colon].split(";")[0].upper()
                val = line[colon + 1 :]
                if prop_name == "UID":
                    cur_uid = val
                elif prop_name == "SUMMARY":
                    cur_summary = val.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ")
                elif prop_name == "DTSTART":
                    try:
                        cur_start = format_iso_datetime(parse_ics_timestamp(val))
                    except Exception:
                        pass
                elif prop_name == "DTEND":
                    try:
                        cur_end = format_iso_datetime(parse_ics_timestamp(val))
                    except Exception:
                        pass

    return busy_blocks
