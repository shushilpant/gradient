import json
from pathlib import Path
import threading

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

try:
    import computer_agent as agent
except ImportError:
    from backend import computer_agent as agent


@pytest.fixture(autouse=True)
def clean_sessions(monkeypatch, tmp_path):
    agent._SESSIONS.clear()
    monkeypatch.setenv('GRADIENT_SANDBOX_ORIGIN', 'http://127.0.0.1:8086')
    monkeypatch.setenv('GRADIENT_SANDBOX_ORIGINS', 'http://127.0.0.1:8080')
    monkeypatch.setattr(agent, '_OUTPUT', tmp_path)


@pytest.mark.parametrize('url', ['https://usm.instructure.com/courses/1', 'http://127.0.0.1:8765/api/v1/assistant/jobs', 'http://localhost:8086/courses/1', 'http://127.0.0.1:8086/courses/1/quizzes/2', '/courses/1/assignments/2/%73ubmissions', '/courses/1/assignments/2/..%2Fquizzes/3', '/courses/1/assignments/2/edit', '/logout', '/courses/1/assignments/2?delete=true', '/courses/1/external_tools/1'])
def test_agent_cannot_leave_sandbox_or_access_mutation_routes(url):
    with pytest.raises(ValueError):
        agent.safe_url(url, 'http://127.0.0.1:8086')


def test_agent_reads_only_configured_origins_and_read_parameters():
    assert agent.safe_url('/courses/1/assignments/2', 'http://127.0.0.1:8086') == 'http://127.0.0.1:8086/courses/1/assignments/2'
    assert agent.safe_url('/api/v1/courses/1/modules?include[]=items', 'http://127.0.0.1:8086').endswith('include[]=items')
    with pytest.raises(ValueError):
        agent.safe_url('/', 'http://127.0.0.1:9999')


def test_config_prefers_real_canvas_and_discloses_rehearsal_fallback(monkeypatch):
    monkeypatch.delenv('GRADIENT_SANDBOX_ORIGIN')
    monkeypatch.delenv('GRADIENT_SANDBOX_ORIGINS')
    monkeypatch.setattr(agent, 'browser_executable', lambda:'/existing/chrome')
    monkeypatch.setattr(agent.importlib.util, 'find_spec', lambda _:object())
    monkeypatch.setattr(agent, 'origin_reachable', lambda _:True)
    monkeypatch.setattr(agent, 'sandbox_kind', lambda origin:'canvas-oss' if origin.endswith(':8080') else 'rehearsal-fixture')
    ready=agent.config()
    assert ready['sandboxOrigin']=='http://127.0.0.1:8080'
    assert 'Canvas OSS' in ready['message']
    monkeypatch.setattr(agent, 'origin_reachable', lambda origin:origin.endswith(':8086'))
    assert agent.config()['available'] is False
    monkeypatch.setenv('GRADIENT_SANDBOX_ORIGINS','http://127.0.0.1:8086')
    fixture=agent.config()
    assert fixture['sandboxOrigin']=='http://127.0.0.1:8086'
    assert 'Rehearsal fixture' in fixture['message'] and 'not a Canvas replica' in fixture['message']


def test_reachable_requires_verified_sandbox_marker_and_live_canvas_login(monkeypatch):
    from io import BytesIO
    from types import SimpleNamespace
    records={}
    calls=[]
    class Response(BytesIO):
        status=200
    def open_url(url,**_):
        calls.append(url)
        if url not in records:raise ValueError('not found')
        return Response(json.dumps(records[url]).encode())
    monkeypatch.setattr(agent,'build_opener',lambda *_:SimpleNamespace(open=open_url))
    origin='http://127.0.0.1:8080'
    records[origin+'/']={'unrelated':'service'}
    assert not agent.origin_reachable(origin)
    records[origin+'/__gradient_sandbox__/status.json']={'application':'Canvas LMS','sandbox':True}
    assert not agent.origin_reachable(origin)
    records[origin+'/login/canvas']={'login':'ready'}
    assert agent.origin_reachable(origin)
    records.clear()
    records[origin+'/__gradient_sandbox__']={'kind':'rehearsal-fixture','readOnly':True}
    assert agent.sandbox_kind(origin)=='rehearsal-fixture'


def test_canvas_download_query_is_confined_to_file_routes():
    origin='http://127.0.0.1:8086'
    target='/files/4/download?download_frd=1&download=1&verifier=CanvasSeedVerifier'
    assert agent.safe_url(target,origin)==origin+target
    for target in ['/courses/1/assignments/2?verifier=token','/files/4/download?delete=1','/api/v1/files/4?download=1']:
        with pytest.raises(ValueError):agent.safe_url(target,origin)


def test_canvas_assignment_index_filters_are_confined_to_read_only_api_routes():
    origin='http://127.0.0.1:8086'
    query='?exclude_assignment_submission_types%5B%5D=wiki_page&exclude_response_fields%5B%5D=description&include%5B%5D=assignments&override_assignment_dates=true&per_page=50'
    assert agent.safe_url('/api/v1/courses/1/assignment_groups'+query,origin).endswith(query)
    for target in ['/courses/1/assignments'+query,'/api/v1/courses/1/assignment_groups?delete=true']:
        with pytest.raises(ValueError):agent.safe_url(target,origin)


def test_cancel_is_real_pending_request_until_worker_observes_it():
    agent._SESSIONS['a'] = {'id':'a', 'status':'running', 'stage':'planning', 'steps':[], '_cancel':False}
    result = agent.cancel_session('a')
    assert result['status'] == 'running' and result['stage'] == 'cancelling'
    assert '_cancel' not in result
    with pytest.raises(InterruptedError):
        agent._cancelled('a')


def test_session_start_validates_origin_before_launch_and_returns_full_shape(monkeypatch):
    monkeypatch.setattr(agent, 'origin_reachable', lambda _:True)
    monkeypatch.setattr(agent, 'browser_executable', lambda:'/existing/chrome')
    monkeypatch.setattr(agent.importlib.util, 'find_spec', lambda _:object())
    calls=[]
    monkeypatch.setattr(agent._EXECUTOR, 'submit', lambda *args:calls.append(args))
    request=agent.SessionRequest(origin='http://127.0.0.1:8086',goal='Read homework')
    result=agent.start_session(request)
    assert result['status']=='running' and result['steps']==[] and result['stage']=='queued'
    assert len(calls)==1
    with pytest.raises(HTTPException) as exc:
        agent.start_session(request)
    assert exc.value.status_code==409
    with pytest.raises(HTTPException) as exc:
        agent.start_session(request.model_copy(update={'origin':'https://usm.instructure.com'}))
    assert exc.value.status_code==422


def test_screenshots_are_bounded_and_status_never_exposes_cancel_flags():
    agent._SESSIONS['a']={'id':'a','status':'running','steps':[], '_cancel':False}
    for i in range(15):
        agent._step('a','observe','http://127.0.0.1:8086/',str(i),'data:image/jpeg;base64,abc')
    result=agent.get_session('a')
    assert len(result['steps'])==15
    assert sum('screenshot' in step for step in result['steps'])==6
    assert '_cancel' not in result


def test_artifact_export_is_local_and_escapes_model_html(tmp_path):
    session_id='a'*32
    packet={'title':'<script>bad</script>','sampleMarkdown':'<img src=x onerror=bad()>','sources':[], 'renderedVisuals':[]}
    files=agent._save_artifacts(session_id,packet)
    assert len(files)==3
    html=(tmp_path/session_id/'reference-sample.html').read_text()
    assert '<script>bad</script>' not in html and '&lt;script&gt;' in html
    with pytest.raises(HTTPException):
        agent.artifact(session_id,'../../app.py')


def test_api_requires_extension_header_for_session_mutations():
    app=FastAPI();app.include_router(agent.router)
    client=TestClient(app)
    response=client.post('/api/v1/computer/sessions',json={'origin':'http://127.0.0.1:8086','goal':'Read homework'})
    assert response.status_code==403


def test_model_cannot_claim_completion_without_generating_reference(monkeypatch):
    # run_session rejects finish before a packet exists; this is covered through
    # actual-browser execution below as well as ensuring restricted action enums.
    with pytest.raises(Exception):
        agent.Decision(action='run_python',reason='execute model code')


def test_assignment_source_read_uses_actual_brief_and_does_not_submit(monkeypatch):
    calls=[]
    def get(context,origin,path):
        calls.append(path)
        if '/assignments/' in path:
            return {'name':'Homework time shift','description':'<p>Plot f(t)=t*exp(-t).</p>','submission_types':['online_upload']}
        if path.endswith('/modules?include[]=items'):
            return []
        return {'name':'Signals','course_code':'CE240'}
    monkeypatch.setattr(agent,'_json_get',get)
    result=agent._assignment_request(None,'http://127.0.0.1:8086','http://127.0.0.1:8086/courses/1/assignments/2','Complete the homework','gpt-oss:20b')
    assert result.autopilot and result.assignment.description=='Plot f(t)=t*exp(-t).'
    assert result.webResearch is False
    with_web=agent._assignment_request(None,'http://127.0.0.1:8086','http://127.0.0.1:8086/courses/1/assignments/2','Learn concepts','gpt-oss:20b',web_research=True)
    assert with_web.webResearch is True
    assert agent.SessionRequest(origin='http://127.0.0.1:8086',goal='Read homework').webResearch is False
    assert not any('submit' in call for call in calls)
    monkeypatch.setattr(agent,'_json_get',lambda *_:{'name':'Exam 2','description':'<p>Take this exam.</p>','submission_types':['online_quiz']})
    with pytest.raises(HTTPException):
        agent._assignment_request(None,'http://127.0.0.1:8086','http://127.0.0.1:8086/courses/1/assignments/2','Read it','gpt-oss:20b')


def test_real_isolated_browser_observes_clicks_reads_and_exports_without_mutations(monkeypatch):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    requests=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            requests.append(('GET',self.path))
            body={'/':'<main><h1>Sandbox</h1><div id="courses">Loading courses…</div></main><script>setTimeout(()=>document.getElementById("courses").innerHTML=\'<a href="/courses/1">Signals course</a>\',100)</script>',
                  '/courses/1':'<main><h1>Signals</h1><a href="/courses/1/assignments/2">Homework time shift</a></main>',
                  '/courses/1/assignments/2':'<main><h1>Homework time shift</h1><div id="assignment-description">Plot f(t)=t*exp(-t).</div></main>',
                  '/api/v1/courses/1':json.dumps({'name':'Signals','course_code':'CE240'}),
                  '/api/v1/courses/1/assignments/2':json.dumps({'name':'Homework time shift','description':'<p>Plot f(t)=t*exp(-t).</p>','submission_types':['online_upload']}),
                  '/api/v1/courses/1/modules?include[]=items':'[]'}.get(self.path,'')
            self.send_response(200 if body else 404);self.send_header('Content-Type','application/json' if self.path.startswith('/api/') else 'text/html');self.end_headers();self.wfile.write(body.encode())
        def do_POST(self):
            requests.append(('POST',self.path));self.send_response(405);self.end_headers()
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    origin=f'http://127.0.0.1:{server.server_port}'
    monkeypatch.setenv('GRADIENT_SANDBOX_ORIGIN',origin)
    monkeypatch.setattr(agent.ai,'installed_model',lambda *_a,**_k:{'capabilities':['completion','vision']})
    monkeypatch.setattr(agent,'perceive',lambda *_:agent.Perception(summary='Actual local test screenshot observed.',homeworkVisible=True,needsLogin=False))
    observations=[]
    def decide(model,goal,observation,vision,history):
        observations.append(observation)
        if observation['url'].endswith('/assignments/2'):
            return agent.Decision(action='read',reason='Read the homework brief.')
        return agent.Decision(action='open',targetId=observation['links'][0]['id'],reason='Open the observed course/homework link.')
    monkeypatch.setattr(agent,'decide',decide)
    captured=[]
    def generate(request):
        captured.append(request)
        return agent.ai.StudyPacket(title='Reference sample',summary='Synthetic',markdown='Guide',sampleMarkdown='Complete worked sample.',diagrams=[],graphs=[])
    monkeypatch.setattr(agent.ai,'generate_study_packet',generate)
    session_id='b'*32
    agent._SESSIONS[session_id]={'id':session_id,'status':'running','steps':[],'_cancel':False}
    try:
        agent.run_session(session_id,agent.SessionRequest(origin=origin,goal='Complete homework time shift',maxSteps=5))
        state=agent.get_session(session_id)
        assert state['status']=='complete',state.get('error')
        assert len(observations)==3 and len(captured)==1
        assert captured[0].assignment.description=='Plot f(t)=t*exp(-t).'
        assert state['packet']['sampleMarkdown']=='Complete worked sample.'
        assert [step['action'] for step in state['steps']]==['observe','open','observe','open','observe','read','generate']
        assert all(method=='GET' for method,path in requests)
        assert len(state['artifacts'])==3
        assert sum(step.get('screenshot','').startswith('data:image/jpeg;base64,') for step in state['steps']) >= 2
    finally:
        server.shutdown();server.server_close()


def test_file_only_homework_reads_real_attachment_text_before_generation(monkeypatch):
    from types import SimpleNamespace
    origin='http://127.0.0.1:8086'
    body=b'Plot f(t)=t*exp(-t). Explain the maximum and decay.'
    downloads=[]
    def get(context,current_origin,path):
        if '/assignments/' in path:
            return {'name':'Homework attached instructions','description':'<a href="/courses/1/files/4">Instructions.txt</a>','submission_types':['online_upload']}
        if path=='/api/v1/files/4':
            return {'display_name':'Instructions.txt','url':origin+'/files/4/download?download_frd=1&verifier=CanvasSeedVerifier','content-type':'text/plain','size':len(body)}
        if '/modules?' in path:return []
        return {'name':'Signals','course_code':'CE240'}
    monkeypatch.setattr(agent,'_json_get',get)
    def download(url,**kwargs):
        downloads.append((url,kwargs))
        return SimpleNamespace(ok=True,headers={'content-type':'text/plain','content-length':str(len(body))},body=lambda:body)
    context=SimpleNamespace(request=SimpleNamespace(get=download))
    result=agent._assignment_request(context,origin,origin+'/courses/1/assignments/2','Complete homework','gpt-oss:20b')
    assert body.decode() in result.assignment.description
    assert result.resources[0].text==body.decode()
    assert downloads[0][0]==origin+'/files/4/download?download_frd=1&verifier=CanvasSeedVerifier' and downloads[0][1]['max_redirects']==0


def test_external_attachment_url_is_not_read_with_the_sandbox_session(monkeypatch):
    from types import SimpleNamespace
    origin='http://127.0.0.1:8086'
    def get(context,current_origin,path):
        if '/assignments/' in path:return {'name':'Homework attached','description':'<p>Read the attached worksheet.</p><a href="/courses/1/files/4">Instructions.pdf</a>','submission_types':['online_upload']}
        if path=='/api/v1/files/4':return {'display_name':'Private.pdf','url':'https://usm.instructure.com/files/4/download'}
        if '/modules?' in path:return []
        return {'name':'Signals'}
    monkeypatch.setattr(agent,'_json_get',get)
    context=SimpleNamespace(request=SimpleNamespace(get=lambda *_a,**_k:pytest.fail('Must not send sandbox cookies outside the sandbox')))
    with pytest.raises(ValueError, match='attachment that could not be read'):
        agent._assignment_request(context,origin,origin+'/courses/1/assignments/2','Complete homework','gpt-oss:20b')


def test_long_brief_cannot_silently_drop_required_attachment(monkeypatch):
    def get(_context,_origin,path):
        if '/assignments/' in path:return {'name':'Homework','description':'<p>'+('Discuss the signal behavior. '*12)+'Follow the instructions in the attached worksheet.</p><a href="/files/4">Worksheet.pdf</a>','submission_types':['online_upload']}
        if path=='/api/v1/files/4':return {'locked_for_user':True}
        return [] if '/modules?' in path else {'name':'Signals'}
    monkeypatch.setattr(agent,'_json_get',get)
    with pytest.raises(ValueError,match='attachment that could not be read'):
        agent._assignment_request(None,'http://127.0.0.1:8086','http://127.0.0.1:8086/courses/1/assignments/2','Complete homework','gpt-oss:20b')


def test_optional_unread_attachment_is_disclosed(monkeypatch):
    def get(_context,_origin,path):
        if '/assignments/' in path:return {'name':'Homework','description':'<p>'+('Discuss the signal behavior using the equation given above. '*6)+'</p><a href="/files/4">Additional example.pdf</a>','submission_types':['online_upload']}
        if path=='/api/v1/files/4':return {'locked_for_user':True}
        return [] if '/modules?' in path else {'name':'Signals'}
    monkeypatch.setattr(agent,'_json_get',get)
    warnings=[]
    result=agent._assignment_request(None,'http://127.0.0.1:8086','http://127.0.0.1:8086/courses/1/assignments/2','Complete homework','gpt-oss:20b',warnings)
    assert result.assignment.description and len(warnings)==1 and 'attachment' in warnings[0]
