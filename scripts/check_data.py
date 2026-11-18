"""Verify the distributable without downloading assets or installing Python dependencies."""
from pathlib import Path
from collections import Counter
import argparse, csv, json, re, math

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--registries', type=Path, help='Optional original Java registry JSON from scripts/fetch_inputs.py')
args = p.parse_args()
D = ROOT / 'public/data'

def csv_by_id(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file))
    records = {r['Minecraft block ID']: r for r in rows}
    assert len(records) == len(rows), 'Duplicate IDs'
    return records

snap = json.loads((D / 'snapshot.json').read_text())
registry = set(json.loads((D / 'registry-ids.json').read_text()))
if args.registries:
    independent = {'minecraft:' + r.removeprefix('minecraft:') for r in json.loads(args.registries.read_text())}
    assert independent == registry, 'Input Java registry differs from exported index'
rows = csv_by_id(D / 'minecraft-26.3-bloxd.csv')
assert len(rows) == len(registry) == snap['blockIds'] == 1286
assert set(rows) == registry
assert all(re.fullmatch(r'minecraft:[a-z0-9_]+', k) for k in registry)
assert not {'minecraft:item_frame', 'minecraft:glow_item_frame'} & registry
old = csv_by_id(ROOT / 'source-data/worldgen-palette.csv')
assert len(old) == 608
assert all(all(rows[k][col] == v for col, v in row.items()) for k, row in old.items())
assert Counter(r['Generation stage'] for r in rows.values()) == snap['stages'] == {'World generation':598, 'After generation':10, 'Other registered':678}
assert Counter(r['Replacement tier'] for r in rows.values()) == snap['verdicts']
assert all(r['Atlas category'] for r in rows.values())
hexcols = [f'{game} mean {face} sRGB' for game in ('Minecraft', 'Bloxd') for face in ('top', 'sides', 'exposed')]
for k, row in rows.items():
    for col in hexcols:
        assert not row[col] or re.fullmatch(r'#[0-9A-F]{6}', row[col]), (k, col)
    for col in ('Top ΔE00', 'Sides ΔE00', 'Color difference ΔE00'):
        assert not row[col] or (math.isfinite(float(row[col])) and float(row[col]) >= 0), (k, col)
    if not row['Bloxd exact block or state name']:
        assert not row['Bloxd registry ID'] and not row['Color difference ΔE00']
    assert bool(row['Bloxd exact block or state name']) == bool(row['Bloxd registry ID']), k
missing = {k for k, r in rows.items() if not r['Color difference ΔE00']}
assert missing == {'minecraft:'+v for v in ('air','cave_air','void_air','light','barrier','structure_void','moving_piston')}
assert len(rows) - len(missing) == snap['measured'] == 1279
preview = json.loads((D / 'previews.json').read_text())
assert {'minecraft:' + k for k in preview['m']} == registry
assert all(r['Bloxd exact block or state name'] in preview['b'] for r in rows.values() if r['Bloxd exact block or state name'])
print('OK: all 1,286 registry IDs, 608 original records retained verbatim, 1,279 scored, seven explicitly unscored.')
