import json
import pytest
from fastapi import HTTPException
import local_assistant as ai


def request():
    return ai.StudyRequest(assignment={"title": "Study studio"}, studio=True, resources=[{"title": "Lecture", "text": "Recursion reduces problems to smaller instances.", "url": "https://canvas.example/lecture"}])


def test_studio_uses_direct_structured_generation(monkeypatch):
    payload = request()
    quote = payload.resources[0].text
    def model(model, messages, output_type, tokens, **kwargs):
        assert output_type is ai.StudioDeckOutput
        assert 'Markdown field' in messages[0]['content']
        return output_type(title='Recursion', cards=[dict(id=f'c{i}', question='What does recursion do?', answer='Reduces problems', options=['Reduces problems', 'Sorts only', 'Never stops', 'Increases problems'], explanation='Smaller instances.', topic='Recursion', sourceId='S1', quote=quote) for i in range(3)], concepts=[])
    monkeypatch.setattr(ai, 'model_json', model)
    monkeypatch.setattr(ai, 'installed_model', lambda model: None)
    result = ai.generate_study_packet(payload)
    assert len(json.loads(result.markdown)['cards']) == 3


def test_studio_rejects_unreadable_sources():
    with pytest.raises(HTTPException, match='422'):
        ai.generate_studio_packet(ai.StudyRequest(assignment={"title": "Study studio"}, studio=True))


def test_studio_rejects_fabricated_evidence(monkeypatch):
    monkeypatch.setattr(ai, 'model_json', lambda *a, **k: ai.StudioDeckOutput(title='Invalid', cards=[dict(id=str(i), question='What is the answer?', answer='A', options=['A', 'B', 'C', 'D'], explanation='', topic='', sourceId='S1', quote='A fabricated source passage.') for i in range(3)]))
    with pytest.raises(HTTPException, match='502'):
        ai.generate_studio_packet(request())


def make_deck(**updates):
    card = dict(question='What does recursion do?', answer='Reduces problems', options=['Reduces problems', 'Sorts only', 'Never stops', 'Increases problems'], explanation='Smaller instances.', topic='Recursion', sourceId='wrong', quote='', evidenceId='S1P1')
    card.update(updates)
    return ai.StudioDeckOutput(title='Recursion', cards=[dict(card, id=f'c{i}') for i in range(3)], concepts=[])


def test_passage_ids_attach_actual_evidence_not_model_quote(monkeypatch):
    monkeypatch.setattr(ai, 'model_json', lambda *a, **k: make_deck(quote='Model modified the text.'))
    result = json.loads(ai.generate_studio_packet(request()).markdown)
    assert all(card['sourceId'] == 'S1' and card['quote'] == request().resources[0].text for card in result['cards'])


def test_pdf_whitespace_is_resolved_to_original_quote(monkeypatch):
    payload = request()
    payload.resources[0].text = 'Recursion\n reduces  problems to\nsmaller instances.'
    monkeypatch.setattr(ai, 'model_json', lambda *a, **k: make_deck(evidenceId='', quote='Recursion reduces problems to smaller instances.'))
    result = json.loads(ai.generate_studio_packet(payload).markdown)
    assert result['cards'][0]['quote'] == payload.resources[0].text


def test_invalid_evidence_is_repaired_once(monkeypatch):
    calls = []
    def generate(*a, **k):
        calls.append(1)
        return make_deck(evidenceId='invented' if len(calls) == 1 else 'S1P1', answer='A')
    monkeypatch.setattr(ai, 'model_json', generate)
    result = json.loads(ai.generate_studio_packet(request()).markdown)
    assert len(calls) == 2
    assert result['cards'][0]['answer'] == 'Reduces problems'


def test_fabricated_passage_id_and_quote_never_pass(monkeypatch):
    calls = []
    def generate(*a, **k):
        calls.append(1)
        return make_deck(evidenceId='invented', quote='A fabricated source passage.')
    monkeypatch.setattr(ai, 'model_json', generate)
    with pytest.raises(HTTPException):
        ai.generate_studio_packet(request())
    assert len(calls) == 2


def test_smaller_verified_set_survives_failed_supplementary_repair(monkeypatch):
    calls = []
    def generate(*a, **k):
        calls.append(1)
        if len(calls) > 1:
            raise HTTPException(502, 'Repair failed')
        deck = make_deck()
        deck.cards = deck.cards[:2]
        return deck
    monkeypatch.setattr(ai, 'model_json', generate)
    result = json.loads(ai.generate_studio_packet(request()).markdown)
    assert len(result['cards']) == 2
    assert all(card['quote'] == request().resources[0].text for card in result['cards'])


def test_large_study_set_fits_laptop_context_and_discloses_passage_selection(monkeypatch):
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 16384)
    payload = request()
    payload.resources = [ai.MaterialContext(title=f'Lecture {index}', text='Recursion reduces problems to smaller instances. ' * 300, url='https://canvas.example/lecture') for index in range(12)]
    def generate(model, messages, output_type, tokens, **kwargs):
        context = json.loads(messages[1]['content'])
        assert {passage['sourceId'] for passage in context['passages'].values()} == {f'S{index + 1}' for index in range(12)}
        assert sum(len(message['content']) for message in messages) / 3 + tokens + 1024 < 16384
        assert len(context['passages']) < 72
        return make_deck()
    monkeypatch.setattr(ai, 'model_json', generate)
    packet = ai.generate_studio_packet(payload)
    assert packet.warnings and 'selected passages' in packet.warnings[0]
    assert len(json.loads(packet.markdown)['cards']) == 3
