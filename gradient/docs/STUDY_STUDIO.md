# Study studio

Open **Study studio** and choose a course. Open Flashcards, Practice, Concept map,
Listen, or Guided reading directly. Every screen includes **Choose material**:
select a course page, file, or previously imported source, then use the primary
button to import and prepare that tool in one step. You remain on the selected
tool when it is ready. Guided reading opens original text without AI generation.
There is no required trip through Sources. Sources remains available for advanced
source management, web research, and building a shared study set.

Generation uses the configured local reasoning model (`make assistant`); saved
practice and review tracking work without the model. Changing tools interrupts
pending preparation and retains existing study data.

The six tools share one source collection and study set per course and account:

- **Sources:** explicitly choose Canvas material, research web topics, inspect
  candidate excerpts, and import useful ones. Web excerpts are labeled as excerpts,
  not full documents. Research uses the existing assistant research integration.
- **Flashcards:** reveal answers, record understood/missed concepts, review missed
  cards again, and export CSV. Regenerating replaces the current set and history.
- **Practice:** answer multiple-choice questions with randomized option positions,
  immediate explanations, and supporting passages. Due/missed cards come first,
  followed by unseen cards and then cards already scheduled for later review.
- **Concept map:** explore source-backed concepts, see parent-topic relationships,
  inspect evidence, and jump into related practice. Relationships are model-generated.
- **Listen:** play Kokoro-82M neural revision chapters, adjust speed, pause/resume,
  inspect the transcript, and interrupt a chapter to explore/practice the concept.
  Choose Heart, Bella, Michael, Emma, or George. WAV audio and transcripts can be downloaded.
- **Guided reading:** move through original imported passages and reveal related
  questions and answers where a question's evidence matches the passage.

Every generated card and concept selects an indexed source passage. The server
attaches the exact original text, so PDF line wraps do not depend on model copying.
Unmatched evidence is removed and one automatic repair is attempted. Smaller
verified sets are retained; a set with no verified questions fails explicitly. This validates provenance,
not factual correctness of AI explanations or answer options. Questions need four
distinct options with exactly one matching the declared correct answer.

Missed reviews return after ten minutes. Successful reviews advance to one day,
then double with consecutive success up to thirty days. This is a transparent
simple interval algorithm, not a calibrated prediction of memory retention.
**Schedule 15-minute review** exports a proposed calendar event before the next
known deadline when possible. Review personal conflicts before importing it.

Sources, study sets, and progress are stored on-device, scoped to Canvas account
and course. **Manage saved study data** deletes the current course's studio data.
Locked/unreadable materials remain excluded. Switching tools stops audio; closing
or minimizing the workspace stops playback. Narration runs locally through Kokoro-82M and the ONNX runtime; no cloud audio provider or API key is required. Run `make speech-setup` on a fresh installation, then `make assistant-restart`. The runtime is MIT-licensed and the model is Apache-2.0-licensed. Model and voice weights are stored in `.runtime/tts`; generated audio remains in process/browser memory until downloaded.
