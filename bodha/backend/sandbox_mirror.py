"""Stage an explicit student-visible Canvas snapshot for the isolated Canvas import."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from shlex import quote
from urllib.parse import urlsplit
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request

try:
    from local_assistant import local_origin
except ImportError:
    from backend.local_assistant import local_origin

ROOT=Path(__file__).resolve().parents[1]
IMPORTS=ROOT/'sandbox'/'canvas_local'/'.runtime'/'imports'
router=APIRouter(prefix='/api/v1/computer',dependencies=[Depends(local_origin)])

@router.post('/mirror',status_code=202)
async def stage_mirror(request:Request):
    try:
        length=int(request.headers.get('content-length','0') or 0)
    except ValueError:
        raise HTTPException(400,'Invalid Content-Length header.')
    if length>12_000_000:
        raise HTTPException(413,'The snapshot exceeds the 12 MB staging limit.')
    raw=await request.body()
    if len(raw)>12_000_000:raise HTTPException(413,'The snapshot exceeds the 12 MB staging limit.')
    try:
        snapshot=json.loads(raw)
        origin=snapshot['origin'];source=urlsplit(origin)
        if source.scheme!='https' or source.username or source.password or source.path or source.query or source.fragment or not (source.hostname=='canvas.usm.edu' or source.hostname=='instructure.com' or (source.hostname or '').endswith('.instructure.com')):
            raise ValueError('Unsupported Canvas origin')
        courses=snapshot['courses']
        if not isinstance(courses,list) or not 1<=len(courses)<=100:raise ValueError('No courses or too many courses')
        for course in courses:
            if not isinstance(course,dict) or not re.fullmatch(r'\d{1,20}',str(course['id'])) or not isinstance(course['assignments'],list) or len(course['assignments'])>5000:
                raise ValueError('Invalid course')
        mirror_warnings=snapshot.get('mirrorWarnings',[])
        if not isinstance(mirror_warnings,list):raise ValueError('Invalid mirror warnings')
        mirror_warnings=[item[:700] for item in mirror_warnings[:80] if isinstance(item,str)]
        # Do not accept cookies, browser state, local paths, or unknown executable
        # fields. The importer treats all selected HTML as untrusted course text.
        selected={'origin':origin,'syncedAt':str(snapshot.get('syncedAt',''))[:100],
            'user':{key:str(snapshot.get('user',{}).get(key,''))[:200] for key in ('id','name','shortName')},
            'courses':[{key:course.get(key) for key in ('id','name','code','url','syllabusHtml','input','currentScore','assignments','resources','announcements','issues','materialAccess')} for course in courses],
            'theme':{key:str(value)[:150] for key,value in snapshot.get('theme',{}).items() if key in ('primary','navigation','navigationText','fontFamily','logoUrl')},
            'mirrorWarnings':mirror_warnings,
            'capturedAt':datetime.now(timezone.utc).isoformat(),
            'limitations':['Only student-visible data present in this snapshot is staged.','Readable linked assignment document text is embedded in staged assignment briefs. Original file links remain references; raw file bytes and unread page bodies are not copied.','SSO, external tools, hidden materials and institution-only theme settings are not replicated.']}
        IMPORTS.mkdir(parents=True,exist_ok=True)
        import_id=uuid.uuid4().hex
        path=IMPORTS/(import_id+'.json')
        descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as file:json.dump(selected,file,ensure_ascii=False)
        pages=sum(1 for course in selected['courses'] for item in (course.get('resources') or []) if isinstance(item,dict) and item.get('type')=='page' and isinstance(item.get('bodyHtml'),str))
        setup = Path(ROOT.name) / 'sandbox' / 'canvas_local' / 'setup.py'
        command = f'python3 {quote(str(setup))} import --snapshot {quote(str(path))}'
        return {'id':import_id,'status':'staged','courseCount':len(courses),'assignmentCount':sum(len(c['assignments']) for c in courses),'message':f'Your student-visible snapshot and {pages} readable page bodies are staged locally. Apply it to the initialized Canvas sandbox with the import command.','command':command,'limitations':[*selected['limitations'],*mirror_warnings]}
    except (ValueError,KeyError,TypeError,AttributeError):
        raise HTTPException(422,'Invalid Canvas snapshot. Refresh your signed-in Canvas courses and try again.')
