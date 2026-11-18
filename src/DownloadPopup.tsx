import { useEffect, useState } from 'react'
import { ArrowDownToLine, BookOpen, Braces, FileSpreadsheet, FileText, LoaderCircle, Table2 } from 'lucide-react'
import { Dialog } from '@/components/liquikit/dialog'
import { ScrollArea, Separator } from '@/components/liquikit/scroll-area'
import { assetUrl, BUILTIN_URL } from './data'
import { downloadFormats, exportName, friendlyCsv, llmsGuide, quantity, readableText } from './exportFormats'
import type { DownloadSource, ExportKey } from './exportFormats'

const marks = { csv:Table2, pdf:BookOpen, txt:FileText, llms:Braces, raw:FileSpreadsheet }
const mime = Object.fromEntries(downloadFormats.map(f => [f.key,f.mime])) as Record<ExportKey,string>
type Links = Partial<Record<ExportKey,string>>
const bundledLinks: Links = {
  csv:assetUrl('exports/'+exportName('csv',true)), pdf:assetUrl('exports/'+exportName('pdf',true)),
  txt:assetUrl('exports/'+exportName('txt',true)), llms:assetUrl('llms.txt'), raw:BUILTIN_URL,
}

function DownloadRows({ source }: { source:DownloadSource }) {
  const [files,setFiles] = useState<{source:DownloadSource; links:Links; pdfError?:boolean}|null>(null)
  useEffect(() => {
    if (source.bundled) return
    let active = true, worker:Worker|undefined
    const urls:string[]=[]
    const url=(key:ExportKey,payload:BlobPart)=>{
      const path = URL.createObjectURL(new Blob([payload],{type:mime[key]}))
      urls.push(path)
      return path
    }
    const links = {
      raw:url('raw',source.bytes), csv:url('csv',friendlyCsv(source)),
      txt:url('txt',readableText(source)), llms:url('llms',llmsGuide(source)),
    }
    setFiles({source,links})
    const finish = (bytes:ArrayBuffer) => {
      if (active) setFiles({source,links:{...links,pdf:url('pdf',bytes)}})
    }
    const dataset = { rows:source.rows, bundled:false }
    // Generation is local. Fall back to the main thread if a host disallows workers.
    const fallback = () => {
      worker?.terminate();worker=undefined
      void import('./exportPdf').then(({printablePdf}) => {
        if (active) finish(printablePdf(dataset))
      }).catch(() => {if (active) setFiles({source,links,pdfError:true})})
    }
    try {
      worker=new Worker(new URL('./exportPdf.worker.ts',import.meta.url),{type:'module'})
      worker.onmessage=({data}:MessageEvent<{bytes?:ArrayBuffer}>)=>{
        if (!active) return
        if (!data.bytes) { fallback();return }
        worker?.terminate();worker=undefined
        finish(data.bytes)
      }
      worker.onerror=e=>{e.preventDefault();if (active) fallback()}
      worker.postMessage(dataset)
    } catch { fallback() }
    return () => {
      active=false;worker?.terminate()
      for (const path of urls) URL.revokeObjectURL(path)
    }
  },[source])

  const links = source.bundled ? bundledLinks : files?.source===source ? files.links : {}
  const pdfError = files?.source===source && files.pdfError
  const framed = window.self!==window.top
  return <div className="download-body">
    <ul className="download-list" aria-label="Download formats">
      {downloadFormats.map(format => {
        const {key,name,detail,ext}=format, Icon=marks[key]
        const href=links[key]
        const label=<><span className="download-symbol"><Icon size={18} aria-hidden="true"/></span>
          <span className="download-label"><strong>{name}</strong><span>{!href&&key==='pdf'?(pdfError?'PDF could not be prepared. Try reopening Download.':'Preparing your PDF…'):detail}</span></span>
          <span className="download-ext" aria-hidden="true">{ext}</span></>
        return <li key={key} className={key==='raw'?'download-original':undefined}>
          {href ? <a className="download-row" href={href} download={exportName(key,source.bundled)} aria-label={'Download '+name}>
            {label}<ArrowDownToLine size={16} aria-hidden="true" className="download-arrow"/>
          </a> : <div className="download-row" aria-busy={key==='pdf'&&!pdfError||undefined} aria-live={key==='pdf'?'polite':undefined}>
            {label}{key==='pdf'&&!pdfError&&<LoaderCircle size={16} aria-hidden="true" className="spin download-arrow"/>}
          </div>}
        </li>
      })}
    </ul>
    {framed&&<p className="download-tip">If this preview blocks saving, <a href={window.location.href} target="_blank" rel="noopener noreferrer">open it in a new tab</a> and download there.</p>}
  </div>
}

export function DownloadPopup({ source }: {source:DownloadSource}) {
  return <Dialog.Popup className="download-dialog">
    <Dialog.Title>Download Block Atlas</Dialog.Title>
    <Dialog.Description>All {quantity(source.rows.length)} {source.rows.length===1?'block':'blocks'} from the {source.bundled?'bundled atlas':'active CSV'}. Search and filters don’t change these downloads.</Dialog.Description>
    <Separator/>
    <ScrollArea className="dialog-scroll"><DownloadRows source={source}/></ScrollArea>
  </Dialog.Popup>
}
