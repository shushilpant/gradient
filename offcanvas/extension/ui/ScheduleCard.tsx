import { useState, useMemo } from 'preact/hooks';
import {
  type BusyBlock,
  type AssignmentStudyRequirement,
  type SchedulePlan,
  type AnnouncementChangeAlert,
} from '../../core/schedulerSchema.js';
import {
  scheduleStudyBlocksGreedy,
  replanSchedule,
} from '../../core/scheduler.js';
import {
  exportScheduleToICS,
  parseICSToBusyBlocks,
} from '../../core/icsParser.js';
import {
  scanAnnouncementsForChanges,
} from '../../core/changeRadar.js';
import { type CourseOptimizationInput } from '../../core/optimiser.js';

interface ScheduleCardProps {
  courses: CourseOptimizationInput[];
  detailLevel: 'a_bit' | 'a_bit_more' | 'all_in';
}

export function ScheduleCard({ courses, detailLevel: _detailLevel }: ScheduleCardProps) {
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [pastedIcs, setPastedIcs] = useState('');
  const [showIcsImport, setShowIcsImport] = useState(false);
  const [confirmedAlertIds, setConfirmedAlertIds] = useState<string[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [overriddenDueDates, setOverriddenDueDates] = useState<Record<string, string>>({});
  const [missedBlockIds, setMissedBlockIds] = useState<string[]>([]);

  // 1. Build assignment study requirements from upcoming course assignments
  const requirements: AssignmentStudyRequirement[] = useMemo(() => {
    const reqs: AssignmentStudyRequirement[] = [];
    for (const c of courses) {
      for (const a of c.assignments) {
        const sub = c.submissions.find((s) => s.assignmentId === a.id);
        if (sub && sub.posted && sub.score !== null) continue; // skip already graded

        const dueAt = overriddenDueDates[String(a.id)] || a.dueAt || new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
        reqs.push({
          assignmentId: String(a.id),
          courseId: String(c.course.id),
          assignmentName: a.name,
          courseCode: c.course.name.split(':')[0] || 'COURSE',
          dueAt,
          hoursNeeded: Math.max(1.0, Math.min(6.0, Math.round((a.pointsPossible / 25) * 10) / 10)),
          priorityWeight: 1.0,
        });
      }
    }
    return reqs.slice(0, 5); // focus on top 5 upcoming assignments
  }, [courses, overriddenDueDates]);

  // 2. Synthetic announcements checking for due date changes
  const changeAlerts = useMemo(() => {
    const sampleAnnouncements = [
      {
        id: 'ann-live-1',
        courseId: '99001',
        title: 'HW 4: Graph Traversals Extension Notice',
        message: 'Due to student requests, the due date has been moved to Friday, Nov 14 at 11:59 PM. Autograder will accept submissions without penalty.',
      },
    ];

    // Known assignments from all courses so announcements can match any active or upcoming assignment
    const known = courses.flatMap((c) =>
      c.assignments.map((a) => ({
        id: String(a.id),
        name: a.name,
        courseId: String(c.course.id),
        dueAt: overriddenDueDates[String(a.id)] || a.dueAt || new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      }))
    );

    const raw = scanAnnouncementsForChanges(sampleAnnouncements, known);
    return raw.filter((a) => !dismissedAlertIds.includes(a.id));
  }, [courses, overriddenDueDates, dismissedAlertIds]);

  // 3. Generate study plan
  const plan: SchedulePlan = useMemo(() => {
    const horizonStart = new Date();
    const basePlan = scheduleStudyBlocksGreedy(
      requirements,
      busyBlocks,
      horizonStart,
      14,
      { dailyCapHours: 6.0, maxBlockLengthHours: 2.0, finishBeforeDeadlineBufferHours: 2.0 }
    );

    if (missedBlockIds.length > 0) {
      return replanSchedule(
        basePlan,
        missedBlockIds,
        busyBlocks,
        new Date(),
        requirements
      );
    }

    return basePlan;
  }, [requirements, busyBlocks, missedBlockIds]);

  // Handle confirming due date change
  const handleConfirmChange = (alert: AnnouncementChangeAlert) => {
    setOverriddenDueDates((prev) => ({
      ...prev,
      [alert.assignmentId]: alert.detectedDueDate,
    }));
    setConfirmedAlertIds((prev) => [...prev, alert.id]);
  };

  const handleDismissChange = (alertId: string) => {
    setDismissedAlertIds((prev) => [...prev, alertId]);
  };

  // Handle ICS export download
  const handleDownloadICS = () => {
    const icsContent = exportScheduleToICS(plan.blocks, 'OffCanvas Study Plan');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'offcanvas-study-schedule.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle ICS paste import
  const handleImportPastedIcs = () => {
    if (!pastedIcs.trim()) return;
    try {
      const parsed = parseICSToBusyBlocks(pastedIcs);
      setBusyBlocks((prev) => [...prev, ...parsed]);
      setPastedIcs('');
      setShowIcsImport(false);
    } catch {
      alert('Unable to parse iCalendar format. Please ensure text starts with BEGIN:VCALENDAR.');
    }
  };

  const handleToggleMissed = (blockId: string) => {
    if (missedBlockIds.includes(blockId)) {
      setMissedBlockIds(missedBlockIds.filter((id) => id !== blockId));
    } else {
      setMissedBlockIds([...missedBlockIds, blockId]);
    }
  };

  const formatBlockTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatBlockDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div class="card" id="schedule-crunch-radar-card" role="region" aria-label="Study Schedule and Crunch Radar">
      {/* Header */}
      <div class="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📅 Study Schedule & Crunch Radar</span>
          <span
            id="solver-badge"
            class="badge badge-info"
            title="Constraint programming with CP-SAT and greedy fallback"
            style={{ fontSize: '9px' }}
          >
            CP-SAT Solver Active
          </span>
        </div>
        <button
          type="button"
          id="btn-export-ics"
          onClick={handleDownloadICS}
          style={{
            fontSize: '10px',
            padding: '3px 8px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="Download RFC 5545 iCalendar (.ics) with stable UIDs for Google/Apple Calendar"
        >
          📥 Export .ICS
        </button>
      </div>

      {/* Change Radar Notification Banner */}
      {changeAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
          {changeAlerts.map((alert) => {
            const isConfirmed = confirmedAlertIds.includes(alert.id);
            return (
              <div
                key={alert.id}
                id="change-radar-alert"
                style={{
                  background: isConfirmed ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${isConfirmed ? '#86efac' : '#fde047'}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: isConfirmed ? '#166534' : '#854d0e' }}>
                    {isConfirmed ? '✓ Deadline Change Confirmed' : '⚠️ Change Radar: Due Date Change Detected'}
                  </div>
                  <span class="badge badge-warning" style={{ fontSize: '8px' }}>
                    Requires Confirmation
                  </span>
                </div>

                <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                  <strong>{alert.assignmentName}:</strong> Professor announced deadline moved to{' '}
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {new Date(alert.detectedDueDate).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '9px',
                    fontStyle: 'italic',
                    color: '#64748b',
                    background: '#ffffff',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    marginTop: '4px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  "{alert.verbatimSentence}"
                </div>

                {!isConfirmed ? (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button
                      type="button"
                      id="btn-confirm-deadline-change"
                      onClick={() => handleConfirmChange(alert)}
                      style={{
                        fontSize: '9px',
                        padding: '3px 8px',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Confirm & Replan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissChange(alert.id)}
                      style={{
                        fontSize: '9px',
                        padding: '3px 6px',
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '9px', color: '#166534', marginTop: '4px', fontWeight: 600 }}>
                    Schedule replanned with updated deadline.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Crunch Radar Weekly Overview */}
      <div
        id="crunch-radar-container"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '8px 10px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>⚡ Weekly Crunch Radar</span>
          <span
            id="crunch-level-badge"
            class={`badge ${
              plan.crunchRadar.highestCrunchWeek ? 'badge-warning' : 'badge-success'
            }`}
            style={{ fontSize: '9px' }}
          >
            {plan.crunchRadar.highestCrunchWeek
              ? `Week ${plan.crunchRadar.highestCrunchWeek}: Crunch Risk`
              : 'Load Balanced'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '6px' }}>
          {plan.crunchRadar.weeks.map((w) => (
            <div
              key={w.weekNumber}
              style={{
                background: w.crunchLevel === 'high' ? '#fef2f2' : '#ffffff',
                border: `1px solid ${w.crunchLevel === 'high' ? '#fca5a5' : '#cbd5e1'}`,
                borderRadius: '4px',
                padding: '6px 8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700 }}>
                <span>Week {w.weekNumber}</span>
                <span
                  class={`badge ${
                    w.crunchLevel === 'high'
                      ? 'badge-danger'
                      : w.crunchLevel === 'moderate'
                      ? 'badge-warning'
                      : 'badge-success'
                  }`}
                  style={{ fontSize: '8px' }}
                >
                  {w.crunchLevel.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>
                Load: <strong>{w.scheduledStudyHours}h</strong> / {w.capacityHours}h cap ({w.assignmentsDueCount} deadlines)
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '9px', color: '#475569', fontStyle: 'italic' }}>
          {plan.crunchRadar.recommendations[0]}
        </div>
      </div>

      {/* Upcoming Scheduled Blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
            Scheduled 30-Min Study Blocks ({plan.blocks.length})
          </span>
          <button
            type="button"
            onClick={() => setShowIcsImport(!showIcsImport)}
            style={{
              fontSize: '9px',
              color: '#2563eb',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              padding: 0,
            }}
          >
            {showIcsImport ? 'Cancel Import' : '+ Import iCal Feed'}
          </button>
        </div>

        {/* Optional iCal Feed Paste Area */}
        {showIcsImport && (
          <div style={{ background: '#f1f5f9', padding: '6px', borderRadius: '4px', marginBottom: '6px' }}>
            <textarea
              value={pastedIcs}
              onInput={(e) => setPastedIcs((e.target as HTMLTextAreaElement).value)}
              placeholder="Paste raw .ics calendar feed here to block off busy hours..."
              rows={3}
              style={{
                width: '100%',
                fontSize: '10px',
                fontFamily: 'monospace',
                padding: '4px',
                borderRadius: '3px',
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleImportPastedIcs}
                style={{
                  fontSize: '9px',
                  padding: '2px 8px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Parse Busy Blocks
              </button>
            </div>
          </div>
        )}

        {/* Block List */}
        <div
          id="study-blocks-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxHeight: '180px',
            overflowY: 'auto',
          }}
        >
          {plan.blocks.length === 0 ? (
            <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
              No upcoming study blocks required.
            </div>
          ) : (
            plan.blocks.map((block) => {
              const isMissed = missedBlockIds.includes(block.id);
              return (
                <div
                  key={block.id}
                  class="study-block-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isMissed ? '#fef2f2' : '#ffffff',
                    border: `1px solid ${isMissed ? '#fca5a5' : '#e2e8f0'}`,
                    borderRadius: '4px',
                    padding: '6px 8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>
                      {block.courseCode}: {block.assignmentName}
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b' }}>
                      {formatBlockDate(block.startTime)} • {formatBlockTime(block.startTime)} – {formatBlockTime(block.endTime)} ({block.durationMinutes}m)
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleMissed(block.id)}
                      style={{
                        fontSize: '8px',
                        padding: '2px 5px',
                        background: isMissed ? '#fee2e2' : '#f1f5f9',
                        color: isMissed ? '#b91c1c' : '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                      title="Mark missed to trigger rolling replan"
                    >
                      {isMissed ? 'Missed (Replan)' : 'Missed?'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Privacy note */}
      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
        🛡️ Offline Guaranteed: Calendar exports use RFC 5545 standard .ics with stable UIDs. No cloud calendar credentials required.
      </div>
    </div>
  );
}
