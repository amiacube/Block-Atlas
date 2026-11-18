import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight, Database, LoaderCircle, Link2 } from 'lucide-react'
import { Button } from '@/components/liquikit/button'
import { Dialog } from '@/components/liquikit/dialog'
import { Field, Form, Input } from '@/components/liquikit/field'
import { ScrollArea, Separator } from '@/components/liquikit/scroll-area'
import { BUILTIN_URL, checkedUrl, friendlySource, FULL_COUNT, initialUrl, loadCsv, persistUrl, type CsvResult, type PreviewMap } from './data'
import { Catalog } from './Catalog'
import { fmt } from './Navigation'
import { HelpDialog } from './details'
import { useMedia } from './hooks'

type Problem={url:string;message:string}
type Dataset=CsvResult&{requestUrl:string}
const NO_ROWS:Dataset['rows']=[]
const describeError=(e:unknown)=>e instanceof TypeError?'This URL couldn’t be fetched. Check that the file is public and that the host allows cross-origin requests (CORS).':e instanceof Error?e.message:'The CSV could not be loaded.'

export default function App({artwork,registry}:{artwork:Promise<PreviewMap|null>;registry:Promise<string[]|null>}){
 const [art,setArt]=useState<PreviewMap|null>(null),[ids,setIds]=useState<string[]|null>(null)
 useEffect(()=>{let active=true;void artwork.then(x=>{if(active)setArt(x)});void registry.then(x=>{if(active&&Array.isArray(x))setIds(x)});return()=>{active=false}},[artwork,registry])
 const [initial]=useState(initialUrl),[data,setData]=useState<Dataset|null>(null),[pending,setPending]=useState(initial.url)
 const [problem,setProblem]=useState<Problem|null>(initial.message?{url:initial.url,message:initial.message}:null)
 const [sourceOpen,setSourceOpen]=useState(false),[draft,setDraft]=useState(''),[draftError,setDraftError]=useState('')
 const task=useRef<AbortController|null>(null),sourceInput=useRef<HTMLInputElement>(null)
 const compact=useMedia('(max-width:48rem)')
 const request=useCallback(async(url:string,apply:boolean)=>{
   task.current?.abort();const controller=new AbortController();task.current=controller
   setPending(url);if(apply||!initial.message)setProblem(null)
   const timer=window.setTimeout(()=>controller.abort('timeout'),20_000)
   try{
     const result=await loadCsv(url,controller.signal)
     if(task.current!==controller||controller.signal.aborted)return
     setData({...result,requestUrl:url});if(apply){persistUrl(url);setSourceOpen(false)}
   }catch(e){
     if(task.current!==controller||(controller.signal.aborted&&controller.signal.reason!=='timeout'))return
     setProblem({url,message:controller.signal.reason==='timeout'?'The CSV didn’t respond within 20 seconds. Try again or check the link.':describeError(e)})
   }finally{window.clearTimeout(timer);if(task.current===controller){task.current=null;setPending('')}}
 },[initial.message])
 useEffect(()=>{void request(initial.url,false);return()=>{task.current?.abort();task.current=null}},[initial.url,request])
 const rows=data?.rows||NO_ROWS
 const bundled=data?.requestUrl===BUILTIN_URL
 const coverage=useMemo(()=>{
   if(!data||!ids)return null
   const actual=new Set(rows.map(r=>r.id)),expected=new Set(ids)
   const present=ids.reduce((n,id)=>n+Number(actual.has(id)),0)
   return {present,extra:rows.reduce((n,r)=>n+Number(!expected.has(r.id)),0),complete:present===ids.length&&rows.length===ids.length}
 },[data,ids,rows])
 function changeSource(open:boolean){
   if(open){const url=problem?.url||data?.requestUrl||initial.url;setDraft(url===BUILTIN_URL?'':url);setDraftError('')}
   setSourceOpen(open)
 }
 const reset=()=>{setDraft('');setDraftError('');void request(BUILTIN_URL,true)}
 const submit=(e:FormEvent)=>{
   e.preventDefault()
   try{const url=checkedUrl(draft);setDraftError('');void request(url,true)}catch(error){setDraftError(describeError(error));sourceInput.current?.focus()}
 }
 const exports=useMemo(()=>data?{rows:data.rows,bytes:data.bytes,bundled}:null,[data,bundled])
 const form=<Form className="source-fields" onSubmit={submit} noValidate>
     <div className="source-current"><span>Active source</span><strong>{!data?'None':bundled?'Bundled CSV':'Custom CSV'}</strong>
      {data&&!bundled&&<a href={data.requestUrl} title={data.requestUrl} target="_blank" rel="noreferrer">{friendlySource(data.requestUrl)} <ArrowUpRight size={13} aria-hidden="true"/></a>}
     </div>
     <Field.Root>
       <Field.Label htmlFor="csv-url">CSV URL</Field.Label>
       <Input ref={sourceInput} id="csv-url" leading={<Link2 size={16}/>} inputMode="url" type="text" value={draft} placeholder="https://example.com/blocks.csv" autoComplete="off" spellCheck={false} onChange={e=>{setDraft(e.target.value);setDraftError('')}} onFocus={e=>e.currentTarget.select()} aria-describedby="csv-hint" aria-invalid={!!draftError||problem?.url===draft||undefined}/>
       <Field.Description id="csv-hint">Use a public CSV link with one unique block ID per row. External hosts must allow browser requests.</Field.Description>
     </Field.Root>
     {(draftError||problem)&&<p className="form-error" role="alert">{draftError||problem?.message}{!draftError&&data?' The last loaded CSV is still displayed.':''}</p>}
     <div className="dialog-actions"><Button type="button" size="small" onClick={reset} disabled={!!pending}>Use bundled CSV</Button><Button type="submit" size="small" variant="prominent" disabled={!!pending}>{pending?<><LoaderCircle className="spin"/> Loading…</>:'Load CSV'}</Button></div>
   </Form>
 const settings=<Dialog.Root open={sourceOpen} onOpenChange={changeSource}>
   <Dialog.Trigger size="regular" icon={compact} aria-label="CSV source" title="CSV source"><Database aria-hidden="true"/>{!compact&&'CSV source'}</Dialog.Trigger>
   <Dialog.Popup className="source-dialog" initialFocus={compact?undefined:sourceInput}>
     <Dialog.Title>CSV source</Dialog.Title>
     <Dialog.Description>Choose the bundled registry or load a CSV from your own URL.</Dialog.Description>
     <Separator/>
     <ScrollArea className="dialog-scroll">{form}</ScrollArea>
   </Dialog.Popup>
 </Dialog.Root>
 const notice=problem?<div className="catalog-notice" role="status"><p><strong>{data?'Source not changed.':'CSV not loaded.'}</strong> {problem.message}{data?' Showing the last loaded CSV.':''}</p>{!data&&<Button size="small" onClick={reset}>Use bundled CSV</Button>}</div>:data&&(coverage&&!coverage.complete||data.warnings.length>0)?<div className="catalog-notice" role="status">{coverage&&!coverage.complete&&<p>This CSV has <strong>{fmt(coverage.present)} of {fmt(FULL_COUNT)}</strong> reference IDs{coverage.extra?` and ${fmt(coverage.extra)} extra ${coverage.extra===1?'ID':'IDs'}`:''}.</p>}{data.warnings.map(w=><p key={w}>{w}</p>)}</div>:null
 return <Catalog rows={rows} artwork={bundled?art:null} busy={!!pending} notice={notice} downloadSource={exports} settings={settings} help={<HelpDialog/>}/>
}
