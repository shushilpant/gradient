from backend import reu_finder as reu


def test_discovery_reads_sources_filters_and_deduplicates(monkeypatch):
    monkeypatch.setattr(reu, 'optional_brave_search', lambda q,n: [
        {'title':'Robotics REU','url':'https://university.edu/reu'},
        {'title':'Duplicate','url':'https://university.edu/reu'},
        {'title':'Ordinary lecture','url':'https://university.edu/lecture'},
        {'title':'Private','url':'http://127.0.0.1/private'}])
    monkeypatch.setattr(reu, 'fetch_public_html', lambda url: (
        '<p>Robotics REU: undergraduate students build robots. Application deadline February 1, 2027. Stipend provided.</p>' if url.endswith('/reu') else '<p>Robotics lecture</p>', url))
    result=reu.discover(['robotics'])
    assert len(result['opportunities']) == 1
    item=result['opportunities'][0]
    assert item['matchedTopics'] == ['robotics']
    assert 'February 1' in item['deadlineEvidence']
    assert 'undergraduate' in item['eligibilityEvidence']
    assert 'Stipend' in item['fundingEvidence']
    assert item['skills'] == ['Robotics']
    assert 'Robotics REU' in item['skillEvidence']['Robotics']


def test_unreadable_pages_are_not_verified_matches(monkeypatch):
    monkeypatch.setattr(reu,'optional_brave_search',lambda q,n:[{'title':'REU','url':'https://university.edu/reu'}])
    def failed(url): raise ValueError('blocked')
    monkeypatch.setattr(reu,'fetch_public_html',failed)
    assert reu.discover(['biology'])['opportunities'] == []


def test_no_fabricated_deadline(monkeypatch):
    monkeypatch.setattr(reu,'optional_brave_search',lambda q,n:[{'title':'Biology REU','url':'https://university.edu/reu'}])
    monkeypatch.setattr(reu,'fetch_public_html',lambda url: ('Biology REU program',url))
    item=reu.discover(['biology'])['opportunities'][0]
    assert item['deadlineEvidence'] is None
    assert item['applicationUrl'] is None
    assert item['status'] == 'Check current application cycle'


def test_application_links_are_sourced_not_guessed():
    assert reu.application_link('<a href="/research/apply">Apply for REU</a>', 'https://university.edu/reu') == 'https://university.edu/research/apply'
    assert reu.application_link('<a href="javascript:alert(1)">Apply now</a>', 'https://university.edu/reu') is None
    assert reu.application_link('<a href="http://127.0.0.1/admin">Application</a>', 'https://university.edu/reu') is None
    assert reu.application_link('Applications close soon.', 'https://university.edu/reu') is None
