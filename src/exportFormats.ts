import Papa from 'papaparse'
import type { AtlasRow, ColorPair } from './dataset'

export type ExportDataset = { rows: readonly AtlasRow[]; bundled: boolean }
export type DownloadSource = ExportDataset & { bytes: ArrayBuffer }

export const downloadFormats = [
  { key: 'csv', name: 'Spreadsheet CSV', detail: 'Names, matches, colors and notes', ext: 'CSV', mime: 'text/csv;charset=utf-8' },
  { key: 'pdf', name: 'Printable PDF', detail: 'Searchable catalog with a category index', ext: 'PDF', mime: 'application/pdf' },
  { key: 'txt', name: 'Plain text', detail: 'Readable entries with limitations', ext: 'TXT', mime: 'text/plain;charset=utf-8' },
  { key: 'llms', name: 'llms.txt', detail: 'Dataset guide and links for AI tools', ext: 'TXT', mime: 'text/plain;charset=utf-8' },
  { key: 'raw', name: 'Original CSV', detail: 'All source columns, saved unchanged', ext: 'CSV', mime: 'text/csv;charset=utf-8' },
] as const
export type ExportKey = typeof downloadFormats[number]['key']

export function exportName(kind: ExportKey, bundled: boolean) {
  if (kind === 'llms') return 'llms.txt'
  const stem = bundled ? 'block-atlas' : 'block-atlas-custom'
  return kind === 'raw' ? `${stem}-source.csv` : `${stem}.${kind}`
}

const english = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
export const quantity = (n: number) => n.toLocaleString('en-US')
export const score = (n: number | null) => n === null ? '' : Number.isInteger(n) ? n.toFixed(1) : String(n)
export const sourceLabel = (bundled: boolean) => bundled ? 'Minecraft Java 26.3 · bundled reference' : 'Custom CSV'
export const matchName = (r: AtlasRow) => r.bloxdExact || r.bloxd || 'No suggestion'
export const listByName = (rows: readonly AtlasRow[]) => [...rows].sort((a,b) => english.compare(a.name,b.name) || a.id.localeCompare(b.id))
export function categoryGroups(rows: readonly AtlasRow[]) {
  const groups = new Map<string, AtlasRow[]>()
  for (const r of listByName(rows)) {
    const group = groups.get(r.category)
    if (group) group.push(r)
    else groups.set(r.category, [r])
  }
  return [...groups].sort(([a],[b]) => english.compare(a,b))
}

export function friendlyCsv({ rows }: ExportDataset) {
  // Reimportable headings. Escape formula-like values from user-provided files;
  // the Original CSV download always preserves unmodified source bytes.
  return '\ufeff' + Papa.unparse({
    fields: ['Minecraft block', 'Minecraft block ID', 'Bloxd block', 'Bloxd exact block or state name', 'Replacement tier', 'Color difference ΔE00', 'Atlas category', 'Generation stage', 'Dimensions', 'Minecraft mean top sRGB', 'Bloxd mean top sRGB', 'Minecraft mean sides sRGB', 'Bloxd mean sides sRGB', 'Minecraft mean exposed sRGB', 'Bloxd mean exposed sRGB', 'Real limitations'],
    data: listByName(rows).map(r => [r.name, r.id, r.bloxd, r.bloxdExact !== r.bloxd ? r.bloxdExact : '', r.verdict, score(r.delta), r.category, r.stage, r.dimension, r.top.mc, r.top.bloxd, r.side.mc, r.side.bloxd, r.exposed.mc, r.exposed.bloxd, r.note]),
  }, { newline: '\r\n', escapeFormulae: true }) + '\r\n'
}

const singleLine = (s: string) => s.replace(/\s+/g,' ').trim()
function wrap(s: string, lead: string, width = 96) {
  const lines: string[] = []
  const pad = ' '.repeat(lead.length)
  let line = lead
  for (const word of singleLine(s).split(' ')) {
    if (line.length > lead.length && line.length+1+word.length > width) {
      lines.push(line)
      line = pad+word
    } else line += (line.length===lead.length?'':' ')+word
  }
  return [...lines,line].join('\n')
}
const colorPair = (name: string, c: ColorPair) => c.mc || c.bloxd
  ? `  ${name}: ${c.mc || 'not recorded'} → ${c.bloxd || 'not recorded'}` : ''

export function readableText({ rows, bundled }: ExportDataset) {
  const groups = categoryGroups(rows), scored = rows.filter(r => r.delta !== null).length
  const out = [
    'BLOCK ATLAS', 'Minecraft → Bloxd.io', sourceLabel(bundled),
    `${quantity(rows.length)} blocks · ${quantity(scored)} scored · ${quantity(rows.length-scored)} unscored`, '',
    'HOW TO READ',
    'Entries are grouped by category, then sorted by block name. Search for an exact',
    'Minecraft ID such as minecraft:oak_log. The score is CIEDE2000 (ΔE00); lower means',
    'closer measured color, not equivalent behavior. “Not scored” does not mean zero.',
    'Colors are sRGB hex values. Terrain/texture states and available blocks may vary.', '',
    'CATEGORY INDEX', ...groups.map(([name, blockRows]) => `${singleLine(name)} (${quantity(blockRows.length)})`), '',
  ]
  for (const [category, blocks] of groups) {
    out.push('='.repeat(84), `${singleLine(category)} (${quantity(blocks.length)} blocks)`, '='.repeat(84), '')
    for (const r of blocks) {
      out.push(singleLine(r.name), `  ID: ${r.id}`, wrap(matchName(r), '  Bloxd: '),
        wrap(`${r.verdict} · ${r.delta===null ? 'not scored' : `ΔE00 ${score(r.delta)}`}`, '  Match: '),
        wrap([r.stage,r.dimension].filter(Boolean).join(' · '), '  Collection: '),
        ...[colorPair('Top',r.top), colorPair('Sides',r.side), colorPair('Exposed',r.exposed)].filter(Boolean))
      if (r.note) out.push(wrap(r.note, '  Notes: '))
      out.push('')
    }
  }
  return out.join('\n')
}

export function llmsGuide({ rows, bundled }: ExportDataset, prefix = bundled ? './exports/' : './') {
  const n = quantity(rows.length), scored = quantity(rows.filter(r => r.delta !== null).length)
  const link = (kind: ExportKey) => `${prefix}${exportName(kind,bundled)}`
  const raw = bundled ? './data/minecraft-26.3-bloxd.csv' : link('raw')
  return `# Block Atlas

> ${n} Minecraft block IDs with Bloxd.io suggestions and surface-color comparisons from ${bundled ? 'the bundled Java Edition 26.3 reference' : 'a user-provided CSV'}. There are ${scored} scored rows.

Use the exact Minecraft block ID as the key. Each row describes a representative block or state, not every possible state, biome, rotation, or animation frame. Suggestions may be decorative or mode-dependent rather than functionally equivalent. The bundled atlas uses reviewed candidate shortlists, not an exhaustive nearest-color search.

## Catalog downloads

- [Spreadsheet CSV](${link('csv')}): One block per row, with exact IDs, suggested Bloxd names/states, tiers, overall scores, sRGB swatches and notes.
- [Plain-text catalog](${link('txt')}): All ${n} entries grouped by category, with searchable IDs and readable limitations.
- [Printable PDF](${link('pdf')}): A compact reference with category navigation, names, IDs, suggestions and scores.
- [Original CSV](${raw}): Source columns unchanged.${bundled ? '\n- [Snapshot metadata](./data/snapshot.json): Reference versions, counts and asset pins.' : ''}

## How to read the data

- Color difference is CIEDE2000 (ΔE00). Lower is closer in measured color. A blank score means unscored, not zero.
- Match tiers describe suitability, not numerical thresholds. Read the limitations before treating a suggestion as a replacement.
- Mean sRGB colors are written as \`#RRGGBB\`. Top, sides and exposed samples are distinct. Missing samples must not be inferred.
- When a Bloxd state name is absent from the simplified CSV, use the base suggestion if present. A missing suggestion is not an instruction to use air or dirt.
${bundled ? '\nThe interactive atlas can load other CSVs. The files linked here document the bundled snapshot.\n' : '\nKeep this file alongside the companion downloads. The original source URL is not embedded.\n'}`
}
