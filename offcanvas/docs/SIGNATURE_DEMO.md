# Five signature demo flows

## Grade Lab: live GPA fan chart

Open **Grade lab**. Drag a course's remaining-study-hours slider and watch the
median and percentile bands animate. Fixed-seed common random numbers keep the
scenario comparison stable; contexts/noise are built once and up to 64 results
are cached. The animation honors reduced-motion preferences. This is local math,
with no model or network requirement after Canvas sync.

The horizontal axis is the fraction of the selected effort budget applied, not
calendar time. Hours are remaining effort, not recurring weekly hours. Effort is
spread evenly over eligible unfinished assignments, capped by the existing
per-assignment limits. Posted scores stay fixed. The outcome combines GPA samples
using credit-hour weights. Credits default to 3 unless entered in Settings.
Learning curves, ceilings and noise remain assumptions, not predictions of grades.

Scroll to **Why is my grade this?**. Each contribution bar begins where the prior
one ends and sums to the computed grade. Expand a group to inspect counted points,
normalized weight, and dropped assignment names. A counterfactual disables drop
rules to show their effect. The current grade excludes unposted/ungraded scores;
the unfinished-as-zero scenario is shown separately and is not a forecast.

## Photo Check: read, confirm, critique

Open **Photo check**, optionally select an assignment, and confirm it is ordinary
homework. Upload a photo or enable the webcam explicitly and take one. Uploaded
images are resized to at most 1800 pixels on their longest side. The installed
vision model transcribes the work and flags uncertainty; it does not correct or
complete the student's answer.

Review/edit the transcription and check the confirmation before requesting rubric
feedback. This reuses the existing descriptor-alignment and verbatim-evidence
critique engine. Without a course rubric, the UI labels the general clarity
criterion. Feedback is not mathematical proof or a predicted score. Exam/quiz
routes retain their existing block. Photo jobs reject assessment descriptions.
Camera denial has an upload fallback; typed work also works. Camera tracks stop
when leaving the tool. Generated test imagery is not real student work.

A live local-model smoke test used a synthetic handwriting-style sheet containing
`2x + 3 = 11`, `2x = 8`, `x = 4`; the installed Gemma vision model read all lines.
This does not establish accuracy for arbitrary handwriting or stage lighting.

## Provenance inspection

Generated packets in Assistant and Command center recognize supplied `[S1]` style
citations. Hover or focus a citation to inspect its source beside the answer;
clicks also open it. The view shows the supplied excerpt highlighted, with nearby
source context when readable text was available. On narrow mobile widths it
stacks vertically. Original-source links are explicit actions. Unknown citations
stay marked without invented evidence. Uncited statements do not acquire a false
source, and citation presence does not independently validate a claim.

## Phone packet sharing

On a generated packet, click **Share packet to phone**. This explicitly starts a
separate read-only listener on port 8767 and creates an unguessable link and QR.
The phone and computer must share a network that permits peer connections. The
assistant API remains on localhost. The computer and assistant must stay running.

The mobile page includes the labeled packet, references, and computed PNG figures.
Text is escaped; no model HTML/scripts execute. Packets live only in RAM, expire
after 20 minutes, and can be revoked immediately. At most five active links are
allowed. Anyone with a link on that network can read it. Restarting the assistant
clears links. No external hosting or automatic external upload is involved.

LAN HTTP retrieval and revoke-to-404 were verified from the computer's LAN address.
School Wi-Fi may isolate devices or block the port; use the existing illustrated
HTML export in that case. Do not show a QR that points at `localhost`.

## Suggested 90-second sequence

1. Drag two GPA sliders; point to the changing percentile band.
2. Expand one grade group and identify the actual drop-rule effect.
3. Hover a packet citation to reveal its source in the second pane.
4. Read a homework photo, confirm the transcription, then show rubric pointers.
5. Create the packet QR and scan it on a phone connected to the same Wi-Fi.

Before presenting, test the actual demo network, microphone/camera permissions,
and the selected local models. Keep an exported packet and a clear sample photo
available as backups.
