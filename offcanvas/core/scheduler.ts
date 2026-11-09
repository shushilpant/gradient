import {
  type BusyBlock,
  type SchedulerPreferences,
  type AssignmentStudyRequirement,
  type StudyBlock,
  type CrunchWeek,
  type CrunchRadarReport,
  type SchedulePlan,
  SchedulerPreferencesSchema,
} from './schedulerSchema.js';

export interface Slot {
  index: number;
  startTime: Date;
  endTime: Date;
  dayOffset: number;
  hourOfDay: number;
  isSleep: boolean;
  isBusy: boolean;
  isPreferred: boolean;
}

/**
 * Checks if a given slot falls within the configured sleep window.
 */
export function isSleepSlot(slotDate: Date, sleepWindow: { startHour: number; endHour: number }): boolean {
  const hour = slotDate.getHours() + slotDate.getMinutes() / 60;
  if (sleepWindow.startHour > sleepWindow.endHour) {
    // Overnight sleep window e.g. 23:00 to 07:00
    return hour >= sleepWindow.startHour || hour < sleepWindow.endHour;
  } else {
    // Day/morning sleep window e.g. 01:00 to 09:00
    return hour >= sleepWindow.startHour && hour < sleepWindow.endHour;
  }
}

/**
 * Checks if a given slot overlaps with any busy block on the student's calendar.
 */
export function isBusySlot(slotStart: Date, slotEnd: Date, busyBlocks: BusyBlock[]): boolean {
  const sTime = slotStart.getTime();
  const eTime = slotEnd.getTime();
  return busyBlocks.some((b) => {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    return sTime < bEnd && eTime > bStart;
  });
}

/**
 * Checks if a slot falls within student's preferred study hours.
 */
export function isPreferredSlot(
  slotDate: Date,
  preferredRanges: Array<{ startHour: number; endHour: number }>
): boolean {
  const hour = slotDate.getHours() + slotDate.getMinutes() / 60;
  return preferredRanges.some((r) => hour >= r.startHour && hour < r.endHour);
}

/**
 * Generates discrete 30-minute time slots across a planning horizon.
 */
export function generateSlotGrid(
  horizonStart: Date,
  horizonDays: number,
  busyBlocks: BusyBlock[],
  preferences: SchedulerPreferences
): Slot[] {
  const slots: Slot[] = [];
  const totalSlots = horizonDays * 48; // 48 thirty-minute slots per day

  for (let i = 0; i < totalSlots; i++) {
    const slotStart = new Date(horizonStart.getTime() + i * 30 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    const dayOffset = Math.floor(i / 48);
    const hourOfDay = slotStart.getHours() + slotStart.getMinutes() / 60;

    const isSleep = isSleepSlot(slotStart, preferences.sleepWindow);
    const isBusy = isBusySlot(slotStart, slotEnd, busyBlocks);
    const isPreferred = isPreferredSlot(slotStart, preferences.preferredHours);

    slots.push({
      index: i,
      startTime: slotStart,
      endTime: slotEnd,
      dayOffset,
      hourOfDay,
      isSleep,
      isBusy,
      isPreferred,
    });
  }

  return slots;
}

/**
 * Pure TypeScript greedy scheduler with daily load smoothing and constraint enforcement.
 * Acts as the client-side engine and fallback solver.
 */
export function scheduleStudyBlocksGreedy(
  requirements: AssignmentStudyRequirement[],
  busyBlocks: BusyBlock[],
  horizonStartInput: Date | string,
  horizonDays = 14,
  preferencesInput?: Partial<SchedulerPreferences>,
  existingBlocks: StudyBlock[] = []
): SchedulePlan {
  const preferences = SchedulerPreferencesSchema.parse(preferencesInput ?? {});
  const horizonStart = typeof horizonStartInput === 'string' ? new Date(horizonStartInput) : horizonStartInput;

  // Align horizon start to next 30-minute boundary
  const remainderMinutes = horizonStart.getMinutes() % 30;
  const alignedStart = new Date(horizonStart.getTime() - remainderMinutes * 60 * 1000);
  alignedStart.setSeconds(0, 0);

  const slots = generateSlotGrid(alignedStart, horizonDays, busyBlocks, preferences);

  // Track state across slots
  const slotOccupancy = new Map<number, string>(); // slotIndex -> assignmentId
  const dailySlotsAllocated = new Map<number, number>(); // dayOffset -> count
  for (let d = 0; d < horizonDays; d++) {
    dailySlotsAllocated.set(d, 0);
  }

  // Pre-fill existing completed blocks if replanning
  for (const eb of existingBlocks) {
    if (eb.status === 'completed') {
      const ebStart = new Date(eb.startTime).getTime();
      const ebEnd = new Date(eb.endTime).getTime();
      for (const slot of slots) {
        if (slot.startTime.getTime() >= ebStart && slot.endTime.getTime() <= ebEnd) {
          slotOccupancy.set(slot.index, eb.assignmentId);
          dailySlotsAllocated.set(slot.dayOffset, (dailySlotsAllocated.get(slot.dayOffset) ?? 0) + 1);
        }
      }
    }
  }

  const maxSlotsPerDay = Math.floor(preferences.dailyCapHours * 2);
  const maxConsecutiveSlots = Math.floor(preferences.maxBlockLengthHours * 2);

  // Sort assignments: Earliest Deadline First (EDF), then by priority weight
  const sortedReqs = [...requirements].sort((a, b) => {
    const diffDeadline = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    if (diffDeadline !== 0) return diffDeadline;
    return b.priorityWeight - a.priorityWeight;
  });

  const scheduledSlotsByAssignment = new Map<string, number[]>();
  const unplacedRequirements: AssignmentStudyRequirement[] = [];

  for (const req of sortedReqs) {
    let slotsNeeded = Math.ceil(req.hoursNeeded * 2);
    const deadlineTime = new Date(req.dueAt).getTime();
    const effectiveDeadline = deadlineTime - preferences.finishBeforeDeadlineBufferHours * 3600 * 1000;

    const assignedIndices: number[] = [];

    // Filter candidate slots
    const candidateSlots = slots.filter((slot) => {
      // Must not be occupied, sleep, or busy
      if (slotOccupancy.has(slot.index)) return false;
      if (slot.isSleep || slot.isBusy) return false;
      // Must complete before deadline minus buffer
      if (slot.endTime.getTime() > effectiveDeadline) return false;
      // Day must not exceed daily cap
      const currentDayUsage = dailySlotsAllocated.get(slot.dayOffset) ?? 0;
      if (currentDayUsage >= maxSlotsPerDay) return false;
      return true;
    });

    // Score candidate slots to balance daily load and prefer preferred hours
    const scoredSlots = candidateSlots.map((slot) => {
      const currentDayUsage = dailySlotsAllocated.get(slot.dayOffset) ?? 0;
      // Load smoothing penalty: days with higher load get lower score
      const loadPenalty = currentDayUsage * 5;
      // Preferred hours bonus
      const preferredBonus = slot.isPreferred ? 15 : 0;
      // Earlier slot bonus (slight preference to finish proactively rather than last-minute)
      const urgencyBonus = Math.max(0, 10 - slot.dayOffset * 0.5);

      return {
        slot,
        score: preferredBonus + urgencyBonus - loadPenalty,
      };
    });

    // Sort by score descending
    scoredSlots.sort((a, b) => b.score - a.score);

    // Greedily pick slots respecting consecutive max block length
    for (const item of scoredSlots) {
      if (slotsNeeded <= 0) break;

      const slot = item.slot;
      const dayUsage = dailySlotsAllocated.get(slot.dayOffset) ?? 0;
      if (dayUsage >= maxSlotsPerDay) continue;

      // Check consecutive slots for the same assignment to respect maxBlockLength
      let consecutiveBefore = 0;
      let checkIdx = slot.index - 1;
      while (slotOccupancy.get(checkIdx) === req.assignmentId) {
        consecutiveBefore++;
        checkIdx--;
      }
      let consecutiveAfter = 0;
      checkIdx = slot.index + 1;
      while (slotOccupancy.get(checkIdx) === req.assignmentId) {
        consecutiveAfter++;
        checkIdx++;
      }

      if (consecutiveBefore + 1 + consecutiveAfter > maxConsecutiveSlots) {
        continue;
      }

      // Assign slot
      slotOccupancy.set(slot.index, req.assignmentId);
      dailySlotsAllocated.set(slot.dayOffset, dayUsage + 1);
      assignedIndices.push(slot.index);
      slotsNeeded--;
    }

    if (assignedIndices.length > 0) {
      scheduledSlotsByAssignment.set(req.assignmentId, assignedIndices.sort((a, b) => a - b));
    }

    if (slotsNeeded > 0) {
      unplacedRequirements.push({
        ...req,
        hoursNeeded: slotsNeeded * 0.5,
      });
    }
  }

  // Group contiguous slots into StudyBlocks with stable UIDs
  const allBlocks: StudyBlock[] = [];

  for (const req of sortedReqs) {
    const indices = scheduledSlotsByAssignment.get(req.assignmentId) ?? [];
    if (indices.length === 0) continue;

    const blockRuns: Array<{ startIdx: number; endIdx: number }> = [];
    let currentRun: { startIdx: number; endIdx: number } | null = null;

    for (const idx of indices) {
      if (!currentRun) {
        currentRun = { startIdx: idx, endIdx: idx };
      } else if (idx === currentRun.endIdx + 1) {
        currentRun.endIdx = idx;
      } else {
        blockRuns.push(currentRun);
        currentRun = { startIdx: idx, endIdx: idx };
      }
    }
    if (currentRun) {
      blockRuns.push(currentRun);
    }

    // Create StudyBlock objects with stable UIDs
    blockRuns.forEach((run, bIdx) => {
      const startSlot = slots[run.startIdx]!;
      const endSlot = slots[run.endIdx]!;
      const durationMinutes = (run.endIdx - run.startIdx + 1) * 30;

      // Stable UID: deterministic based on course, assignment, and block index
      const canonicalUid = `offcanvas-${req.courseId}-${req.assignmentId}-b${bIdx}@offcanvas.app`;
      const legacyUid = `bodha-${req.courseId}-${req.assignmentId}-b${bIdx}@bodha.app`;

      // Preserve exported event identities when upgrading an existing schedule.
      const prev = existingBlocks.find((eb) => eb.id === canonicalUid)
        ?? existingBlocks.find((eb) => eb.id === legacyUid);
      const stableUid = prev?.id ?? canonicalUid;
      const seq = prev ? prev.sequence + 1 : 0;

      allBlocks.push({
        id: stableUid,
        assignmentId: req.assignmentId,
        courseId: req.courseId,
        assignmentName: req.assignmentName,
        courseCode: req.courseCode,
        startTime: startSlot.startTime.toISOString(),
        endTime: endSlot.endTime.toISOString(),
        durationMinutes,
        blockIndex: bIdx,
        totalBlocks: blockRuns.length,
        status: 'scheduled',
        sequence: seq,
      });
    });
  }

  // Sort blocks chronologically
  allBlocks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const requestedHours = requirements.reduce((acc, r) => acc + r.hoursNeeded, 0);
  const scheduledHours = allBlocks.reduce((acc, b) => acc + b.durationMinutes / 60, 0);

  // Compute Crunch Radar
  const crunchRadar = calculateCrunchRadar(
    allBlocks,
    busyBlocks,
    requirements,
    alignedStart,
    horizonDays,
    preferences
  );

  return {
    blocks: allBlocks,
    solverUsed: 'greedy_fallback',
    isFeasible: unplacedRequirements.length === 0,
    scheduledHours,
    requestedHours,
    crunchRadar,
    unplacedRequirements: unplacedRequirements.length > 0 ? unplacedRequirements : undefined,
  };
}

/**
 * Calculates the weekly Crunch Radar metrics.
 */
export function calculateCrunchRadar(
  blocks: StudyBlock[],
  busyBlocks: BusyBlock[],
  requirements: AssignmentStudyRequirement[],
  horizonStart: Date,
  horizonDays = 14,
  preferences?: SchedulerPreferences
): CrunchRadarReport {
  const numWeeks = Math.ceil(horizonDays / 7);
  const weeks: CrunchWeek[] = [];

  const sleepHoursPerDay = preferences
    ? preferences.sleepWindow.startHour > preferences.sleepWindow.endHour
      ? 24 - preferences.sleepWindow.startHour + preferences.sleepWindow.endHour
      : preferences.sleepWindow.endHour - preferences.sleepWindow.startHour
    : 8;

  for (let w = 0; w < numWeeks; w++) {
    const wStart = new Date(horizonStart.getTime() + w * 7 * 24 * 3600 * 1000);
    const wEnd = new Date(wStart.getTime() + 7 * 24 * 3600 * 1000);
    const wStartMs = wStart.getTime();
    const wEndMs = wEnd.getTime();

    // Sum scheduled hours in this week
    let weekStudyHours = 0;
    for (const b of blocks) {
      const bStart = new Date(b.startTime).getTime();
      if (bStart >= wStartMs && bStart < wEndMs) {
        weekStudyHours += b.durationMinutes / 60;
      }
    }

    // Sum busy block hours in this week
    let weekBusyHours = 0;
    for (const busy of busyBlocks) {
      const bStart = Math.max(wStartMs, new Date(busy.startTime).getTime());
      const bEnd = Math.min(wEndMs, new Date(busy.endTime).getTime());
      if (bEnd > bStart) {
        weekBusyHours += (bEnd - bStart) / (3600 * 1000);
      }
    }

    // Available awake capacity hours
    const totalWeekHours = 7 * 24;
    const totalSleepHours = 7 * sleepHoursPerDay;
    const capacityHours = Math.max(10, totalWeekHours - totalSleepHours - weekBusyHours);

    // Count assignments due in this week
    let assignmentsDueCount = 0;
    for (const req of requirements) {
      const dueTime = new Date(req.dueAt).getTime();
      if (dueTime >= wStartMs && dueTime < wEndMs) {
        assignmentsDueCount++;
      }
    }

    const crunchRatio = weekStudyHours / capacityHours;
    let crunchLevel: 'balanced' | 'moderate' | 'high' = 'balanced';
    if (crunchRatio > 0.4 || weekStudyHours >= 22 || assignmentsDueCount >= 3) {
      crunchLevel = 'high';
    } else if (crunchRatio >= 0.22 || weekStudyHours >= 12) {
      crunchLevel = 'moderate';
    }

    weeks.push({
      weekNumber: w + 1,
      startDate: wStart.toISOString(),
      endDate: wEnd.toISOString(),
      scheduledStudyHours: Math.round(weekStudyHours * 10) / 10,
      capacityHours: Math.round(capacityHours * 10) / 10,
      assignmentsDueCount,
      crunchRatio: Math.round(crunchRatio * 100) / 100,
      crunchLevel,
    });
  }

  const recommendations: string[] = [];
  const highCrunch = weeks.find((w) => w.crunchLevel === 'high');
  if (highCrunch) {
    recommendations.push(
      `Week ${highCrunch.weekNumber} Crunch Alert: ${highCrunch.scheduledStudyHours}h study load across ${highCrunch.assignmentsDueCount} deadlines. Consider pulling earlier assignments into preceding weeks.`
    );
  } else {
    recommendations.push('Study load is balanced across weekly horizons with healthy cognitive recovery buffers.');
  }

  return {
    weeks,
    totalHoursScheduled: Math.round(blocks.reduce((acc, b) => acc + b.durationMinutes / 60, 0) * 10) / 10,
    highestCrunchWeek: highCrunch ? highCrunch.weekNumber : undefined,
    recommendations,
  };
}

/**
 * Performs a rolling replan when blocks are missed or logged late.
 * Completed blocks are preserved; missed block hours are reallocated into future slots.
 * Maintains stable block UIDs with incremented sequence numbers.
 */
export function replanSchedule(
  currentPlan: SchedulePlan,
  missedBlockIds: string[],
  newBusyBlocks: BusyBlock[],
  replanTime: Date = new Date(),
  requirements: AssignmentStudyRequirement[],
  preferences?: SchedulerPreferences
): SchedulePlan {
  // 1. Identify completed and missed blocks
  const updatedBlocks: StudyBlock[] = currentPlan.blocks.map((b) => {
    if (missedBlockIds.includes(b.id)) {
      return { ...b, status: 'missed' as const };
    }
    const bEndTime = new Date(b.endTime).getTime();
    if (bEndTime <= replanTime.getTime()) {
      return { ...b, status: 'completed' as const };
    }
    return b;
  });

  // 2. Compute remaining hours needed per assignment
  const remainingRequirements: AssignmentStudyRequirement[] = [];

  for (const req of requirements) {
    const completedForReq = updatedBlocks.filter(
      (b) => b.assignmentId === req.assignmentId && b.status === 'completed'
    );
    const completedHours = completedForReq.reduce((acc, b) => acc + b.durationMinutes / 60, 0);
    const remainingHours = Math.max(0, req.hoursNeeded - completedHours);

    if (remainingHours > 0) {
      remainingRequirements.push({
        ...req,
        hoursNeeded: remainingHours,
      });
    }
  }

  // 3. Re-schedule starting from replanTime, passing all updatedBlocks to preserve UIDs and increment sequences
  return scheduleStudyBlocksGreedy(
    remainingRequirements,
    newBusyBlocks,
    replanTime,
    14,
    preferences,
    updatedBlocks
  );
}
