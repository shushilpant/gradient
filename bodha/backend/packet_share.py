"""Explicit, expiring packet sharing on a separate read-only LAN listener."""
import html
import re
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
try:
    from local_assistant import local_origin
except ImportError:
    from backend.local_assistant import local_origin

router = APIRouter(prefix='/api/v1/assistant/shares', dependencies=[Depends(local_origin)])
_LOCK = threading.Lock()
_PACKETS = {}
_SERVER = None
TTL = 20 * 60

class ShareSource(BaseModel):
    title: str = Field(max_length=1000)
    url: str = Field(max_length=3000)
    excerpt: str = Field(default='', max_length=10000)

class ShareFigure(BaseModel):
    title: str = Field(max_length=500)
    data: str = Field(max_length=4000000, pattern=r'^[A-Za-z0-9+/]+={0,2}$')
    caption: str = Field(default='', max_length=2000)

class ShareRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1, max_length=200000)
    sources: list[ShareSource] = Field(default_factory=list, max_length=80)
    figures: list[ShareFigure] = Field(default_factory=list, max_length=4)


def render_packet(payload):
    # Never render source/model HTML or script. Markdown gets a small safe subset.
    lines = []; in_code = False
    for line in payload.markdown.splitlines():
        if line.startswith('```'):
            lines.append('</code></pre>' if in_code else '<pre><code>'); in_code = not in_code; continue
        safe = html.escape(line)
        if in_code:
            lines.append(safe + '\n'); continue
        heading = re.match(r'^(#{1,4})\s+(.+)$', line)
        if heading:
            level = len(heading[1]) + 1
            lines.append(f'<h{level}>{html.escape(heading[2])}</h{level}>')
        elif line.strip():
            lines.append('<p>' + safe + '</p>')
    if in_code: lines.append('</code></pre>')
    for figure in payload.figures:
        lines.append('<figure><img alt="'+html.escape(figure.title,quote=True)+'" src="data:image/png;base64,'+figure.data+'"><figcaption>'+html.escape(figure.caption)+'</figcaption></figure>')
    lines.append('<h2>Sources</h2>')
    for source in payload.sources:
        url = urlsplit(source.url)
        title = html.escape(source.title)
        if url.scheme in ('https','http') and url.netloc and not url.username and not url.password:
            lines.append('<p><a rel="noreferrer noopener" href="'+html.escape(source.url,quote=True)+'">'+title+'</a></p>')
        else: lines.append('<p>'+title+'</p>')
        if source.excerpt: lines.append('<blockquote>'+html.escape(source.excerpt)+'</blockquote>')
    body = ''.join(lines)
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(payload.title)+'</title><style>body{max-width:760px;margin:0 auto;padding:28px 22px;font:17px/1.65 system-ui;color:#231b15;background:#fffaf5}h1,h2,h3{line-height:1.2}p{white-space:pre-wrap;overflow-wrap:anywhere}header{border-bottom:1px solid #ead8c8;padding-bottom:20px;margin-bottom:24px}small{color:#756458}a{color:#9a3412}pre{overflow:auto;background:#f4ece4;padding:16px}blockquote{border-left:3px solid #c2410c;margin-left:0;padding-left:14px}img{max-width:100%;height:auto}figure{margin:20px 0}figcaption{font-size:14px}</style><header><small>OffCanvas · labeled study reference · temporary local share</small><h1>'+html.escape(payload.title)+'</h1><p>This packet is AI-assisted study material. Check its sources and your course rules. It is not a submitted assignment or a verified grade.</p></header><main>'+body+'</main><footer><small>This link expires 20 minutes after creation. Save or print this page before it expires.</small></footer></html>').encode()


def get_packet(token, now=None):
    now = time.monotonic() if now is None else now
    with _LOCK:
        packet = _PACKETS.get(token)
        if packet and packet['expires'] > now: return packet['html']
        _PACKETS.pop(token, None)
    return None

class ShareHandler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # Tokens must not enter access logs.
    def do_GET(self):
        match = re.fullmatch(r'/p/([A-Za-z0-9_-]{32})', urlsplit(self.path).path)
        body = get_packet(match[1]) if match else None
        self.send_response(200 if body else 404)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers(); self.wfile.write(body or b'This study packet is expired, revoked, or unavailable.')


def lan_address():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8',80))  # Routing lookup only; no coursework is sent.
        address = sock.getsockname()[0]
        if address.startswith('127.'): raise OSError()
        return address
    except OSError as error:
        raise HTTPException(503,'No local network address is available. Connect the computer and phone to the same Wi-Fi, then retry. HTML export remains available.') from error
    finally: sock.close()

@router.post('')
def publish_packet(payload: ShareRequest):
    global _SERVER
    address = lan_address()
    body = render_packet(payload)
    if len(body) > 10_000_000: raise HTTPException(413,'This packet is too large for phone sharing. Export HTML instead.')
    with _LOCK:
        now=time.monotonic()
        for token in list(_PACKETS):
            if _PACKETS[token]['expires'] <= now: del _PACKETS[token]
        if len(_PACKETS)>=5: raise HTTPException(429,'Five packets are already shared. Revoke one or wait for it to expire.')
        if _SERVER is None:
            try: _SERVER=ThreadingHTTPServer(('0.0.0.0',8767),ShareHandler)
            except OSError as error: raise HTTPException(503,'The phone-share port 8767 is unavailable. Close the other service or use HTML export.') from error
            threading.Thread(target=_SERVER.serve_forever,daemon=True).start()
        token=secrets.token_urlsafe(24)
        _PACKETS[token]={'html':body,'expires':now+TTL}
    return {'token':token,'url':f'http://{address}:8767/p/{token}','expiresInSeconds':TTL}

@router.post('/{token}/revoke')
def revoke_packet(token:str):
    with _LOCK: _PACKETS.pop(token,None)
    return {'revoked':True}
