"""Read-only integration fixture. This is explicitly NOT the Canvas application."""
from pathlib import Path
import copy
import html
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse

ROOT=Path(__file__).resolve().parents[1]
COURSES=json.loads((ROOT/'sandbox/fixtures/sandbox_all_courses.json').read_text())
app=FastAPI(title='OffCanvas rehearsal fixture (not Canvas)',docs_url=None,redoc_url=None)
DESCRIPTION='Plot f(t) = (t-2)*exp(-(t-2))*u(t-2) for 0<=t<=8. Explain why the signal is zero before t=2 and identify the peak.'
for item in COURSES:
    for assignment in item['assignments']:
        assignment['description']=f'<p>{DESCRIPTION}</p>'
        assignment['published']=True
    item['assignments'][0]['name']='Homework: time-shift response'
    item['course']['syllabus_body']='<p>Local rehearsal course. Reference samples may be generated for homework.</p>'

@app.middleware('http')
async def readonly(request:Request,call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail':'The rehearsal fixture is read-only.'},status_code=405)
    return await call_next(request)

@app.get('/__gradient_sandbox__', include_in_schema=False)
@app.get('/__bodha_sandbox__', include_in_schema=False)  # Legacy local-install marker.
@app.get('/__offcanvas_sandbox__')
def identity():return {'kind':'rehearsal-fixture','oneToOne':False,'synthetic':True,'readOnly':True}

@app.get('/gradient/content.js', include_in_schema=False)
@app.get('/bodha/content.js', include_in_schema=False)
@app.get('/offcanvas/content.js')
def content():return FileResponse(ROOT/'dist/extension/content.js',media_type='application/javascript')

def item_for(course_id):
    result=next((c for c in COURSES if str(c['course']['id'])==course_id),None)
    if not result:raise HTTPException(404,'Course not found')
    return result

def course_data(item,origin):
    course=copy.deepcopy(item['course']);course.update({'html_url':f"{origin}/courses/{course['id']}",'enrollments':[{**item['enrollment'],'type':'student','role':'StudentEnrollment','enrollment_state':'active'}]});return course

def assignment_data(a,item,origin):
    assignment=copy.deepcopy(a);assignment['html_url']=f"{origin}/courses/{item['course']['id']}/assignments/{a['id']}";assignment['submission']=next((s for s in item['submissions'] if s['assignment_id']==a['id']),None);return assignment

@app.get('/api/v1/users/self/profile')
@app.get('/api/v1/users/self')
def profile():return {'id':9991,'name':'Rehearsal Student','short_name':'Rehearsal'}

@app.get('/api/v1/courses')
def courses(request:Request):return [course_data(item,str(request.base_url).rstrip('/')) for item in COURSES]

@app.get('/api/v1/users/self/enrollments')
def enrollments():return [item['enrollment'] for item in COURSES]

@app.get('/api/v1/announcements')
@app.get('/api/v1/calendar_events')
def empty():return []

@app.get('/api/v1/courses/{course_id}')
def course(course_id:str,request:Request):return course_data(item_for(course_id),str(request.base_url).rstrip('/'))

@app.get('/api/v1/courses/{course_id}/{section:path}')
def section(course_id:str,section:str,request:Request):
    item=item_for(course_id);origin=str(request.base_url).rstrip('/')
    if section=='assignments':return [assignment_data(a,item,origin) for a in item['assignments']]
    if section.startswith('assignments/'):
        assignment=next((a for a in item['assignments'] if str(a['id'])==section.split('/')[1]),None)
        if not assignment:raise HTTPException(404,'Assignment not found')
        return assignment_data(assignment,item,origin)
    if section=='assignment_groups':return item['assignment_groups']
    if section=='students/submissions':return item['submissions']
    if section=='enrollments':return [item['enrollment']]
    if section=='pages/shift-guide':return {'title':'Time-shift guide','body':'<p>The unit step u(t-2) is zero for t&lt;2 and one for t&gt;=2.</p>','published':True}
    if section=='pages':return [{'page_id':1,'title':'Time-shift guide','url':'shift-guide','html_url':f'{origin}/courses/{course_id}/pages/shift-guide'}]
    return []

def shell(title,body):
    return HTMLResponse('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'''+html.escape(title)+'''</title><style>body{margin:0;font:16px/1.65 -apple-system,sans-serif;background:#f5f6f8;color:#26313c}aside{position:fixed;inset:0 auto 0 0;width:100px;background:#293d50;padding:24px 12px}aside a{color:white;display:block;margin:18px 0}main{margin:0 520px 0 135px;padding:25px;max-width:850px}a{color:#155f96}h1{font-weight:500;font-size:30px}.fixture{background:#fff0ce;color:#654919;padding:12px 18px;font-size:13px}.row{background:white;border:1px solid #d8dce2;border-radius:5px;padding:18px;margin:12px 0}.description{background:white;padding:24px;border:1px solid #d8dce2}@media(max-width:900px){main{margin-right:30px}}</style></head><body><aside><a href="/">Dashboard</a><a href="/courses">Courses</a></aside><div class="fixture">REHEARSAL FIXTURE · Synthetic coursework · Not the Canvas application or a one-to-one replica</div><main>'''+body+'''</main><script src="/offcanvas/content.js"></script></body></html>''')

@app.get('/',response_class=HTMLResponse)
@app.get('/courses',response_class=HTMLResponse)
def dashboard():return shell('Rehearsal dashboard','<h1>Dashboard</h1>'+''.join(f'<div class="row"><a href="/courses/{c["course"]["id"]}">{html.escape(c["course"]["name"])}</a></div>' for c in COURSES))

@app.get('/courses/{course_id}',response_class=HTMLResponse)
@app.get('/courses/{course_id}/assignments',response_class=HTMLResponse)
def course_page(course_id:str):
    item=item_for(course_id)
    return shell(item['course']['name'],f'<h1>{html.escape(item["course"]["name"])}</h1><h2>Assignments</h2>'+''.join(f'<div class="row"><a href="/courses/{course_id}/assignments/{a["id"]}">{html.escape(a["name"])}</a></div>' for a in item['assignments']))

@app.get('/courses/{course_id}/assignments/{assignment_id}',response_class=HTMLResponse)
def assignment_page(course_id:str,assignment_id:str):
    item=item_for(course_id);a=next((a for a in item['assignments'] if str(a['id'])==assignment_id),None)
    if not a:raise HTTPException(404,'Assignment not found')
    return shell(a['name'],f'<nav><a href="/courses/{course_id}">Course</a> / Assignments</nav><h1>{html.escape(a["name"])}</h1><div id="assignment-description" class="description user_content">{a["description"]}</div><p><a href="/courses/{course_id}/pages/shift-guide">Time-shift guide</a></p>')

@app.get('/courses/{course_id}/pages/shift-guide',response_class=HTMLResponse)
def guide(course_id:str):return shell('Time-shift guide','<h1>Time-shift guide</h1><p>The unit step u(t-2) is zero before t=2. For t&gt;=2 the signal follows the shifted function.</p>')
