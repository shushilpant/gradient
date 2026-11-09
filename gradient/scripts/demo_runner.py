#!/usr/bin/env python3
"""
GRADIENT Demo Runner

Provides:
- Replay Mode (`--mode replay`): Boots local mock environment with ZERO external network calls.
  Uses synthetic courses for the local extension preview.
- Assistant Mode (`--mode live`): Uses the same synthetic courses and starts the local AI backend.
  The preview never connects to a real Canvas account.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import http.server
from html import escape as escape_html
import re
from urllib.parse import urlsplit, unquote
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
def generate_demo_page(live_mode: bool = False, demo_date: date | None = None) -> str:
    bundle_path = os.path.join(DIST_DIR, "extension/preview.js")
    bundle_content = ""
    if os.path.exists(bundle_path):
        with open(bundle_path, "r", encoding="utf-8") as f:
            bundle_content = f.read()
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GRADIENT · Extension preview</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f8fd;color:#0f2742;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
nav{padding:28px 40px;display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.6px;font-size:20px}
.logo{background:#1a73c9;color:white;border-radius:11px;width:36px;height:36px;display:grid;place-items:center}
main{max-width:650px;padding:64px 40px}small{color:#b5432a;font-weight:750;letter-spacing:2px;font-size:11px}h1{font-size:clamp(36px,4vw,60px);line-height:1.08;letter-spacing:-2.4px;margin:20px 0 24px}p{color:#5b6e82;max-width:460px}
.steps{margin:36px 0;padding:26px;background:white;border:1px solid #e2ecf5;border-radius:20px;max-width:460px}h2{font-size:17px;margin:0 0 16px}ol{padding-left:20px;color:#5b6e82;font-size:14px}li{margin-bottom:12px}code{color:#0f2742;font-size:12px;background:#e8f2fd;padding:3px 6px;border-radius:5px}a{color:#1a73c9;font-weight:650;text-decoration:none}.note{font-size:12px}footer{font-size:12px;color:#5b6e82;margin-top:40px}
@media(min-width:800px){main{max-width:calc(100vw - 500px)}}@media(max-width:700px){main{padding:36px 24px}}
</style></head><body><nav><span class="logo">G</span>gradient<span style="font-size:10px;letter-spacing:1px;color:#5b6e82;margin-left:12px">DESIGN PREVIEW</span></nav>
<main><small>SYNTHETIC HACKATHON DEMONSTRATION</small><h1>One academic context.<br>Four useful next steps.</h1>
<p>Alex has three sample courses and overlapping deadlines. Explore Academics, AI Workspace, Automation, and Research in the workspace beside this page.</p>
<div class="steps"><h2>Bring it into your actual Canvas</h2><ol><li>Open <code>chrome://extensions</code> in Chrome.</li><li>Enable Developer mode, choose <strong>Load unpacked</strong>, and select <code>gradient/dist</code>.</li><li>Open Canvas, sign in, and refresh. Your workspace connects automatically.</li></ol><a href="https://usm.instructure.com/">Open USM Canvas ↗</a></div>
<p class="note">This preview uses sample courses. New homework deadlines are set one and two days after the selected demo day. Grades and planning work without AI. Model generation, public research and browser automation require their actual optional services; no completed execution is simulated.</p><footer>The installed extension uses your own Canvas session and never substitutes sample data.</footer></main><script>""" + bundle_content + """</script></body></html>"""
    selected_day = demo_date or datetime.now(timezone.utc).date()
    return page.replace('<html lang="en">', '<html lang="en" data-gradient-demo-date="' + selected_day.isoformat() + '">', 1)


def demo_assignments(selected_day: date):
    """The same explicit scenario consumed by the preview bundle, without Canvas credentials."""
    with open(os.path.join(SANDBOX_FIXTURES_DIR, "hackathon_scenario.json"), encoding="utf-8") as file:
        scenario = json.load(file)
    return [{**item, "due_at": (datetime.combine(selected_day, datetime.min.time(), tzinfo=timezone.utc)
             + timedelta(days=item["daysFromStart"], hours=23, minutes=59)).isoformat().replace("+00:00", "Z")}
            for item in scenario["assignments"]]

class DemoHandler(http.server.BaseHTTPRequestHandler):
    live_mode = False
    demo_date = datetime.now(timezone.utc).date()

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

        path = urlsplit(self.path).path
        assignment_match = re.fullmatch(r"/(api/v1/)?courses/(\d+)/assignments/(\d+)", path)
        if assignment_match:
            assignment = next((item for item in demo_assignments(self.demo_date)
                               if item["courseId"] == assignment_match[2] and item["id"] == assignment_match[3]), None)
            if assignment is not None:
                if assignment_match[1]:
                    content = json.dumps({"id": assignment["id"], "name": assignment["name"], "description": assignment["description"],
                        "due_at": assignment["due_at"], "rubric": assignment["rubric"], "synthetic": True}).encode("utf-8")
                    content_type = "application/json; charset=utf-8"
                else:
                    page = generate_demo_page(demo_date=self.demo_date)
                    body = '<main><small>SYNTHETIC HOMEWORK</small><h1>' + escape_html(assignment["name"]) + '</h1>' + assignment["description"] + '<p>Due ' + escape_html(assignment["due_at"]) + '</p><a href="/courses/' + assignment["courseId"] + '">Back to preview</a></main>'
                    content = re.sub(r"<main>.*?</main>", lambda _: body, page, count=1, flags=re.S).encode("utf-8")
                    content_type = "text/html; charset=utf-8"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
        material_match = re.fullmatch(r"/(api/v1/)?courses/(\d+)/pages/([^/]+)", path)
        if material_match:
            with open(os.path.join(SANDBOX_FIXTURES_DIR, "course_materials.json"), encoding="utf-8") as file:
                materials = json.load(file)
            with open(os.path.join(SANDBOX_FIXTURES_DIR, "hackathon_scenario.json"), encoding="utf-8") as file:
                materials.extend(json.load(file)["materials"])
            material = next((item for item in materials if item["courseId"] == material_match[2] and item["id"] == unquote(material_match[3])), None)
            if material is None:
                self.send_error(404, "Sample material not found")
                return
            body = "<p>" + escape_html(material["content"]) + "</p>"
            if material_match[1]:
                content = json.dumps({"title": material["title"], "body": body, "published": True}).encode("utf-8")
                content_type = "application/json; charset=utf-8"
            else:
                page = generate_demo_page(demo_date=self.demo_date)
                content = re.sub(r"<main>.*?</main>", lambda _: "<main><h1>" + escape_html(material["title"]) + "</h1>" + body + '<a href="/courses/' + material_match[2] + '">Back to preview</a></main>', page, count=1, flags=re.S).encode("utf-8")
                content_type = "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if path.startswith("/api/"):
            self.send_error(404, "This preview exposes only synthetic material pages")
            return

        if self.path == "/gradient-extension.zip":
            archive = os.path.join(BASE_DIR, "gradient-extension.zip")
            if not os.path.isfile(archive):
                self.send_error(404, "Run npm run package in gradient first.")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", 'attachment; filename="gradient-extension.zip"')
            self.send_header("Content-Length", str(os.path.getsize(archive)))
            self.end_headers()
            with open(archive, "rb") as file:
                self.wfile.write(file.read())
            return

        # Explicit synthetic preview; never represented as a live account.
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        page_html = generate_demo_page(live_mode=DemoHandler.live_mode, demo_date=self.demo_date)
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
    print("  [BACKEND] Service did not become ready. AI tools will show a connection error; core tools remain available.")
    return proc

def main():
    parser = argparse.ArgumentParser(description="GRADIENT Demo Server")
    parser.add_argument("--mode", choices=["replay", "live"], default="replay", help="Demo execution mode")
    parser.add_argument("--port", type=int, default=HTML_PAGE_PORT, help="Port to serve mock Canvas demo page")
    parser.add_argument("--open-browser", action="store_true", help="Automatically launch web browser")
    parser.add_argument("--date", type=date.fromisoformat, help="Freeze synthetic fixture dates at YYYY-MM-DD (defaults to today UTC)")
    args = parser.parse_args()

    live_mode = (args.mode == "live")
    DemoHandler.live_mode = live_mode
    DemoHandler.demo_date = args.date or datetime.now(timezone.utc).date()

    print("=" * 80)
    if live_mode:
        print("GRADIENT PREVIEW: SAMPLE COURSES + LOCAL ASSISTANT")
    else:
        print("GRADIENT PREVIEW: SAMPLE COURSES, NO BACKEND REQUIRED")
    print("=" * 80)

    # 1. Ensure extension bundle exists
    bundle_path = os.path.join(DIST_DIR, "extension/preview.js")
    if not os.path.exists(bundle_path):
        print("==> Extension bundle not found. Building extension...")
        subprocess.run(["npm", "run", "build"], cwd=BASE_DIR, check=True)

    # Core preview works without Python dependencies or an AI service.
    # Only the explicitly requested assistant mode starts a backend.
    backend_proc = start_backend_if_needed() if live_mode else None

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
    print(f"  - Mode: {'Sample courses + local assistant' if live_mode else 'Sample courses'}")
    print(f"  - Synthetic fixture day: {DemoHandler.demo_date.isoformat()}")
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

