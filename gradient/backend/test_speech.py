import base64
import io
from unittest.mock import Mock
import numpy as np
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
import speech_service as speech


def test_restricts_voice_and_text():
    with pytest.raises(ValidationError):
        speech.SpeechRequest(text='Hello', voice='arbitrary-file-path')
    with pytest.raises(ValidationError):
        speech.SpeechRequest(text='x' * 5001)


def test_missing_weights_has_useful_error(monkeypatch, tmp_path):
    monkeypatch.setattr(speech, 'MODEL_DIR', tmp_path)
    with pytest.raises(HTTPException, match='weights are missing'):
        speech.synthesize(speech.SpeechRequest(text='Hello'))


def test_generates_pcm_wav_and_uses_selected_voice(monkeypatch, tmp_path):
    sf = pytest.importorskip('soundfile')
    pytest.importorskip('kokoro_onnx')
    for name in ('kokoro-v1.0.onnx', 'voices-v1.0.bin'):
        (tmp_path / name).touch()
    engine = Mock()
    engine.create.return_value = (np.zeros(24000, dtype=np.float32), 24000)
    monkeypatch.setattr(speech, 'MODEL_DIR', tmp_path)
    monkeypatch.setattr(speech, '_ENGINE', engine)
    result = speech.synthesize(speech.SpeechRequest(text='A natural spoken lesson.', voice='bf_emma'))
    raw = base64.b64decode(result.data)
    assert raw.startswith(b'RIFF')
    samples, rate = sf.read(io.BytesIO(raw))
    assert len(samples) == rate == 24000
    assert result.duration == 1
    assert engine.create.call_args.kwargs['voice'] == 'bf_emma'
    assert engine.create.call_args.kwargs['lang'] == 'en-gb'


def test_export_input_types_are_respected():
    from types import SimpleNamespace
    session = Mock()
    session.get_inputs.return_value = [SimpleNamespace(name='speed', type='tensor(float)'), SimpleNamespace(name='input_ids', type='tensor(int64)')]
    adapter = speech._TypedSession(session)
    adapter.run(None, {'speed': np.array([1], dtype=np.int32), 'input_ids': [[0,1,0]]})
    feed = session.run.call_args.args[1]
    assert feed['speed'].dtype == np.float32
    assert feed['input_ids'].dtype == np.int64
