# Local assistant

The assistant uses selected Canvas instructions and readable course materials with an installed Ollama model. The backend runs on this computer; the extension does not send Canvas credentials to it.

## Start

Install Python 3.11 or 3.12 and Ollama. Start Ollama, then run from the repository root:

```sh
make install
make assistant
```

The service listens at `http://127.0.0.1:8765`. Open **Assistant → Models**, check the connection, and choose an installed model. The selector uses the actual Ollama inventory. A completion model supports study generation; a vision model supports screenshots and photo transcription. The extension does not download model weights.

For background operation, run `make assistant-start` from `gradient`. Use `make assistant-restart` after backend code or configuration changes. Startup logs are in `gradient/.runtime/assistant.log`.

## Use

1. Choose a course and assignment in Assistant.
2. Add an optional focus question. Choose **A bit**, **A bit more**, or **Go all in**, and study or sample output.
3. Generate, inspect the source links, and review any access or evidence warnings.
4. Export HTML or Markdown. Open HTML in a browser to print to PDF.

Cancel stops the extension from waiting for or accepting a result; a local model may finish its current inference in the background. Switching courses or assignments clears the previous result. The backend keeps jobs in bounded memory and expires them after 30 minutes.

Study studio builds flashcards, practice, concept maps, and guided reading from selected material. Photo check requires confirmation of the transcription before critique. Command center supports briefings, study planning, and focus timers. Browser automation requires a separately configured [local Canvas copy](LOCAL_CANVAS.md).

## Reading materials

Canvas pages are read with the signed-in browser session. Accessible PDF, DOCX, HTML, text, and source files can be extracted locally. Files are limited to 12 MB. Scanned PDFs, encrypted files, unsupported formats, and restricted Canvas items produce access errors. Inaccessible content is never silently treated as evidence.

Optional public research sends topic queries to web providers. Turn it off to use course material only. Source citations and extracted quotes help review the result; they do not guarantee that every generated statement is correct.

## Memory and context

The default context is 16,384 tokens. To allow a larger context:

```sh
GRADIENT_CONTEXT_TOKENS=32768 make assistant
```

Supported values are 16,384–131,072. Larger windows use more memory. Long source excerpts may be shortened with a warning. Assignment instructions and the student's request are preserved; requests that cannot fit return an actionable error before generation.

Ollama normally listens at `http://127.0.0.1:11434`. Set `GRADIENT_OLLAMA_URL` before starting the backend to use another loopback HTTP origin. Remote model endpoints are rejected. Model size, context, and hardware affect generation time.

## Speech

Audio revision also requires local voice assets and the optional speech dependencies:

```sh
cd gradient
make speech-setup
```

Voice setup downloads assets. The UI reports missing assets and synthesis errors. Text study tools work without speech.

## Troubleshooting

- **Setup needed:** start the backend, verify its URL, and use **Check connection**.
- **No models:** start Ollama and install a suitable model through Ollama.
- **Generation error:** check the selected model, reduce the requested detail or context, and retry.
- **Material unavailable:** open it in Canvas to check your access or select another source.
- **Audio unavailable:** complete speech setup and restart the assistant.
