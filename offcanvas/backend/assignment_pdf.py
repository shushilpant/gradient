"""Print locally rendered assignment markup; never load external content or scripts."""
import base64
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
try:
    from local_assistant import local_origin
except ImportError:
    from backend.local_assistant import local_origin
router=APIRouter(prefix='/api/v1/assistant',dependencies=[Depends(local_origin)])
class PdfRequest(BaseModel):
    html:str=Field(min_length=1,max_length=12_000_000)
@router.post('/export/pdf')
def export_pdf(payload:PdfRequest):
    # Only embedded PNGs may be consumed by the document converter.
    markup=re.sub(r'<(?:script|iframe|object|embed)\b[^>]*>[\s\S]*?</(?:script|iframe|object|embed)\s*>','',payload.html,flags=re.I)
    markup=re.sub(r'<img\b[^>]*>',lambda match:match[0] if re.search(r'src=["\']data:image/png;base64,[A-Za-z0-9+/]+=*["\']',match[0],re.I) else '',markup,flags=re.I)
    pandoc=shutil.which('pandoc')
    xelatex=shutil.which('xelatex') or '/Library/TeX/texbin/xelatex'
    if pandoc and Path(xelatex).is_file():
        try:
            with tempfile.TemporaryDirectory(prefix='offcanvas-assignment-') as directory:
                root=Path(directory)
                # Pandoc interprets rendered MathML, not model-provided LaTeX code.
                # No source HTML is passed through as raw TeX.
                subprocess.run([pandoc,'--from=html','--to=latex','--standalone','--extract-media='+directory,'-V','geometry:margin=22mm','-V','fontsize=11pt','-V','mainfont=Times New Roman','-o',str(root/'assignment.tex')],input=markup,text=True,capture_output=True,timeout=20,check=True)
                tex=root/'assignment.tex'
                tex.write_text(tex.read_text().replace(directory+'/', './'))
                env={**os.environ,'openin_any':'p','openout_any':'p','TEXMFOUTPUT':directory}
                subprocess.run([xelatex,'-no-shell-escape','-interaction=nonstopmode','-halt-on-error','assignment.tex'],cwd=directory,env=env,capture_output=True,timeout=18,check=True)
                return {'data':base64.b64encode((root/'assignment.pdf').read_bytes()).decode(),'mimeType':'application/pdf','renderer':'latex'}
        except (subprocess.SubprocessError,OSError):
            # Render the same document locally if a math package is unsupported.
            pass
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as driver:
            browser=driver.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
            try:
                context=browser.new_context(java_script_enabled=False,service_workers='block')
                context.route('**/*',lambda route:route.abort())
                page=context.new_page()
                page.set_content(markup,wait_until='load',timeout=15000)
                data=page.pdf(format='A4',print_background=True,display_header_footer=False,margin={'top':'20mm','bottom':'20mm','left':'20mm','right':'20mm'})
                return {'data':base64.b64encode(data).decode(),'mimeType':'application/pdf','renderer':'browser'}
            finally:browser.close()
    except Exception as error:
        raise HTTPException(502,'PDF rendering failed. Check the local Chrome installation.') from error
