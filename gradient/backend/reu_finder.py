"""Read-only REU discovery. Only editable topic keywords leave the device."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import re
from urllib.parse import urljoin, urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
try:
    from .local_assistant import local_origin, optional_brave_search, fetch_public_html
    from .public_search import _text, _safe_source_url
except ImportError:
    from local_assistant import local_origin, optional_brave_search, fetch_public_html
    from public_search import _text, _safe_source_url

router = APIRouter(prefix='/api/v1/assistant', dependencies=[Depends(local_origin)])

class Candidate(BaseModel):
    title: str = Field(max_length=500)
    url: str = Field(max_length=3000)

class ReuQuery(BaseModel):
    topics: list[str] = Field(min_length=1, max_length=8)
    candidates: list[Candidate] = Field(default_factory=list, max_length=10)


def application_link(html: str, source_url: str) -> str | None:
    """Return a link actually labelled by the programme page, never a guessed route."""
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.href = None
            self.label = ''
            self.result = None

        def handle_starttag(self, tag, attrs):
            if tag == 'a':
                self.href = dict(attrs).get('href')
                self.label = ''

        def handle_data(self, data):
            if self.href:
                self.label += data[:500]

        def handle_endtag(self, tag):
            if tag == 'a' and self.href:
                if not self.result and re.search(r'\bapply\b|\bapplication\b', self.label, re.I):
                    self.result = _safe_source_url(urljoin(source_url, self.href))
                self.href = None
    parser = Links()
    try:
        parser.feed(html[:500_000])
    except Exception:
        return None
    return parser.result


def discover(topics: list[str], supplied: list[dict] | None = None) -> dict:
    topics = list(dict.fromkeys(_text(item, 60).strip() for item in topics if _text(item, 60).strip()))
    if not topics:
        raise HTTPException(422, 'Add at least one research topic.')
    query = 'REU undergraduate summer research ' + ' '.join(topics)
    records = supplied if supplied else optional_brave_search(query[:250], 10)
    records = [record for record in records if _safe_source_url(record.get('url')) and (urlsplit(record['url']).hostname or '').endswith(('.edu', '.gov', '.ac.uk'))]
    fallback = not records
    if fallback:
        records = [{'title': title, 'url': url} for title, url in [
            ('Minnesota REU', 'https://reu.cs.umn.edu/'),
            ('LSU summer research', 'https://reu.cct.lsu.edu/'),
            ('CUNY research experiences', 'https://www.csi.cuny.edu/academics-and-research/departments-programs/computer-science/research-experiences-undergraduates-reu'),
            ('Charlotte REU', 'https://reu.charlotte.edu/'),
        ]]
    candidates, seen = [], set()
    for record in records:
        url = _safe_source_url(record.get('url'))
        if not url or url in seen:
            continue
        seen.add(url)
        candidates.append({**record, 'url': url})
    def inspect(record):
        try:
            raw, final_url = fetch_public_html(record['url'])
            if not _safe_source_url(final_url):
                return None
            text = _text(raw, 90000)
        except Exception:
            return None  # Unreadable pages cannot count as verified matches.
        if not re.search(r'\bREU\b|research experiences? for undergraduates', text, re.I):
            return None
        matched = [topic for topic in topics if any(re.search(r'\b' + re.escape(word) + r'\b', text, re.I) for word in topic.split() if len(word) > 3 and word.lower() not in {'science', 'research'})]
        if not matched:
            return None
        def excerpt(pattern):
            match = re.search(pattern, text, re.I)
            return text[max(0, match.start()-80):match.end()+240] if match else None
        skill_patterns = [('Python', r'\bPython\b'), ('Data analysis', r'data analysis'), ('Machine learning', r'machine learning'), ('Laboratory techniques', r'laboratory techniques|lab techniques'), ('Microscopy', r'microscopy'), ('Fieldwork', r'fieldwork|field work'), ('Robotics', r'robotics'), ('Scientific computing', r'scientific computing|numerical simulation'), ('Research communication', r'poster presentation|research presentation|scientific writing')]
        skill_evidence = {label: excerpt(pattern) for label, pattern in skill_patterns if re.search(pattern, text, re.I)}
        return {'title': _text(record.get('title'), 300) or urlsplit(final_url).hostname,
                'url': final_url, 'matchedTopics': matched,
                'summary': excerpt(r'\bREU\b|research experiences? for undergraduates'),
                'deadlineEvidence': excerpt(r'application deadline|applications? (?:are )?due|apply by'),
                'eligibilityEvidence': excerpt(r'eligib(?:le|ility)|U\.S\. citizens?|permanent residents?|undergraduate students'),
                'fundingEvidence': excerpt(r'stipend|housing|travel allowance'),
                'skills': list(skill_evidence), 'skillEvidence': skill_evidence,
                'applicationUrl': application_link(raw, final_url),
                'status': 'Check current application cycle'}
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = [item for item in pool.map(inspect, candidates[:5]) if item]
    results.sort(key=lambda item: len(item['matchedTopics']), reverse=True)
    unique = {item['url']: item for item in results}
    return {'opportunities': list(unique.values()), 'query': query[:250],
            'checkedAt': datetime.now(timezone.utc).isoformat(),
            'message': ('Web search was limited; these matches come from university program pages checked directly.' if fallback else '') if results else 'No readable REU pages matched these topics. Try a broader field or use the NSF directory.'}

@router.post('/reu/search')
def search_reus(payload: ReuQuery):
    return discover(payload.topics, [item.model_dump() for item in payload.candidates])
