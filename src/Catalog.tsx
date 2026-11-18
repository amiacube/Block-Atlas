import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { ArrowDownToLine, ChevronLeft, ChevronRight, Layers3, LoaderCircle, PanelRight, SearchX } from 'lucide-react'
import { Button } from '@/components/liquikit/button'
import { Dialog } from '@/components/liquikit/dialog'
import { DownloadPopup } from './DownloadPopup'
import type { DownloadSource } from './exportFormats'
import { ScrollArea } from '@/components/liquikit/scroll-area'
import { SearchField } from '@/components/liquikit/search-field'
import { SegmentedControl } from '@/components/liquikit/segmented-control'
import { Toolbar } from '@/components/liquikit/toolbar'
import { assetUrl, clean, type AtlasRow, type PreviewMap } from './data'
import { BlockThumb, Comparison, EmptyComparison, formatDelta, MatchLabel, suggestion, Swatches, thumbImg } from './details'
import { useMedia } from './hooks'
import { ALL, CategoryPicker, fmt, SCOPES, ViewMenu, type Scope } from './Navigation'

const collator=new Intl.Collator('en',{sensitivity:'base',numeric:true})
const priority=['Direct counterpart','Build substitute','Visual only','Exact empty space','No standalone block']
const defaultId='minecraft:acacia_log'
const focusedSearch='atlas-search'
// Row actions use the kit's clear button without a floating shadow on every row.
const rowLens={edgeShadow:'none',restEdgeShadow:'none'}
const bid=(id:string)=>`inspect-${id}`
const nameOrder=(a:AtlasRow,b:AtlasRow)=>collator.compare(a.name,b.name)||a.id.localeCompare(b.id)

type Props={rows:AtlasRow[];artwork:PreviewMap|null;busy:boolean;notice?:ReactNode;downloadSource:DownloadSource|null;settings:ReactNode;help:ReactNode}
export function Catalog({rows,artwork,busy,notice,downloadSource,settings,help}:Props){
 const wide=useMedia('(min-width:65rem)'),phone=useMedia('(max-width:39rem)')
 const [query,setQuery]=useState(''),[scope,setScope]=useState<Scope>(ALL),[category,setCategory]=useState(ALL),[verdict,setVerdict]=useState(ALL),[sort,setSort]=useState('alphabet')
 const [selectedId,setSelectedId]=useState(defaultId),[focusId,setFocusId]=useState(defaultId),[inspector,setInspector]=useState(true),[drillIn,setDrillIn]=useState(false)
 const rowsRef=useRef(rows),listArea=useRef<HTMLDivElement>(null),compareArea=useRef<HTMLDivElement>(null)
 const listNotice=useRef<HTMLHeadingElement>(null),lastButton=useRef<string|null>(null),requestFocus=useRef<string|null>(null),savedOffset=useRef(0)
 const getPort=useCallback(()=>listArea.current,[])
 const q=useDeferredValue(clean(query))
 const scoped=useMemo(()=>scope===ALL?rows:rows.filter(r=>r.stage===scope),[rows,scope])
 const categories=useMemo(()=>[...new Set(scoped.map(r=>r.category))].sort(collator.compare),[scoped])
 const verdicts=useMemo(()=>[...new Set(rows.map(r=>r.verdict))].sort((a,b)=>{
   const A=priority.indexOf(a),B=priority.indexOf(b);return (A<0?99:A)-(B<0?99:B)||collator.compare(a,b)
 }),[rows])
 const filtered=useMemo(()=>{
   const tokens=q.split(' ').filter(Boolean)
   const result=scoped.filter(r=>(category===ALL||r.category===category)&&(verdict===ALL||r.verdict===verdict)&&tokens.every(t=>r.haystack.includes(t)))
   result.sort((a,b)=>{
     if(sort==='near'||sort==='far'){
       if(a.delta===null||b.delta===null)return a.delta===b.delta?nameOrder(a,b):a.delta===null?1:-1
       return (sort==='near'?a.delta-b.delta:b.delta-a.delta)||nameOrder(a,b)
     }
     return sort==='reverse'?nameOrder(b,a):nameOrder(a,b)
   })
   return result
 },[scoped,category,verdict,sort,q])
 const index=useMemo(()=>new Map(filtered.map((r,i)=>[r.id,i])),[filtered])
 const selected=index.has(selectedId)?filtered[index.get(selectedId)!]:filtered[0]
 const compactDetail=Boolean(!wide&&drillIn&&selected)
 const compareVisible=Boolean(wide&&inspector||compactDetail)
 const rowSize=phone?62:53
 const virtual=useVirtualizer({count:filtered.length,getScrollElement:getPort,estimateSize:()=>rowSize,overscan:8,getItemKey:(i)=>filtered[i].id,initialRect:{height:560,width:700}})
 const items=virtual.getVirtualItems(),remaining=virtual.getTotalSize()-(items.at(-1)?.end||0)
 const focusIndex=index.get(focusId)
 const focusVisible=focusIndex!==undefined&&virtual.range&&focusIndex>=virtual.range.startIndex&&focusIndex<=virtual.range.endIndex
 const visibleIndex=virtual.range?.startIndex??items[0]?.index??0
 const tabRow=focusVisible?focusId:filtered[visibleIndex]?.id
 const reset=()=>{setScope(ALL);setCategory(ALL);setVerdict(ALL);setSort('alphabet');setQuery('')}
 useEffect(()=>{if(rows!==rowsRef.current){rowsRef.current=rows;reset();setSelectedId(defaultId);setFocusId(defaultId);setDrillIn(false)}},[rows])
 useEffect(()=>{setDrillIn(false)},[wide])
 useLayoutEffect(()=>{virtual.measure()},[rowSize,virtual])
 useLayoutEffect(()=>{const el=getPort();if(el)el.scrollTop=0},[getPort,scope,category,verdict,q,sort])
 useLayoutEffect(()=>{const el=compareArea.current;if(el)el.scrollTop=0},[selected?.id,compareVisible])
 useLayoutEffect(()=>{
   if(compactDetail){listNotice.current?.focus({preventScroll:true});return}
   if(lastButton.current){
     const buttonId=lastButton.current
     lastButton.current=null
     const el=getPort()
     if(el)el.scrollTop=savedOffset.current
     const target=document.getElementById(buttonId)
     if(target)target.focus({preventScroll:true})
     else {requestFocus.current=buttonId;el?.focus({preventScroll:true})}
   }
 },[compactDetail,getPort])
 useLayoutEffect(()=>{
   if(!requestFocus.current||compactDetail)return
   const el=document.getElementById(requestFocus.current)
   if(el){requestFocus.current=null;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'})}
 },[items,focusId,compactDetail])
 useEffect(()=>{
  const shortcut=(e:KeyboardEvent)=>{
    if(document.querySelector('.glass-ui-popup[data-open]'))return
    const t=e.target instanceof HTMLElement?e.target:null,editable=t?.isContentEditable||t?.matches('input,textarea,select')
    if((e.key.toLowerCase()==='k'&&(e.metaKey||e.ctrlKey))||(e.key==='/'&&!editable&&!e.altKey&&!e.metaKey&&!e.ctrlKey)){
      const input=document.getElementById(focusedSearch);if(input){e.preventDefault();input.focus()}
    }else if(e.key==='Escape'&&t?.id===focusedSearch)setQuery('')
    else if(e.key==='Escape'&&compactDetail&&!editable&&!e.defaultPrevented)setDrillIn(false)
  }
  window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut)
 },[compactDetail])
 const pick=(id:string)=>{setSelectedId(id);setFocusId(id);if(wide)setInspector(true);else{savedOffset.current=getPort()?.scrollTop||0;lastButton.current=bid(id);setDrillIn(true)}}
 const handleKey=(event:ReactKeyboardEvent<HTMLButtonElement>,i:number)=>{
   const key=event.key
   if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(key))return
   event.preventDefault()
   const page=Math.max(1,Math.floor((getPort()?.clientHeight||rowSize)/rowSize)-1)
   const wanted=key==='Home'?0:key==='End'?filtered.length-1:i+({'ArrowDown':1,'ArrowUp':-1,'PageDown':page,'PageUp':-page}[key]||0)
   const target=Math.min(filtered.length-1,Math.max(0,wanted)),r=filtered[target]
   if(!r)return
   if(wide)setSelectedId(r.id)
   setFocusId(r.id);requestFocus.current=bid(r.id)
   const existing=document.getElementById(bid(r.id))
   if(existing){requestFocus.current=null;existing.focus({preventScroll:true});existing.scrollIntoView({block:'nearest',inline:'nearest'})}
   else virtual.scrollToIndex(target,{align:key==='End'?'end':'start'})
 }
 const showEmpty=filtered.length===0
 return <div className="app-shell" data-detail={compactDetail||undefined}>
   {!compactDetail&&<a className="skip-link" href="#block-scroll" onClick={e=>{const vp=getPort();if(vp){e.preventDefault();vp.focus({preventScroll:true})}}}>Skip to the blocks</a>}
   <header className="masthead">
      <div className="app-title">
        {compactDetail?<Button size="regular" icon aria-label="Back to blocks" title="Back to blocks" onClick={()=>setDrillIn(false)}><ChevronLeft/></Button>:<img className="app-icon" src={assetUrl('icon.svg')} width="38" height="38" alt=""/>}
        <h1 tabIndex={compactDetail?-1:undefined} ref={listNotice}>{compactDetail?'Comparison':'Block Atlas'}</h1>
      </div>
      {!compactDetail&&<div className="search-slot"><SearchField id={focusedSearch} value={query} onValueChange={setQuery} placeholder="Find a block" aria-label="Search blocks" autoComplete="off" spellCheck={false}/></div>}
      <div className="app-actions">
        {!compactDetail&&<Dialog.Root>
          <Toolbar.Root aria-label="Block actions">
            <BaseDialog.Trigger disabled={!downloadSource} render={<Toolbar.Button icon title="Download" aria-label="Download"><ArrowDownToLine aria-hidden="true"/></Toolbar.Button>}/>
            {wide&&<><Toolbar.Separator/><Toolbar.Button icon title={inspector?'Hide comparison':'Show comparison'} aria-label={inspector?'Hide comparison':'Show comparison'} aria-expanded={inspector} aria-controls={inspector?'compare-panel':undefined} onClick={()=>setInspector(v=>!v)}><PanelRight/></Toolbar.Button></>}
          </Toolbar.Root>
          {downloadSource&&<DownloadPopup source={downloadSource}/>}
        </Dialog.Root>}
        {settings}{help}
      </div>
   </header>
   <main className="collection-view">
      <div className="facet-bar" hidden={compactDetail}>
         <SegmentedControl className="collection-control" options={SCOPES.map(s=>({value:s.value,label:phone?s.short:s.label}))} height={phone?44:40} value={scope} onValueChange={v=>{setScope(v as Scope);setCategory(ALL)}} aria-label="Block collection"/>
         <div className="facets">
           <CategoryPicker options={categories} value={category} onChange={setCategory}/>
           <ViewMenu sort={sort} verdict={verdict} choices={verdicts} onSort={setSort} onVerdict={setVerdict} onReset={reset} canReset={!!(query||scope!==ALL||category!==ALL||verdict!==ALL||sort!=='alphabet')}/>
         </div>
      </div>
      <div className="workbench" data-split={wide&&inspector||undefined}>
        <section className="block-list-panel" aria-label="Blocks" inert={compactDetail||undefined} aria-hidden={compactDetail||undefined}>
          <header className="list-head"><div><h2>Blocks</h2><span role="status" className="result-count">{busy&&!rows.length?'Loading…':`${fmt(filtered.length)} ${filtered.length===1?'block':'blocks'}`}{filtered.length!==rows.length&&!busy?<span className="result-of"> of {fmt(rows.length)}</span>:null}</span></div>
            {busy&&rows.length>0&&<span className="source-status"><LoaderCircle className="spin" size={15} aria-hidden="true"/>Fetching CSV</span>}
          </header>
          {notice}
          <ScrollArea className="block-list-scroll" id="block-scroll" viewportProps={{ref:listArea,role:'region','aria-label':'Block list','aria-busy':busy}}>
            {showEmpty?<div className="empty-state list-empty">{busy?<LoaderCircle className="spin" size={28} aria-hidden="true"/>:rows.length?<SearchX size={28} aria-hidden="true"/>:<Layers3 size={28} aria-hidden="true"/>}
              <h3>{busy?'Reading the CSV':rows.length?'No blocks found':'No registry loaded'}</h3><p>{rows.length?'Try another search or clear the filters.':'Choose a CSV source to load blocks.'}</p>
              {!!rows.length&&<Button variant="glass" size="regular" onClick={reset}>Clear filters</Button>}
            </div>:<table className="block-table" style={{'--row-size':`${rowSize}px`} as CSSProperties} aria-rowcount={filtered.length+1}>
                <caption className="sr-only">Blocks and suggested replacements. Use the arrow keys, Page Up, Page Down, Home, and End to move between rows. Enter opens the comparison.</caption>
                <colgroup><col className="mc-col"/><col className="bloxd-col"/><col className="face-col"/><col className="face-col"/><col className="score-col"/><col className="match-col"/><col className="action-col"/></colgroup>
                <thead><tr aria-rowindex={1}><th scope="col"><span className="list-minecraft">Minecraft</span><span className="list-stacked">Block &amp; match</span></th><th scope="col" className="bloxd-col">Bloxd.io</th><th scope="col" className="face-col">Top</th><th scope="col" className="face-col">Sides</th><th scope="col" className="score-col" title="Lower means a closer mean color">ΔE00</th><th scope="col" className="match-col">Match type</th><th scope="col" className="action-head"><span className="sr-only">Inspect</span></th></tr></thead>
                <tbody>
                  {!!items[0]?.start&&<tr aria-hidden="true" className="virtual-spacer" style={{height:items[0].start}}><td/></tr>}
                  {items.map(v=>{
                    const r=filtered[v.index],other=suggestion(r),current=wide&&inspector&&r.id===selected?.id
                    return <tr key={v.key} aria-rowindex={v.index+2} data-block-id={r.id} data-selected={current||undefined} onClick={()=>pick(r.id)}>
                      <td><div className="row-entry"><BlockThumb img={thumbImg(artwork,r,'mc','side')} color={r.side.mc||r.top.mc||r.exposed.mc}/><div className="row-label"><strong title={r.name}>{r.name}</strong><span className="inline-match" title={other}>{other}</span></div></div></td>
                      <td className="bloxd-col"><div className="row-entry other-game"><BlockThumb img={thumbImg(artwork,r,'b','side')} color={r.side.bloxd||r.top.bloxd||r.exposed.bloxd}/><span title={other}>{other}</span></div></td>
                      <td className="face-col"><Swatches pair={r.top} label="Top"/></td><td className="face-col"><Swatches pair={r.side} label="Sides"/></td>
                      <td className="score-col"><span className={r.delta===null?'muted':''}>{formatDelta(r.delta)}</span></td>
                      <td className="match-col"><MatchLabel value={r.verdict}/></td>
                      <td className="action-cell"><Button id={bid(r.id)} type="button" icon variant="clear" size="small" lens={rowLens} aria-label={`Inspect ${r.name} (${r.id})`} aria-current={current?'true':undefined} tabIndex={r.id===tabRow?0:-1} onFocus={()=>setFocusId(r.id)} onKeyDown={e=>handleKey(e,v.index)} onClick={e=>{e.stopPropagation();pick(r.id)}}><ChevronRight/></Button></td>
                    </tr>
                  })}
                  {remaining>0&&<tr aria-hidden="true" className="virtual-spacer" style={{height:remaining}}><td/></tr>}
                </tbody>
            </table>}
          </ScrollArea>
          <footer className="list-foot">
            <span>Made and maintained by <a href="https://discord.com/users/1079048260943097977" target="_blank" rel="noopener noreferrer">aCube</a></span>
            <a href="https://bloxd.io/player/aCuboid" target="_blank" rel="noopener noreferrer">aka (aCuboid)</a>
          </footer>
        </section>
        {compareVisible&&<section id="compare-panel" className="comparison-panel" aria-label="Comparison">
          <ScrollArea className="comparison-scroll" viewportProps={{ref:compareArea}}>
            {selected?<Comparison key={selected.id} row={selected} pre={artwork}/>:<EmptyComparison/>}
          </ScrollArea>
        </section>}
      </div>
   </main>
 </div>
}
