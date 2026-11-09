# Local assistant

The assistant uses selected Canvas instructions and readable course materials with an installed Ollama model. The backend runs on this computer; the extension does not send Canvas credentials to it.

## Start

Install Python 3.11 or 3.12 and Ollama. Start Ollama, then run from the repository root:

```sh
make install
make assistant
```

The service listens at `http://127.0.0.1:8765`. Open **Assistant → Models**, check the connection, and choose an installed model. The selector uses the actual Ollama inventory. A completion model supports study generation; a vision model supports screenshots and photo transcription. The extension does not download model weights.

For background operation, run `make assistant-start` from `offcanvas`. Use `make assistant-restart` after backend code or configuration changes. Startup logs are in `offcanvas/.runtime/assistant.log`.

## Use

1. Choose a course and assignment in Assistant.
2. Add an optional focus question. Choose **A bit**, **A bit more**, or **Go all in**, and study or sample output.
3. Generate, inspect the source links, and review any access or evidence warnings.
4. Export HTML or Markdown. Open HTML in a browser to print to PDF.

Cancel stops the extension from waiting for or accepting a result; a local model may finish its current inference in the background. Switching courses or assignments clears the previous result. The backend keeps jobs in bounded memory and expires them after 30 minutes.

Study studio builds flashcards, practice, concept maps, and guided reading from selected material. Photo check requires confirmation of the transcription before critique. Command center supports briefings, study planning, and focus timers. Browser automation requires a separately configured [local Canvas copy](LOCAL_CANVAS.md).

## Plain-English explanations

The Overview briefing and each course's grade card are written by deterministic code from Canvas data, so they work without any model. **Explain this more simply** sends only the short list of facts behind that text (counts, marks, dates, assignment names) to `POST /api/v1/assistant/jobs` with type `explain`. The model is asked for two to four sentences in British English and must not add anything.

Every figure in the reply is checked against the supplied facts on both the backend and the extension. If the model invents a number, or the service is not running, the built-in briefing stays on screen with a short note. Nothing is sent beyond `127.0.0.1`.

## Reading materials

Canvas pages are read with the signed-in browser session. Accessible PDF, DOCX, HTML, text, and source files can be extracted locally. Files are limited to 12 MB. Scanned PDFs, encrypted files, unsupported formats, and restricted Canvas items produce access errors. Inaccessible content is never silently treated as evidence.

Optional public research sends topic queries to web providers. Turn it off to use course material only. Source citations and extracted quotes help review the result; they do not guarantee that every generated statement is correct.

## Memory and context

The default reasoning model is `qwen3:30b-a3b-thinking-2507-q8_0`. The configured context ceiling is 262,144 tokens on the 64 GB workstation; each model is capped at its advertised native context limit. To override it:

```sh
OFFCANVAS_CONTEXT_TOKENS=262144 make assistant
```

Supported values are 16,384–262,144. Each generation is capped at the selected model’s advertised native context length. Larger windows use more memory. Long source excerpts may be shortened with a warning. Assignment instructions and the student's request are preserved; requests that cannot fit return an actionable error before generation.

Automation stages reserve response space when fitting coursework, then may generate into the full remaining context window. The earlier 700–8,000 token per-stage response caps are removed. Detail levels still control the requested scope and word count. A response is accepted only after its complete JSON validates, including when Ollama reports its generation boundary. Generation requests allow up to one hour for long reasoning responses. Thinking-only models use their advertised supported mode and native sampling settings; their private reasoning trace is kept separate from the final JSON.

On this 64 GB Apple Silicon workstation, the local Ollama launch service uses flash attention and `q8_0` KV caching. Its context setting is `262144`, with `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_MAX_LOADED_MODELS=1` so concurrent full windows cannot multiply memory use. These settings are in the existing user LaunchAgent at `~/Library/LaunchAgents/sh.brew.ollama.plist`; a package-manager service reinstall may regenerate that file. Model weights retain their installed quantization. Smaller models still use their own advertised context limits. The full 262,144-token Qwen window was loaded successfully at approximately 43.5 GiB of model/GPU allocation.

The normal Ollama endpoint is `http://127.0.0.1:11434`. This workstation uses `http://127.0.0.1:11435` for the configured service so it can coexist with the Ollama menu-bar app on 11434. `offcanvas/.env` persists `OFFCANVAS_OLLAMA_URL` and `OFFCANVAS_CONTEXT_TOKENS`; both foreground and background backend starts load it, while explicit shell variables take precedence. Set `OFFCANVAS_OLLAMA_URL` to use another loopback HTTP origin. Remote model endpoints are rejected. Model size, context, and hardware affect generation time.

## Speech

Audio revision also requires local voice assets and the optional speech dependencies:

```sh
cd offcanvas
make speech-setup
```

Voice setup downloads assets. The UI reports missing assets and synthesis errors. Text study tools work without speech.

## Troubleshooting

- **Setup needed:** start the backend, verify its URL, and use **Check connection**.
- **No models:** start Ollama and install a suitable model through Ollama.
- **Generation error:** check the selected model, reduce the requested detail or context, and retry.
- **Material unavailable:** open it in Canvas to check your access or select another source.
- **Audio unavailable:** complete speech setup and restart the assistant.
