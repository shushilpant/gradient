import { describe, it, expect } from 'vitest';
import {
  scheduleStudyBlocksGreedy,
  replanSchedule,
  isBusySlot,
  isSleepSlot,
} from '../core/scheduler.js';
import {
  exportScheduleToICS,
  parseICSToBusyBlocks,
} from '../core/icsParser.js';
import {
  scanAnnouncementsForChanges,
} from '../core/changeRadar.js';
import {
  type BusyBlock,
  type AssignmentStudyRequirement,
  type SchedulerPreferences,
  type StudyBlock,
  SchedulerPreferencesSchema,
} from '../core/schedulerSchema.js';

describe('Stage 10: Academic Study Scheduler & Change Radar', () => {
  // -------------------------------------------------------------------------
  // 1. Constraint Satisfaction on 20 Randomised Scenarios
  // -------------------------------------------------------------------------
  describe('20 Randomised Constraint Satisfaction Scenarios', () => {
    // Deterministic LCG pseudo-random generator
    let seed = 133742;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    const horizonStart = new Date('2026-11-16T08:00:00Z');

    for (let scenarioIdx = 1; scenarioIdx <= 20; scenarioIdx++) {
      it(`Scenario ${scenarioIdx}: Satisfies all hard constraints (busy, sleep, deadline, daily cap, max block)`, () => {
        // Vary preferences
        const sleepStart = Math.floor(22 + rand() * 2); // 22 or 23
        const sleepEnd = Math.floor(6 + rand() * 3);    // 6, 7, or 8
        const dailyCap = 4.0 + Math.floor(rand() * 4) * 1.0; // 4.0, 5.0, 6.0, 7.0
        const maxBlock = 1.5 + Math.floor(rand() * 3) * 0.5; // 1.5, 2.0, 2.5
        const bufferHours = 1.0 + Math.floor(rand() * 3) * 1.0; // 1.0, 2.0, 3.0

        const prefs: SchedulerPreferences = SchedulerPreferencesSchema.parse({
          sleepWindow: { startHour: sleepStart, endHour: sleepEnd },
          dailyCapHours: dailyCap,
          maxBlockLengthHours: maxBlock,
          finishBeforeDeadlineBufferHours: bufferHours,
          preferredHours: [
            { startHour: 9, endHour: 12 },
            { startHour: 14, endHour: 18 },
          ],
        });

        // Generate 3 to 8 random busy blocks across 14 days
        const busyBlocks: BusyBlock[] = [];
        const numBusy = 5 + Math.floor(rand() * 8);
        for (let b = 0; b < numBusy; b++) {
          const day = Math.floor(rand() * 12);
          const startH = Math.floor(10 + rand() * 8); // between 10am and 6pm
          const durH = 1.0 + Math.floor(rand() * 2) * 0.5; // 1.0 to 1.5h

          const bStart = new Date(horizonStart.getTime() + (day * 24 + startH) * 3600 * 1000);
          const bEnd = new Date(bStart.getTime() + durH * 3600 * 1000);

          busyBlocks.push({
            id: `busy-scen${scenarioIdx}-${b}`,
            title: `Class / Meeting ${b + 1}`,
            startTime: bStart.toISOString(),
            endTime: bEnd.toISOString(),
            source: 'manual',
          });
        }

        // Generate 2 to 4 assignment requirements
        const reqs: AssignmentStudyRequirement[] = [
          {
            assignmentId: `assign-scen${scenarioIdx}-1`,
            courseId: '99001',
            assignmentName: 'HW 1: Analysis',
            courseCode: 'CS 101',
            dueAt: new Date(horizonStart.getTime() + (3 * 24 + 23) * 3600 * 1000).toISOString(), // Day 3 23:00
            hoursNeeded: 2.0 + Math.floor(rand() * 3) * 1.0,
            priorityWeight: 1.2,
          },
          {
            assignmentId: `assign-scen${scenarioIdx}-2`,
            courseId: '99002',
            assignmentName: 'Problem Set 2',
            courseCode: 'MATH 201',
            dueAt: new Date(horizonStart.getTime() + (7 * 24 + 23) * 3600 * 1000).toISOString(), // Day 7 23:00
            hoursNeeded: 3.0 + Math.floor(rand() * 3) * 1.0,
            priorityWeight: 1.0,
          },
          {
            assignmentId: `assign-scen${scenarioIdx}-3`,
            courseId: '99001',
            assignmentName: 'Term Project',
            courseCode: 'CS 101',
            dueAt: new Date(horizonStart.getTime() + (12 * 24 + 23) * 3600 * 1000).toISOString(), // Day 12 23:00
            hoursNeeded: 4.0 + Math.floor(rand() * 3) * 1.0,
            priorityWeight: 1.5,
          },
        ];

        // Run Scheduler
        const plan = scheduleStudyBlocksGreedy(reqs, busyBlocks, horizonStart, 14, prefs);

        expect(plan.blocks.length).toBeGreaterThan(0);

        // 1. Hard Constraint: Zero busy block overlaps
        for (const block of plan.blocks) {
          const bStart = new Date(block.startTime);
          const bEnd = new Date(block.endTime);
          const hasOverlap = isBusySlot(bStart, bEnd, busyBlocks);
          expect(hasOverlap).toBe(false);
        }

        // 2. Hard Constraint: Zero sleep window overlaps
        for (const block of plan.blocks) {
          const bStart = new Date(block.startTime);
          const inSleep = isSleepSlot(bStart, prefs.sleepWindow);
          expect(inSleep).toBe(false);
        }

        // 3. Hard Constraint: Deadlines met with buffer
        for (const block of plan.blocks) {
          const targetReq = reqs.find((r) => r.assignmentId === block.assignmentId)!;
          const deadlineMs = new Date(targetReq.dueAt).getTime();
          const bufferMs = prefs.finishBeforeDeadlineBufferHours * 3600 * 1000;
          const blockEndMs = new Date(block.endTime).getTime();

          expect(blockEndMs).toBeLessThanOrEqual(deadlineMs - bufferMs);
        }

        // 4. Hard Constraint: Daily cap respected
        const dailyHours = new Map<number, number>();
        for (const block of plan.blocks) {
          const bStart = new Date(block.startTime);
          const dayIdx = Math.floor((bStart.getTime() - horizonStart.getTime()) / (24 * 3600 * 1000));
          const durH = block.durationMinutes / 60;
          dailyHours.set(dayIdx, (dailyHours.get(dayIdx) ?? 0) + durH);
        }

        for (const [, hours] of dailyHours.entries()) {
          expect(hours).toBeLessThanOrEqual(prefs.dailyCapHours + 1e-4);
        }

        // 5. Hard Constraint: Max block length respected
        for (const block of plan.blocks) {
          expect(block.durationMinutes / 60).toBeLessThanOrEqual(prefs.maxBlockLengthHours + 1e-4);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. RFC 5545 iCalendar (ICS) Round-Trip Import
  // -------------------------------------------------------------------------
  describe('RFC 5545 iCalendar (ICS) Export & Round-Trip Parsing', () => {
    it('exports study blocks to valid ICS format with stable UIDs and parses back accurately', () => {
      const sampleBlocks: StudyBlock[] = [
        {
          id: 'offcanvas-99001-1002-b0@offcanvas.app',
          assignmentId: '1002',
          courseId: '99001',
          assignmentName: 'HW 2: Divide & Conquer',
          courseCode: 'CS 101',
          startTime: '2026-11-17T15:00:00.000Z',
          endTime: '2026-11-17T17:00:00.000Z',
          durationMinutes: 120,
          blockIndex: 0,
          totalBlocks: 2,
          status: 'scheduled',
          sequence: 0,
        },
        {
          id: 'offcanvas-99001-1002-b1@offcanvas.app',
          assignmentId: '1002',
          courseId: '99001',
          assignmentName: 'HW 2: Divide & Conquer',
          courseCode: 'CS 101',
          startTime: '2026-11-18T10:00:00.000Z',
          endTime: '2026-11-18T11:30:00.000Z',
          durationMinutes: 90,
          blockIndex: 1,
          totalBlocks: 2,
          status: 'scheduled',
          sequence: 0,
        },
      ];

      // Export to RFC 5545 string
      const icsString = exportScheduleToICS(sampleBlocks, 'OffCanvas Test Calendar');

      expect(icsString).toContain('BEGIN:VCALENDAR');
      expect(icsString).toContain('VERSION:2.0');
      expect(icsString).toContain('PRODID:-//OffCanvas//Study Scheduler//EN');
      expect(icsString).toContain('UID:offcanvas-99001-1002-b0@offcanvas.app');
      expect(icsString).toContain('UID:offcanvas-99001-1002-b1@offcanvas.app');
      expect(icsString).toContain('SEQUENCE:0');
      expect(icsString).toContain('DTSTART:20261117T150000Z');
      expect(icsString).toContain('DTEND:20261117T170000Z');
      expect(icsString).toContain('END:VCALENDAR');

      // Round-trip parse back
      const parsedBlocks = parseICSToBusyBlocks(icsString);

      expect(parsedBlocks.length).toBe(2);
      expect(parsedBlocks[0]!.id).toBe('offcanvas-99001-1002-b0@offcanvas.app');
      expect(new Date(parsedBlocks[0]!.startTime).toISOString()).toBe('2026-11-17T15:00:00.000Z');
      expect(new Date(parsedBlocks[0]!.endTime).toISOString()).toBe('2026-11-17T17:00:00.000Z');
      expect(parsedBlocks[0]!.title).toContain('HW 2: Divide & Conquer');

      expect(parsedBlocks[1]!.id).toBe('offcanvas-99001-1002-b1@offcanvas.app');
      expect(new Date(parsedBlocks[1]!.startTime).toISOString()).toBe('2026-11-18T10:00:00.000Z');
      expect(new Date(parsedBlocks[1]!.endTime).toISOString()).toBe('2026-11-18T11:30:00.000Z');
    });

    it('parses external standard Google Calendar / Apple Calendar ICS feeds', () => {
      const rawIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
        'BEGIN:VEVENT',
        'UID:ext-lecture-101@google.com',
        'SUMMARY:CS 101 Lecture: Dynamic Programming',
        'DTSTART:20261116T140000Z',
        'DTEND:20261116T153000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:ext-dentist-appt@google.com',
        'SUMMARY:Dentist Checkup',
        'DTSTART:20261117T180000Z',
        'DTEND:20261117T190000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const busyBlocks = parseICSToBusyBlocks(rawIcs);
      expect(busyBlocks.length).toBe(2);
      expect(busyBlocks[0]!.title).toBe('CS 101 Lecture: Dynamic Programming');
      expect(busyBlocks[0]!.id).toBe('ext-lecture-101@google.com');
      expect(busyBlocks[1]!.title).toBe('Dentist Checkup');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Stable UID & Sequence Number Preservation Across Replans
  // -------------------------------------------------------------------------
  describe('Rolling Replan & UID Stability', () => {
    it('retains an already-exported legacy event identity when upgrading a schedule', () => {
      const horizonStart = new Date('2026-11-16T08:00:00Z');
      const reqs: AssignmentStudyRequirement[] = [{ assignmentId: '1003', courseId: '99001', assignmentName: 'Homework',
        courseCode: 'CS 101', dueAt: '2026-11-20T23:59:00Z', hoursNeeded: 2, priorityWeight: 1 }];
      const plan = scheduleStudyBlocksGreedy(reqs, [], horizonStart, 14);
      const first = plan.blocks[0]!;
      first.id = 'bodha-99001-1003-b0@bodha.app';
      first.sequence = 3;
      const replanned = replanSchedule(plan, [first.id], [], new Date(horizonStart.getTime() + 4 * 3600 * 1000), reqs);
      expect(replanned.blocks.find(block => block.id === first.id)?.sequence).toBe(4);
    });

    it('preserves stable block UIDs and increments sequence when replanning missed blocks', () => {
      const horizonStart = new Date('2026-11-16T08:00:00Z');
      const reqs: AssignmentStudyRequirement[] = [
        {
          assignmentId: '1003',
          courseId: '99001',
          assignmentName: 'HW 3: Dynamic Programming',
          courseCode: 'CS 101',
          dueAt: '2026-11-20T23:59:00Z',
          hoursNeeded: 4.0,
          priorityWeight: 1.0,
        },
      ];

      // Initial Schedule
      const initialPlan = scheduleStudyBlocksGreedy(reqs, [], horizonStart, 14);
      expect(initialPlan.blocks.length).toBeGreaterThan(0);

      const firstBlock = initialPlan.blocks[0]!;
      expect(firstBlock.sequence).toBe(0);
      expect(firstBlock.id).toBe('offcanvas-99001-1003-b0@offcanvas.app');

      // Mark first block missed and simulate rolling replan 2 hours later
      const replanTime = new Date(horizonStart.getTime() + 4 * 3600 * 1000);
      const replanned = replanSchedule(
        initialPlan,
        [firstBlock.id],
        [],
        replanTime,
        reqs
      );

      expect(replanned.blocks.length).toBeGreaterThan(0);
      const replannedFirst = replanned.blocks.find((b) => b.id === firstBlock.id);

      // Stable UID invariant: UID is identical!
      expect(replannedFirst).toBeDefined();
      expect(replannedFirst!.id).toBe(firstBlock.id);

      // Sequence increments so calendar updates event rather than duplicating
      expect(replannedFirst!.sequence).toBe(1);

      // All scheduled times must be >= replanTime
      for (const b of replanned.blocks) {
        expect(new Date(b.startTime).getTime()).toBeGreaterThanOrEqual(replanTime.getTime());
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Crunch Radar Weekly Capacity Analysis
  // -------------------------------------------------------------------------
  describe('Crunch Radar Risk Level Assessment', () => {
    it('classifies heavy study weeks as high crunch and generates actionable pacing advice', () => {
      const horizonStart = new Date('2026-11-16T08:00:00Z');
      const reqs: AssignmentStudyRequirement[] = [
        {
          assignmentId: '1001',
          courseId: '99001',
          assignmentName: 'HW 1',
          courseCode: 'CS 101',
          dueAt: '2026-11-20T23:59:00Z',
          hoursNeeded: 10.0,
          priorityWeight: 1.0,
        },
        {
          assignmentId: '2001',
          courseId: '99002',
          assignmentName: 'PS 1',
          courseCode: 'MATH 201',
          dueAt: '2026-11-21T23:59:00Z',
          hoursNeeded: 8.0,
          priorityWeight: 1.0,
        },
        {
          assignmentId: '1008',
          courseId: '99001',
          assignmentName: 'Project Draft',
          courseCode: 'CS 101',
          dueAt: '2026-11-22T23:59:00Z',
          hoursNeeded: 8.0,
          priorityWeight: 1.0,
        },
      ];

      const plan = scheduleStudyBlocksGreedy(reqs, [], horizonStart, 14);
      const radar = plan.crunchRadar;

      expect(radar.weeks.length).toBe(2);
      const week1 = radar.weeks[0]!;

      // 26 hours in Week 1 with 3 deadlines -> High Crunch!
      expect(week1.crunchLevel).toBe('high');
      expect(week1.assignmentsDueCount).toBe(3);
      expect(radar.highestCrunchWeek).toBe(1);
      expect(radar.recommendations[0]).toContain('Week 1 Crunch Alert');
    });

    it('classifies light study loads as balanced', () => {
      const horizonStart = new Date('2026-11-16T08:00:00Z');
      const reqs: AssignmentStudyRequirement[] = [
        {
          assignmentId: '1001',
          courseId: '99001',
          assignmentName: 'Quiz Prep',
          courseCode: 'CS 101',
          dueAt: '2026-11-20T23:59:00Z',
          hoursNeeded: 2.0,
          priorityWeight: 1.0,
        },
      ];

      const plan = scheduleStudyBlocksGreedy(reqs, [], horizonStart, 14);
      const week1 = plan.crunchRadar.weeks[0]!;

      expect(week1.crunchLevel).toBe('balanced');
      expect(plan.crunchRadar.recommendations[0]).toContain('balanced');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Change Radar Client-Side Detection
  // -------------------------------------------------------------------------
  describe('Change Radar Due Date Modification Scanner', () => {
    it('detects due date modification with exact verbatim sentence and pending confirmation', () => {
      const announcements = [
        {
          id: 'ann-101',
          courseId: '99001',
          title: 'Urgent: Homework 2 Extension',
          message: 'Because of the power outage in the dorms, the due date has been moved to Friday, Nov 14 at 11:59 PM. Please make sure to test your code.',
        },
      ];

      const knownAssignments = [
        {
          id: '1002',
          name: 'HW 2: Divide & Conquer',
          courseId: '99001',
          dueAt: '2026-11-12T23:59:00Z',
        },
      ];

      const alerts = scanAnnouncementsForChanges(announcements, knownAssignments);

      expect(alerts.length).toBe(1);
      const alert = alerts[0]!;
      expect(alert.assignmentId).toBe('1002');
      expect(alert.assignmentName).toBe('HW 2: Divide & Conquer');
      expect(alert.status).toBe('pending_confirmation');
      expect(alert.detectedDueDate).toBe('2026-11-14T23:59:00.000Z');

      // Verbatim sentence offset check
      const fullText = `${announcements[0]!.title}\n${announcements[0]!.message}`;
      expect(fullText.slice(alert.charStart, alert.charEnd)).toBe(alert.verbatimSentence);
    });

    it('ignores non-deadline changes to prevent false positives', () => {
      const announcements = [
        {
          id: 'ann-102',
          courseId: '99001',
          title: 'Office Hours Location',
          message: 'Instructor office hours moved to Friday at 2:00 PM in Room 405.',
        },
      ];

      const knownAssignments = [
        {
          id: '1002',
          name: 'HW 2: Divide & Conquer',
          courseId: '99001',
          dueAt: '2026-11-12T23:59:00Z',
        },
      ];

      const alerts = scanAnnouncementsForChanges(announcements, knownAssignments);
      expect(alerts.length).toBe(0);
    });
  });
});
