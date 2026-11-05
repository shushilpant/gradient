"""Download the documented Kokoro runtime assets into the project's runtime folder."""
from pathlib import Path
import urllib.request
ROOT = Path(__file__).resolve().parents[1] / '.runtime' / 'tts'
ROOT.mkdir(parents=True, exist_ok=True)
BASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'
for name in ('kokoro-v1.0.onnx', 'voices-v1.0.bin'):
    target = ROOT / name
    with urllib.request.urlopen(urllib.request.Request(BASE + name, method='HEAD'), timeout=30) as response:
        expected_size = int(response.headers['Content-Length'])
    if target.exists() and target.stat().st_size == expected_size:
        print(f'Already present: {name}')
        continue
    temporary = target.with_suffix(target.suffix + '.download')
    print(f'Downloading {name}…', flush=True)
    urllib.request.urlretrieve(BASE + name, temporary)
    temporary.replace(target)
print('Kokoro assets ready. Restart the assistant to use neural narration.')
