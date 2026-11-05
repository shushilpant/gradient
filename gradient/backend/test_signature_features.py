import base64
import json
import pytest
from fastapi import HTTPException
import photo_check as photo
import packet_share as share


def test_photo_requires_homework_confirmation_and_blocks_assessments():
    for payload in [photo.PhotoRequest(),photo.PhotoRequest(title='Final exam',homeworkConfirmed=True)]:
        with pytest.raises(HTTPException):photo.check_photo(payload,lambda *a,**k:None)


def test_photo_reads_without_correcting_and_requires_confirmed_text():
    seen=[]
    def model(name,messages,kind,tokens):
        seen.extend(messages)
        return photo.Handwriting(transcription='x squared plus y squared equals z squared',uncertainties=['Check the exponent.'])
    image=base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'fake-test-image').decode()
    result=photo.check_photo(photo.PhotoRequest(image=image,homeworkConfirmed=True),model)
    assert result.uncertainties==['Check the exponent.']
    assert result.critique is None
    assert 'Never solve' in seen[0]['content']
    assert seen[1]['images']==[image]
    with pytest.raises(HTTPException):photo.check_photo(photo.PhotoRequest(phase='critique',homeworkConfirmed=True,transcription='short'),model)


def test_photo_critique_reuses_rubric_and_quoted_student_work():
    result=photo.check_photo(photo.PhotoRequest(phase='critique',homeworkConfirmed=True,transcription='The algorithm has O(n) complexity because it scans each item once.',rubric=[{'id':'complexity','description':'Explain asymptotic complexity','points':10,'ratings':[]}]),lambda *a,**k:pytest.fail('Critique does not run OCR again'))
    assert result.critique['criteria'][0]['criterionId']=='complexity'
    assert result.critique['rewriteCheckPassed']
    assert all(quote in result.transcription for criterion in result.critique['criteria'] for quote in criterion['evidenceQuotes'])


def test_phone_packet_is_escaped_and_has_expiring_capabilities(monkeypatch):
    payload=share.ShareRequest(title='<script>bad</script>',markdown='# Hello\n<script>alert(1)</script>\nSome content',sources=[{'title':'Unsafe','url':'javascript:alert(1)'}])
    html=share.render_packet(payload).decode()
    assert '<script>' not in html
    assert 'href="javascript:' not in html
    assert '&lt;script&gt;' in html
    monkeypatch.setattr(share,'_PACKETS',{'token':{'html':b'packet','expires':100}})
    assert share.get_packet('token',99)==b'packet'
    assert share.get_packet('token',100) is None
    assert share.get_packet('../token',99) is None


def test_revocation_removes_shared_packet(monkeypatch):
    monkeypatch.setattr(share,'_PACKETS',{'token':{'html':b'packet','expires':100}})
    assert share.revoke_packet('token')['revoked']
    assert share.get_packet('token',99) is None
