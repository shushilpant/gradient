import json
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import sandbox_mirror as mirror

def test_mirror_is_explicit_and_stages_only_supported_canvas_snapshot(tmp_path,monkeypatch):
    monkeypatch.setattr(mirror,'IMPORTS',tmp_path)
    app=FastAPI();app.include_router(mirror.router);client=TestClient(app)
    headers={'X-OffCanvas-Client':'offcanvas-extension'}
    payload={'origin':'https://usm.instructure.com','user':{'id':'42','name':'Student'},'courses':[{'id':'1','assignments':[{'id':'2','name':'Homework'}],'resources':[{'id':'7','type':'page','bodyHtml':'<p>Study guide.</p>'}]}],'cookies':'SECRET','theme':{'primary':'#123456','arbitraryScript':'bad'},'mirrorWarnings':['A locked page was not copied.']}
    response=client.post('/api/v1/computer/mirror',json=payload,headers=headers)
    assert response.status_code==202 and response.json()['courseCount']==1
    saved=json.loads(next(tmp_path.glob('*.json')).read_text())
    assert 'cookies' not in saved and saved['theme']=={'primary':'#123456'}
    assert response.json()['status']=='staged'
    assert '1 readable page bodies' in response.json()['message']
    assert saved['courses'][0]['resources'][0]['bodyHtml']=='<p>Study guide.</p>'
    assert saved['mirrorWarnings']==payload['mirrorWarnings']
    assert client.post('/api/v1/computer/mirror',json=payload).status_code==403
    payload['origin']='https://attacker.example'
    assert client.post('/api/v1/computer/mirror',json=payload,headers=headers).status_code==422
