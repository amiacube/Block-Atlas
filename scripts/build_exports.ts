import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseCsv } from '../src/dataset'
import { exportName, friendlyCsv, llmsGuide, readableText } from '../src/exportFormats'
import { printablePdf } from '../src/exportPdf'

const publicDir = new URL('../public/',import.meta.url)
const exportsDir = new URL('exports/',publicDir)
const source = new URL('data/minecraft-26.3-bloxd.csv',publicDir)
const { rows } = parseCsv(await readFile(source,'utf8'))
const data = { rows, bundled:true }
await mkdir(exportsDir,{recursive:true})
await Promise.all([
  writeFile(new URL(exportName('csv',true),exportsDir),friendlyCsv(data)),
  writeFile(new URL(exportName('txt',true),exportsDir),readableText(data)),
  writeFile(new URL('llms.txt',publicDir),llmsGuide(data)),
  writeFile(new URL(exportName('pdf',true),exportsDir),new Uint8Array(printablePdf(data))),
])
console.log(`Prepared CSV, PDF, TXT and llms.txt for ${rows.length.toLocaleString('en-US')} blocks.`)
