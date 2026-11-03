# Local AI study assistant

GRADIENT's Assistant view combines your Canvas assignment and selected course
material with an installed local Ollama model. It can produce a sourced study guide
or a separate, clearly labeled sample assignment. The extension does not submit
work or change Canvas records.

## Run the backend

Install [Ollama](https://ollama.com/download) and start the Ollama app, or run
`ollama serve`. From the `gradient` directory, install the project's Python
dependencies and start the local service:

```sh
uv venv backend/.venv --python 3.12
uv pip install --python backend/.venv/bin/python -e './backend[dev]'
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

If `backend/.venv` already exists, skip its creation. The setup requires Python
3.11 or newer. The backend binds to loopback only. In Assistant's model setup,
keep the backend URL at `http://127.0.0.1:8765`, check the connection, and select
an installed model. The backend reads actual names, model sizes and capabilities
from Ollama; it does not assume a model alias exists or download weights.

For this M5 Max with 18 CPU cores, 40 GPU cores and 64 GB unified memory, the
default pair uses models that were already installed:

| Role | Installed model | Model file size | Why this default |
| --- | --- | --- | --- |
| Coursework reasoning | `gpt-oss:20b` | About 13 GB | Fast local reasoning with low thinking effort |
| Screenshot/page inspection | `gemma4:e4b` | About 6.3 GB | Smaller installed vision-capable companion |
| Alternative reasoning/vision | `gemma4:31b` | About 19 GB | Available in the selector when a different answer is useful |

A short local arithmetic/JSON probe produced approximately 106 output tokens/sec
with GPT-OSS 20B and 25 tokens/sec with Gemma 4 31B, both returning the expected
answer. Gemma 4 E4B correctly identified the extension's name in a screenshot
probe in about 1.94 seconds. These are small task-specific smoke tests, not a
comprehensive model-quality or computer-use benchmark. E4B is the vision default,
while quantitative coursework defaults to GPT-OSS. Actual response times vary
with prompt size, output length, model loading and memory pressure.

The installed Qwen model has the exact name
`qwen3:30b-a3b-thinking-2507-q8_0` (about 32 GB), and can also be selected.
The shorter `qwen3:30b` and `qwen3:8b` names were not installed during setup;
they are not treated as aliases for installed weights. If you later want those
specific models, download them explicitly outside the extension:

```sh
ollama pull qwen3:8b
ollama pull qwen3:30b
ollama pull qwen3-vl:8b
```

You need one reasoning model; the vision model is optional. Runtime memory is
higher than the model file size and depends on context and hardware.
Models are released from Ollama memory after a response to leave room for the
other model. Generic-title topic extraction briefly keeps the reasoning model
warm before the main generation. Future Qwen tags and sizes are documented in the
[Qwen3 registry](https://ollama.com/library/qwen3/tags) and
[Qwen3-VL registry](https://ollama.com/library/qwen3-vl/tags).

Ollama normally listens at `http://127.0.0.1:11434`. To use another local port,
set `GRADIENT_OLLAMA_URL` to a loopback HTTP origin before starting the backend.
Remote Ollama URLs are deliberately rejected. The extension's configured URL is
the backend URL, not Ollama's URL.

## Using it

1. Sign in to Canvas, let GRADIENT sync, and open Assistant.
2. Select the course and assignment. The brief and selected readable course
   resources form the reference context. Canvas pages are read with your current
   browser session; file contents are passed to the local backend without cookies
   or Canvas credentials.
3. Choose **A bit**, **A bit more**, or **Go all in**. These change the model's
   output budget, requested explanation depth, maximum research sources and
   useful visual count, rather than simply hiding parts of the same response.
4. Choose a study guide or sample assignment, add your question, and generate.
   Read the source cards and access warnings before relying on the result.

Text PDFs, DOCX, HTML, plain text and source files are supported for local file
extraction. File input is limited to 12 MB. DOCX extraction rejects oversized
archives and XML entity declarations. PDF extraction reads up to 100 pages and
returns a maximum 60,000-character excerpt. Scanned PDFs without text layers,
password-protected documents and unsupported formats return explicit errors.
The backend's Python dependencies include `pypdf` for text PDFs.

Study guides can include labeled node-and-edge diagrams and numeric bar graphs.
Graphs must be grounded in supplied data or labeled as illustrative; AI-generated
calculations still need checking. Relevant publicly retrieved images include an
original source link. Image availability depends on accessible source pages;
the assistant does not invent images, experiments or missing citations.

## Vision companion

The backend advertises only actually installed vision-capable models for the
screenshot selector. On this machine that includes Gemma 4 E4B and Gemma 4 31B,
as verified through Ollama's `/api/show` capabilities. A text-only model such as
GPT-OSS 20B is rejected if a screenshot is supplied to it.

The original Qwen-based pairing is still supported if installed. Qwen3-VL 8B
accepts screenshots and is
designed for visual grounding and GUI reasoning. Its official implementation
includes [computer-use tools](https://github.com/QwenLM/Qwen3-VL/blob/main/cookbooks/utils/agent_function_call.py),
and the [model documentation](https://ollama.com/library/qwen3-vl) describes
visual agent capabilities. Qwen3-VL requires a recent Ollama release (the model
documentation specifies 0.12.7 or newer).

GRADIENT uses that capability for **bounded, read-only browser assistance**:
inspect the current Canvas page, read its text, optionally analyze a screenshot,
and propose steps to find assignments or files. Navigation proposals must match
links present in the supplied page context, remain on the same origin, and pass
path restrictions. The frontend lets you review proposals. This is not a desktop
agent with arbitrary mouse, keyboard, shell or application control. It does not
take quizzes, submit assignments, sign out, or execute code from model output.

## What leaves your device

- With web research off, the backend forwards the included assignment, prompt
  and material text only to local Ollama. Screenshots are sent to local Ollama
  only when included in a browser-assistance request.
- With web research on, a short query made from the **assignment title** plus
  generic research terms goes to DuckDuckGo. If DuckDuckGo is unavailable or
  returns no usable results, Wikipedia/Crossref topic discovery is used. These
  providers receive the same public topic query with generic request words
  removed. This fallback finds encyclopedia pages and scholarly works; its
  coverage is narrower than a full web search, and the response discloses it.
  For generic titles such as
  "Homework 3", the local model first extracts broad academic topic phrases
  from the selected brief, question and material titles. Only those phrases,
  rather than the full brief, go to search. A title or inferred topic can itself
  contain private information; switch off research when that matters. The full assignment body,
  student/account information, course context, Canvas cookies and session tokens
  are not sent to the search provider. Public research pages are fetched without
  cookies or credentials.
- Remote images, when displayed, are requested from their original public host.
  Model downloads contact Ollama's model registry.
- Assignments and generated responses are not written to a backend database.
  Background job results stay in RAM for up to 30 minutes, capped at 24 jobs.
  Restarting the service clears them. Ollama itself manages its model files and
  logs according to its configuration. The extension can retain local settings.

The service accepts browser origins belonging to Chrome extensions or loopback
apps. Assistant POSTs require `X-Gradient-Client: gradient-extension`. Public
page fetching allows only HTTPS, rejects private/reserved addresses and unusual
ports, pins the checked IP for each request, validates TLS for the original
hostname, and revalidates every redirect. The service never fetches Canvas
private URLs or receives Canvas credentials.

## Calendar behavior

Canvas remains the deadline source of truth. Use the extension's calendar export
for Apple Calendar and Google Calendar import, or a Google Calendar event link
for a selected assignment. This workflow does not establish OAuth calendar
access or continuous background calendar synchronization; imported dates should
be refreshed after Canvas deadlines change.

## API and verification

The extension proxies requests through its service worker to the local backend,
avoiding Canvas page CORS restrictions. Long inference runs use a job API so a
single browser fetch does not outlive an MV3 service worker's response window.
One inference job runs at a time to avoid loading both large models together;
up to four requests can be queued.

All routes below start with `/api/v1/assistant`:

| Route | Purpose |
| --- | --- |
| `GET /health` | Local Ollama connection, installed names/sizes/capabilities, recommended pair and download states |
| `POST /models/pull` | Start an allowlisted model download; returns HTTP 202 |
| `POST /jobs` | `{type: "generate" or "browser", request: {...}}`; returns job ID |
| `GET /jobs/{id}` | Running, complete/result, or error; expired jobs return 404 |
| `POST /generate` | Synchronous study guide/sample generation, for CLI and tests |
| `POST /browser/plan` | Synchronous bounded read-only visual navigation suggestions |
| `POST /materials/extract` | Decode an explicitly supplied base64 local document |
| `POST /research/read` | Read a public HTTPS HTML/text page |

The generation call uses Ollama's documented
[chat API](https://docs.ollama.com/api/chat) with
[schema-constrained output](https://docs.ollama.com/capabilities/structured-outputs).
The backend validates the output again, checks finite graph values, verifies
diagram edge references, and returns only sources retrieved from actual Canvas
context or search results. Unavailable web search, incomplete pages, missing
models and malformed model output produce explicit warnings or errors.
Source IDs refer only to retrieved source records; model-generated citations
cannot add a URL or create a source. A Crossref abstract or a search snippet is
reference metadata, not evidence that a publisher's full text was accessible.

Model names must exactly match a current local `/api/tags` entry, and cloud
models are rejected. Metadata is cached by model digest; health checks query
`/api/show` concurrently without loading model weights. GPT-OSS uses `think: low`;
models that advertise boolean thinking use `think: false`; non-thinking models
receive no thinking parameter. Detail levels reserve 8K, 12K or 16K context
respectively. The backend balances material excerpts within the input budget
and reserves output capacity; it warns when long references were shortened.

Run the backend tests from `gradient`:

```sh
backend/.venv/bin/python -m pytest backend/test_backend.py backend/test_local_assistant.py
```

These tests mock Ollama and search to verify contracts and failure paths without
downloading a model or accessing an account. They also exercise real text-PDF
and DOCX extraction. A live model response still requires a running Ollama
installation and enough memory; a successful mocked test does not establish
real-world answer quality.

The full live job flow was also checked on this Mac using synthetic interval-scheduling
coursework, the installed GPT-OSS 20B model, and public research. It completed in
about 28 seconds with a labeled sample, one concept diagram, and four actual
sources: the supplied brief, two Wikipedia topic pages, and a Crossref-discovered
paper. The unavailable general search and the paper's partial access were disclosed
in the packet. This verifies the local research-to-export contract, not the quality
of every answer or access to a particular student's Canvas account.

## Reliable general web search

Set `GRADIENT_BRAVE_SEARCH_API_KEY` in the environment that starts `make assistant`, then restart the backend. The key stays in the local process and is sent only as an authentication header to `api.search.brave.com`; API redirects are rejected. Obtain a key from https://brave.com/search/api/ and review the provider plan before enabling it. Topic searches use the configured API first; failed or unconfigured providers retain the disclosed Wikipedia/Crossref fallback. Never put the key in extension settings or commit it to source control. Existing packets retain their original warnings; generate a new packet after configuration.

## Google search (default)

The default general-search provider is now `https://www.google.com/search`. The backend extracts public result links when returned. Google may instead require JavaScript, consent or a human challenge; GRADIENT does not bypass these. In that case, the packet explicitly reports Google access failure and uses Wikipedia/Crossref discovery. **Open Google search** in Assistant opens the selected assignment topic in your normal browser. This link sends the assignment title and entered focus text to Google when clicked. Previously generated packets are unchanged.

## Browser-powered Google research

Reload the extension after building, restart the backend, then click **Enable Google browser search** in Assistant and approve the optional permission for `www.google.com`. This lets GRADIENT open a temporary Google search tab and read actual rendered result titles, links and snippets using your normal browser. It requires no search API key. Successful temporary tabs close automatically; if Google needs consent or a human challenge, the tab remains open for you to handle and the app reports the limitation. The backend reads discovered public sources using its existing bounded fetcher. It cannot bypass paywalls, site restrictions, or challenges. Search queries include the selected assignment title. The extension never injects model-generated code into a website.
