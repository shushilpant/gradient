"""Create a deterministic install archive from a verified extension build."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
manifest = json.loads((dist / 'manifest.json').read_text())
required = ['manifest.json', manifest['background']['service_worker'], manifest['options_ui']['page']]
required.extend(script for entry in manifest['content_scripts'] for script in entry.get('js', []))
required.extend(manifest['icons'].values())
for path in required:
    if not (dist / path).is_file():
        raise SystemExit(f'Missing extension asset: {path}. Run npm run build first.')
archive = root / 'offcanvas-extension.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in sorted(dist.rglob('*')):
        if not path.is_file() or path.name in {'preview.js', '.DS_Store'}:
            continue
        relative = path.relative_to(dist).as_posix()
        info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        output.writestr(info, path.read_bytes())
print(f'{archive} ({archive.stat().st_size:,} bytes), version {manifest["version"]}')
