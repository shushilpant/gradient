# Command center

Open **Command center** above the workflow-mode chooser in the Canvas extension.
It is available in both manual and auto mode. `Ctrl+Shift+Space` (or
`Cmd+Shift+Space`) opens it, including when GRADIENT is minimized.

Canvas courses sync once when the workspace launches. Switching tools, workflow modes, or Canvas routes within the loaded page reuses the in-memory snapshot. An in-progress sync is shared rather than restarted. Use **Refresh Canvas data** to fetch updates explicitly; a full page reload starts a new session.

## Commands

- **Brief me for today** — outstanding and overdue work, upcoming deadlines,
  coursework changes, and links back to the synced Canvas sources.
- **Find eigenvectors** — searches discovered resource, assignment, and
  announcement titles and course codes. This is title search, not full-text indexing.
- **Prepare me for biology in 90 minutes** — builds a local schedule, reads
  accessible materials, and asks the installed local model for diagnostic questions,
  explanations, and analogous practice. Choose a course to disambiguate context.
- **Explain what I'm looking at** — explains selected page text, or the current
  page if nothing is selected, using readable course resources. It does not request
  a screenshot. Existing assessment-page restrictions still apply.
- **Teach it back** — starts the explanation workflow. Write or dictate your
  explanation and choose **Check my explanation** for source-grounded feedback.
- **I have 25 minutes. Get me started** — starts a focus session for the next
  pending plan block, or an outstanding assignment. Pause, resume, finish, and reflect.
- **Actually, I only have 40 minutes** — interrupts an active workflow and
  rebuilds the pending plan with the new budget, preserving completed blocks.
  If a focus timer exists, its remaining time is changed too. Previous study
  packets are retained; the student can generate a shorter one separately.
- **Move my study sessions to tomorrow** — replans all pending blocks starting
  at 8 AM tomorrow, preserving completed work. Other dates are not parsed yet.
- **Remember I prefer diagrams** — saves an editable account-scoped note.
- **Forget diagrams**, **Forget all**, or **Clear memory** — removes saved notes.
- **Stop** — interrupts the workflow and pauses a running focus session.

Unknown commands show help. Typed and spoken input share the same bounded command
router. A model cannot execute arbitrary browser operations or submit coursework.

## Voice

Use **Use voice**, speak, inspect the live transcript, and press **Run command**.
Speech recognition depends on browser support and microphone permission; the
browser's recognition provider may process audio online. Typing always works.
**Spoken replies** is opt-in; **Read latest** reads a briefing on demand. Both use local Kokoro-82M narration with the Heart voice rather than browser speech synthesis. Run `make speech-setup` on a fresh installation. Closing
the command center stops listening and speaking. No always-on microphone is used.

## Plans, changes, and memory

Plans use deadline order with assignment points as a tie-breaker, not the GPA
optimizer. Blocks are at most 25 minutes, have five-minute breaks, run between
8 AM and 10 PM in the browser timezone, avoid known Canvas calendar events, and
finish before known assignment deadlines. Missing personal calendar events cannot
be considered. Unallocated time is reported. Plans export as `.ics` files;
rescheduling and exporting do not update an external calendar automatically.

After a subsequent Canvas sync, changes to assignment deadlines, instructions,
or rubrics appear with source links. The first sync visible to the command center establishes the baseline.
Review a changed assignment before updating the plan.

Explicitly saved academic notes, local study blocks, and assignment baselines are
stored on-device, scoped to Canvas origin and user ID. Notes can be edited or
deleted in **Academic memory**; pending blocks can be cleared. Conversation logs,
student explanations, and generated packets are not persisted by this feature.
Notes are supplied to local AI study requests. This feature extends earlier
stateless workflows with explicit local persistence; it does not store grades.

Briefings, title search, scheduling, memory, and timers work without the AI backend.
Revision, explanation, and teach-back require `make assistant` and an installed
reasoning model. Source-access failures stay visible; model feedback is not a
verified grade or proof of mastery.

Interrupting aborts material requests and stops further polling and UI updates.
An inference job already accepted by the local service may finish in background.
Its stale result cannot replace a newer mission. Focus timers continue while the panel is minimized, but require the Canvas
workspace to remain loaded; they are not operating-system alarms.

## 90-second demo

1. Open Command center; run **Brief me for today** and point to Canvas links.
2. Run **Prepare me for [course] in 90 minutes**. Show the actual activity steps
   and study blocks, then the locally generated diagnostic questions.
3. Check a completed block. Say **Actually, I only have 40 minutes** and show
   the completed block surviving replanning.
4. Start **I have 25 minutes. Get me started**; pause and finish the session.
5. Explain a concept, choose **Check my explanation**, and save a useful
   learning preference with **Remember …**.
