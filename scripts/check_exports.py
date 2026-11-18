"""Check the bundled reader exports against the authoritative CSV.

Optional PDF text/layout check: install pymupdf, then pass --pdf.
"""
import argparse
import csv
import pathlib
import re

public = pathlib.Path(__file__).resolve().parents[1] / 'public'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pdf', action='store_true')
args = parser.parse_args()


def load(path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return {row['Minecraft block ID']: row for row in csv.DictReader(stream)}


original = load(public / 'data/minecraft-26.3-bloxd.csv')
simple = load(public / 'exports/block-atlas.csv')
assert set(original) == set(simple), 'Spreadsheet CSV differs in registry membership'
for key, values in original.items():
    export = simple[key]
    for column in ('Minecraft block', 'Bloxd block', 'Replacement tier', 'Atlas category', 'Real limitations', 'Minecraft mean sides sRGB', 'Bloxd mean top sRGB'):
        assert values[column].strip() == export[column], (key, column)
    exact = export['Bloxd exact block or state name'] or export['Bloxd block']
    assert exact == (values['Bloxd exact block or state name'] or values['Bloxd block']).strip(), key
    raw_score = values['Color difference ΔE00']
    assert (float(raw_score) if raw_score else None) == (float(export['Color difference ΔE00']) if export['Color difference ΔE00'] else None), key

text = (public / 'exports/block-atlas.txt').read_text(encoding='utf-8')
ids = re.findall(r'^  ID: (\S+)$', text, re.MULTILINE)
assert len(ids) == len(original) and set(ids) == set(original), 'Plain-text catalog is missing IDs'
llms = (public / 'llms.txt').read_text(encoding='utf-8')
assert llms.startswith('# Block Atlas\n\n> ')
assert f'{len(original):,}' in llms
links = re.findall(r'\]\(\./([^\)]+)\)', llms)
assert len(links) >= 4 and all((public / p).is_file() for p in links), 'llms.txt contains an invalid link'
assert (public / 'exports/block-atlas.pdf').read_bytes().startswith(b'%PDF-')
if args.pdf:
    import pymupdf
    with pymupdf.open(public / 'exports/block-atlas.pdf') as pdf:
        found = {m for page in pdf for m in re.findall(r'^[a-z0-9_.-]+:[a-z0-9_./-]+$', page.get_text(), re.MULTILINE)}
        assert found == set(original), f'PDF missing exact searchable IDs: {set(original)-found}'
        assert len(pdf[0].get_links()) == len({r['Atlas category'] for r in original.values()})
        assert all(page.rect.contains(pymupdf.Rect(b[:4])) for page in pdf for b in page.get_text('blocks'))
        print(f'PDF: {pdf.page_count} searchable pages, linked category index, all IDs, no text outside the pages.')
print(f'CSV, TXT and llms.txt: {len(original):,} registry IDs and valid companion links.')
