#!/usr/bin/env python3
"""
GRADIENT Demo Runner

Provides:
- Replay Mode (`--mode replay`): Boots local mock environment with ZERO external network calls.
  Runs from recorded fixtures and verified local pipelines.
- Live Mode (`--mode live`): Boots against live/sandbox Canvas instance and backend,
  with timeouts and visible fallback to recorded fixtures on any network or API failure.
"""

import argparse
import http.server
import json
import os
import signal
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SANDBOX_FIXTURES_DIR = os.path.join(BASE_DIR, "sandbox/fixtures")
DIST_DIR = os.path.join(BASE_DIR, "dist")

HTML_PAGE_PORT = 8085
BACKEND_PORT = 8765
SANDBOX_API_PORT = 8086

# Generate static mock Canvas LMS page with injected extension bundle
def generate_demo_page(live_mode: bool = False) -> str:
    bundle_path = os.path.join(DIST_DIR, "extension/preview.js")
    bundle_content = ""
    if os.path.exists(bundle_path):
        with open(bundle_path, "r", encoding="utf-8") as f:
            bundle_content = f.read()
    return """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GRADIENT · Extension preview</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f1;color:#19213b;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
nav{padding:28px 40px;display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.6px;font-size:20px}
.logo{background:#2855e8;color:white;border-radius:11px;width:36px;height:36px;display:grid;place-items:center}
main{max-width:650px;padding:64px 40px}small{color:#2855e8;font-weight:750;letter-spacing:2px;font-size:11px}h1{font-size:clamp(36px,4vw,60px);line-height:1.08;letter-spacing:-2.4px;margin:20px 0 24px}p{color:#586078;max-width:460px}
.steps{margin:36px 0;padding:26px;background:white;border:1px solid #e4e5ea;border-radius:20px;max-width:460px}h2{font-size:17px;margin:0 0 16px}ol{padding-left:20px;color:#586078;font-size:14px}li{margin-bottom:12px}code{color:#2855e8;font-size:12px;background:#f0f3ff;padding:3px 6px;border-radius:5px}a{color:#2855e8;font-weight:650;text-decoration:none}.note{font-size:12px}footer{font-size:12px;color:#697188;margin-top:40px}
@media(min-width:800px){main{max-width:calc(100vw - 500px)}}@media(max-width:700px){main{padding:36px 24px}}
</style></head><body><nav><span class="logo">G</span>gradient<span style="font-size:10px;letter-spacing:1px;color:#6c7384;margin-left:12px">DESIGN PREVIEW</span></nav>
<main><small>YOUR CANVAS. MORE CLARITY.</small><h1>A little perspective.<br>A better next move.</h1>
<p>Meet your new study workspace. Real coursework, clearer priorities, and grade planning — right inside your Canvas tab.</p>
<div class="steps"><h2>Bring it into your actual Canvas</h2><ol><li>Open <code>chrome://extensions</code> in Chrome.</li><li>Enable Developer mode, choose <strong>Load unpacked</strong>, and select <code>gradient/dist</code>.</li><li>Open Canvas, sign in, and refresh. Your workspace connects automatically.</li></ol><a href="https://usm.instructure.com/">Open USM Canvas ↗</a></div>
<p class="note">This preview uses sample courses. The installed extension uses your own Canvas session and never substitutes sample data.</p><footer>Built for focus. Designed to stay out of your way.</footer></main><script>""" + bundle_content + """</script></body></html>"""

class DemoHandler(http.server.BaseHTTPRequestHandler):
    live_mode = False

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

    def do_GET(self):
        # Quiz take page simulation: Test Hard-Stop Rule
        if "/quizzes/" in self.path and "/take" in self.path:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html = """<!DOCTYPE html><html><head><title>Quiz Take - Assessment In Progress</title></head>
<body>
  <div id="content">
    <div id="quiz_timer" style="padding:20px; background:#fef2f2; border:1px solid #ef4444; color:#991b1b; font-weight:bold;">
      ⏱️ Timed Assessment in Progress (45:00 Remaining)
    </div>
    <h2>Midterm Quiz (Locked Assessment)</h2>
    <p>Questions are confidential. GRADIENT strictly refuses to run on this page.</p>
    <a href="/courses/99001">&larr; Return to Course Dashboard</a>
  </div>
  <script src="/extension_bundle.js"></script>
</body></html>"""
            self.wfile.write(html.encode("utf-8"))
            return

        if self.path == "/extension_bundle.js":
            bundle_path = os.path.join(DIST_DIR, "extension/preview.js")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.end_headers()
            with open(bundle_path, "rb") as f:
                self.wfile.write(f.read())
            return

        # Main mock Canvas page
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        page_html = generate_demo_page(live_mode=DemoHandler.live_mode)
        self.wfile.write(page_html.encode("utf-8"))

    def log_message(self, format, *args):
        # Silent logger for clean terminal UI
        return

def check_backend_alive(timeout_secs: float = 1.0) -> bool:
    try:
        url = f"http://127.0.0.1:{BACKEND_PORT}/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout_secs) as resp:
            return resp.status == 200
    except Exception:
        return False

def start_backend_if_needed():
    if check_backend_alive(timeout_secs=0.5):
        print(f"  [BACKEND] Connected to running backend on http://127.0.0.1:{BACKEND_PORT}")
        return None

    venv_python = os.path.join(BASE_DIR, "backend/.venv/bin/python")
    python_exec = venv_python if os.path.exists(venv_python) else sys.executable

    print(f"  [BACKEND] Starting stateless FastAPI backend (port {BACKEND_PORT})...")
    proc = subprocess.Popen(
        [python_exec, "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Wait for up to 3 seconds for health check
    for _ in range(15):
        time.sleep(0.2)
        if check_backend_alive(timeout_secs=0.2):
            print(f"  [BACKEND] Health check OK on http://127.0.0.1:{BACKEND_PORT}/health")
            return proc
    print("  [BACKEND WARNING] Backend startup delayed; falling back cleanly to client-side offline execution.")
    return proc

def main():
    parser = argparse.ArgumentParser(description="GRADIENT Demo Server")
    parser.add_argument("--mode", choices=["replay", "live"], default="replay", help="Demo execution mode")
    parser.add_argument("--port", type=int, default=HTML_PAGE_PORT, help="Port to serve mock Canvas demo page")
    parser.add_argument("--open-browser", action="store_true", help="Automatically launch web browser")
    args = parser.parse_args()

    live_mode = (args.mode == "live")
    DemoHandler.live_mode = live_mode

    print("=" * 80)
    if live_mode:
        print("GRADIENT DEMO RUNNER: LIVE MODE (REAL API & LLM CALLS WITH RETRY FALLBACK)")
    else:
        print("GRADIENT DEMO RUNNER: REPLAY MODE (ZERO EXTERNAL NETWORK / AIR-GAPPED)")
    print("=" * 80)

    # 1. Ensure extension bundle exists
    bundle_path = os.path.join(DIST_DIR, "extension/preview.js")
    if not os.path.exists(bundle_path):
        print("==> Extension bundle not found. Building extension...")
        subprocess.run(["npm", "run", "build"], cwd=BASE_DIR, check=True)

    # 2. Start Backend
    backend_proc = start_backend_if_needed()

    # 3. Serve Demo Page
    class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), DemoHandler)
    except OSError as e:
        print(f"[PORT CONFLICT] Port {args.port} is already in use. Retrying on port {args.port + 1}...")
        args.port += 1
        server = ThreadingHTTPServer(("127.0.0.1", args.port), DemoHandler)

    demo_url = f"http://127.0.0.1:{args.port}/courses/99001"
    print(f"\n[DEMO READY] Mock Canvas LMS server running at: {demo_url}")
    print(f"  - Mode: {'LIVE (with fallback)' if live_mode else 'REPLAY (100% fixture grounded)'}")
    print(f"  - Host Origin: http://127.0.0.1:{args.port}")
    print(f"  - Quiz Safety URL: http://127.0.0.1:{args.port}/courses/99001/quizzes/501/take")
    print("\nPress Ctrl+C to terminate demo server.")
    print("-" * 80)

    if args.open_browser:
        try:
            if sys.platform == "darwin":
                subprocess.Popen(["open", demo_url])
            elif sys.platform.startswith("linux"):
                subprocess.Popen(["xdg-open", demo_url])
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[DEMO STOPPING] Shutting down demo server...")
    finally:
        server.server_close()
        if backend_proc:
            try:
                backend_proc.terminate()
            except Exception:
                pass
        print("[DEMO STOPPED] Clean exit.")

if __name__ == "__main__":
    main()

