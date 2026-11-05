"""Local Kokoro speech; model weights on disk, generated audio only in memory."""
import base64
import io
from pathlib import Path
import threading
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import Literal

MODEL_DIR = Path(__file__).resolve().parents[1] / '.runtime' / 'tts'
_LOCK = threading.Lock()
_ENGINE = None

class _TypedSession:
    """Match feed dtypes to the export; kokoro-onnx 0.4.9 sends int speed to float exports."""
    def __init__(self, session):
        self.session = session
    def __getattr__(self, name):
        return getattr(self.session, name)
    def run(self, outputs, inputs):
        import numpy as np
        types = {'tensor(float)': np.float32, 'tensor(int64)': np.int64, 'tensor(int32)': np.int32}
        metadata = {item.name: item.type for item in self.session.get_inputs()}
        return self.session.run(outputs, {name: np.asarray(value, dtype=types[metadata[name]]) if metadata.get(name) in types else value for name, value in inputs.items()})


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: Literal['af_heart', 'af_bella', 'am_michael', 'bf_emma', 'bm_george'] = 'af_heart'

class SpeechOutput(BaseModel):
    data: str
    mimeType: str = 'audio/wav'
    model: str = 'Kokoro-82M'
    voice: str
    duration: float

def synthesize(payload: SpeechRequest) -> SpeechOutput:
    global _ENGINE
    if not payload.text.strip():
        raise HTTPException(422, 'Enter text to narrate.')
    if not all((MODEL_DIR / name).is_file() for name in ('kokoro-v1.0.onnx', 'voices-v1.0.bin')):
        raise HTTPException(503, 'Kokoro speech weights are missing. Run the speech setup script and restart the assistant.')
    try:
        import soundfile as sf
        from kokoro_onnx import Kokoro
    except ImportError as error:
        raise HTTPException(503, 'Install the backend speech dependencies and restart the assistant.') from error
    with _LOCK:
        if _ENGINE is None:
            _ENGINE = Kokoro(str(MODEL_DIR / 'kokoro-v1.0.onnx'), str(MODEL_DIR / 'voices-v1.0.bin'))
            _ENGINE.sess = _TypedSession(_ENGINE.sess)
        samples, rate = _ENGINE.create(payload.text, voice=payload.voice, speed=1.0, lang='en-gb' if payload.voice.startswith('b') else 'en-us')
        output = io.BytesIO()
        sf.write(output, samples, rate, format='WAV', subtype='PCM_16')
        return SpeechOutput(data=base64.b64encode(output.getvalue()).decode(), voice=payload.voice, duration=len(samples) / rate)
