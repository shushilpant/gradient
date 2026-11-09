import { type StudyBlock, type BusyBlock } from './schedulerSchema.js';

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  let folded = '';
  let length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) { folded += '\r\n '; length = 1; }
    folded += char;
    length += bytes;
  }
  return folded;
}

/**
 * Formats a Date object or ISO string into RFC 5545 iCalendar format: YYYYMMDDTHHMMSSZ.
 */
export function formatIcsDate(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Parses an iCalendar date string (e.g. 20261114T143000Z or 20261114) into an ISO string.
 */
export function parseIcsDate(icsDateStr: string): string {
  const clean = icsDateStr.trim().replace(/^VALUE=DATE:/, '');

  // Format: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const dateTimeMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTimeMatch) {
    const [, y, m, d, hh, mm, ss, isUtc] = dateTimeMatch;
    if (isUtc === 'Z') {
      return new Date(Date.UTC(+y!, +m! - 1, +d!, +hh!, +mm!, +ss!)).toISOString();
    } else {
      // Local or floating time -> treat as UTC for consistency
      return new Date(Date.UTC(+y!, +m! - 1, +d!, +hh!, +mm!, +ss!)).toISOString();
    }
  }

  // Format: YYYYMMDD (all day event)
  const dateMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return new Date(Date.UTC(+y!, +m! - 1, +d!, 0, 0, 0)).toISOString();
  }

  // Fallback to Date.parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  throw new Error(`Unable to parse iCalendar date string: "${icsDateStr}"`);
}

/**
 * Exports study blocks to standard RFC 5545 iCalendar (.ics) format.
 * Guarantees stable UIDs per block across replans to update rather than duplicate events.
 */
export function exportScheduleToICS(
  blocks: StudyBlock[],
  calendarName = 'OffCanvas Study Schedule'
): string {
  const nowStamp = formatIcsDate(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OffCanvas//Study Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const block of blocks) {
    const dtStart = formatIcsDate(block.startTime);
    const dtEnd = formatIcsDate(block.endTime);
    const summary = `[OffCanvas] Study: ${block.assignmentName} (${block.courseCode})`;
    const description = `Block ${block.blockIndex + 1} of ${block.totalBlocks} (${block.durationMinutes} min)\nAssignment: ${block.assignmentName}\nCourse: ${block.courseCode}\nStatus: ${block.status.toUpperCase()}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(block.id)}`,
      `SEQUENCE:${block.sequence}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Parses an iCalendar (.ics) feed string into BusyBlocks for the scheduler.
 */
export function parseICSToBusyBlocks(icsString: string): BusyBlock[] {
  const busyBlocks: BusyBlock[] = [];
  const lines = icsString.split(/\r\n|\n|\r/);

  // Unfold lines that start with space or tab
  const unfoldedLines: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfoldedLines.length > 0) {
      unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
    } else if (line.trim().length > 0) {
      unfoldedLines.push(line.trim());
    }
  }

  let inEvent = false;
  let currentUid: string | null = null;
  let currentSummary = 'Busy';
  let currentStart: string | null = null;
  let currentEnd: string | null = null;

  for (const line of unfoldedLines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentUid = null;
      currentSummary = 'Busy';
      currentStart = null;
      currentEnd = null;
    } else if (line === 'END:VEVENT') {
      if (inEvent && currentStart && currentEnd) {
        busyBlocks.push({
          id: currentUid || `busy-${busyBlocks.length + 1}-${Date.now()}`,
          title: currentSummary,
          startTime: currentStart,
          endTime: currentEnd,
          source: 'pasted_ical',
        });
      }
      inEvent = false;
    } else if (inEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const propPart = line.slice(0, colonIndex);
        const valuePart = line.slice(colonIndex + 1);
        const propName = propPart.split(';')[0]!.toUpperCase();

        if (propName === 'UID') {
          currentUid = valuePart;
        } else if (propName === 'SUMMARY') {
          currentSummary = valuePart.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
        } else if (propName === 'DTSTART') {
          try {
            currentStart = parseIcsDate(valuePart);
          } catch {
            // Ignore unparseable date
          }
        } else if (propName === 'DTEND') {
          try {
            currentEnd = parseIcsDate(valuePart);
          } catch {
            // Ignore unparseable date
          }
        }
      }
    }
  }

  return busyBlocks;
}

