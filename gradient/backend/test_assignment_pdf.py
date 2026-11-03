import base64
from io import BytesIO
from pypdf import PdfReader
from assignment_pdf import export_pdf,PdfRequest

def test_pdf_is_typeset_without_browser_headers_or_remote_requests():
    result=export_pdf(PdfRequest(html='<html><body><p>AI-generated sample. Check for accuracy.</p><h1>Assignment 1</h1><p>Worked solution: x = 2.</p><math><mi>x</mi><mo>=</mo><mn>2</mn></math></body></html>'))
    pdf=base64.b64decode(result['data'])
    text=''.join(p.extract_text() for p in PdfReader(BytesIO(pdf)).pages)
    assert 'Assignment 1' in text and 'Checkforaccuracy' in text.replace(' ','')
    assert 'localhost' not in text
