"""Package source, durable data, and a tested static build (run npm run build first)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import json

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=root.parent / 'block-atlas-react-liquikit.zip')
args = parser.parse_args()
files = ['data/minecraft-26.3-bloxd.csv', 'data/registry-ids.json', 'data/previews.json', 'data/snapshot.json',
         'exports/block-atlas.csv', 'exports/block-atlas.pdf', 'exports/block-atlas.txt', 'llms.txt']
for f in files:
    assert (root / 'dist' / f).read_bytes() == (root / 'public' / f).read_bytes(), f'Rebuild the static site first: {f}'
assert (root / 'dist/index.html').exists()
prefix = 'block-atlas/'
lock = json.loads((root / 'package-lock.json').read_text())
licences = {'liquikit/LICENSE': (root / 'src/components/liquikit/LICENSE').read_bytes()}
for rel, info in lock['packages'].items():
    if not rel or info.get('dev') or not (root / rel).is_dir():
        continue
    module = rel.split('node_modules/')[-1]
    for f in sorted((root / rel).iterdir()):
        if f.is_file() and f.name.lower().startswith(('license', 'licence', 'copying', 'copyright')):
            licences[module + '/' + f.name] = f.read_bytes()
with ZipFile(args.output, 'w', ZIP_DEFLATED, compresslevel=8) as bundle:
    for name in ('.env.example', '.gitignore', 'README.md', 'components.json', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'):
        bundle.write(root / name, prefix + name)
    for folder in ('public', 'src', 'source-data', 'scripts', 'dist'):
        for f in sorted((root / folder).rglob('*')):
            rel = f.relative_to(root)
            if f.is_file() and '__pycache__' not in rel.parts:
                path = Path('site', *rel.parts[1:]) if folder == 'dist' else rel
                bundle.write(f, prefix + path.as_posix())
    for name, blob in licences.items():
        bundle.writestr(prefix + 'third-party/' + name, blob)
    bundle.writestr(prefix + 'third-party/NOTICE.md', '# Third-party notices\n\nThe dependencies used for the build are listed in package-lock.json. The reference game textures and names belong to their respective creators.\n')
with ZipFile(args.output) as bundle:
    assert bundle.testzip() is None
    print(f'{args.output.name} · {args.output.stat().st_size:,} bytes · {len(bundle.infolist())} files')
