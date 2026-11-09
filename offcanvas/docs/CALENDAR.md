# Assignment deadlines and calendar reminders

Open **Settings** in the Canvas workspace and select **Track deadlines**. OffCanvas stores the current account's assignment titles, course names, deadlines, Canvas links, and reminder selections in Chrome's local extension storage. Assignment content and submissions are not stored by this feature.

The extension schedules browser notifications 24 hours and 1 hour before each selected, unsubmitted assignment deadline. Chrome must be running and its notifications must be allowed by your operating system. A Canvas tab does not need to remain open. Enabling reminders after a reminder time has passed schedules only the remaining future reminders.

Refresh OffCanvas when deadlines change or work is submitted. Every successful Canvas sync replaces the tracked schedule for that account, removes completed work, and cancels obsolete reminders. Tracking does not make background requests to Canvas or discover deadline changes while Canvas is closed. Pausing reminders cancels that account's alarms; selections remain saved. Individual checkboxes also control calendar export.

**Apple / Google .ics** downloads the selected upcoming deadlines, including 24-hour and 1-hour reminder requests. Import the file into Apple Calendar, Google Calendar, or another calendar that supports iCalendar. Import behavior and reminder support depend on the calendar application. Stable event UIDs are preserved across exports, but some importers may create duplicates on repeated imports.

**Add to Google Calendar** opens a prepared event for review and saving in the Google account you choose. OffCanvas does not have OAuth calendar access and does not claim events were saved automatically. Calendar copies are not a live subscription. Changes in Canvas require a fresh export or a manual event update in your calendar.

The local demo permits calendar previews but disables browser reminder activation, so synthetic assignments cannot create notifications.
