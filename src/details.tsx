import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Box, Check, CircleHelp, Copy, Layers3 } from 'lucide-react'
import { Accordion } from '@/components/liquikit/accordion'
import { Button } from '@/components/liquikit/button'
import { Dialog } from '@/components/liquikit/dialog'
import { ScrollArea, Separator } from '@/components/liquikit/scroll-area'
import { Tabs } from '@/components/liquikit/tabs'
import type { AtlasRow, ColorPair, PreviewMap } from './data'

export const formatDelta=(v:number|null)=>v===null?'—':v.toFixed(1)
export const suggestion=(r:AtlasRow)=>r.bloxd||(r.verdict==='No standalone block'?'No standalone block':'No suggestion supplied')
const kind: Record<string,string>={'Direct counterpart':'direct','Build substitute':'build','Visual only':'visual','Exact empty space':'empty','No standalone block':'unmatched'}
export function MatchLabel({value}:{value:string}){return <span className="match-label" data-kind={kind[value]}><i aria-hidden="true"/>{value}</span>}
export function BlockThumb({img,color,large=false}:{img?:string;color?:string;large?:boolean}){
 return <span aria-hidden="true" className={`block-thumb ${large?'sample-thumb':''} ${img?'textured':color?'solid':'empty'}`}>
  {img?<img src={img} alt="" width="32" height="32" decoding="async" draggable={false}/>:color?<span style={{backgroundColor:color}}/>:<Box size={large?26:15}/>}
 </span>
}
export function thumbImg(pre:PreviewMap|null,row:AtlasRow,game:'mc'|'b',face:'top'|'side',strict=false){
 const sw=game==='mc'?(row.id.startsWith('minecraft:')?pre?.m?.[row.id.slice(10)]:undefined):pre?.b?.[row.bloxdExact]
 const idx=face==='top'?1:0
 return sw?.[idx]||(!strict?sw?.[1-idx]:undefined)
}
export function Swatches({pair,label}:{pair:ColorPair;label:string}){
 if(!pair.mc&&!pair.bloxd)return <span className="muted" title={`No ${label} color recorded`}>—</span>
 return <span className="small-swatches" role="img" aria-label={`${label}: Minecraft ${pair.mc||'not available'}, Bloxd.io ${pair.bloxd||'not available'}`}>
  <i style={{backgroundColor:pair.mc||undefined}} title={pair.mc?`Minecraft ${pair.mc}`:'No Minecraft sample'}/><i style={{backgroundColor:pair.bloxd||undefined}} title={pair.bloxd?`Bloxd.io ${pair.bloxd}`:'No Bloxd.io sample'}/>
 </span>
}
function Hex({code}:{code:string}){return <span className="hex"><i aria-hidden="true" style={{backgroundColor:code||undefined}}/>{code||'—'}</span>}
function Meta({label,children}:{label:string;children?:ReactNode}){return children?<div><dt>{label}</dt><dd>{children}</dd></div>:null}
function Parts({text}:{text:string}){return <ul className="parts">{text.split('; ').filter(Boolean).map((v,i)=><li key={i}>{v}</li>)}</ul>}
function Sample({game,label,img,color}:{game:string;label:string;img?:string;color:string}){
 return <figure className="sample">
   <div className="sample-stage" style={{'--sample':color||'transparent'} as CSSProperties}>
     <BlockThumb img={img} color={color} large/>
   </div>
   <figcaption><span>{game}</span><strong>{label}</strong></figcaption>
 </figure>
}
const surfaces=[{value:'side',label:'Sides'},{value:'top',label:'Top'}]
export function Comparison({row,pre}:{row:AtlasRow;pre:PreviewMap|null}){
 const [face,setFace]=useState<'top'|'side'>(!row.side.mc&&!row.side.bloxd&&(row.top.mc||row.top.bloxd)?'top':'side')
 const [copied,setCopied]=useState(false)
 const pairs=[['Top',row.top],['Sides',row.side],['Exposed',row.exposed]] as const
 const measurable=Boolean(row.delta!==null||pairs.some(([,p])=>p.mc||p.bloxd||p.delta!==null))
 const biome=row.id.startsWith('minecraft:')?pre?.biomes?.[row.id.slice(10)]:undefined
 const clipboard=()=>{
   const selectText=()=>{const node=document.getElementById('active-block-id'),selection=window.getSelection();if(node&&selection){const r=document.createRange();r.selectNodeContents(node);selection.removeAllRanges();selection.addRange(r)}}
   if(!navigator.clipboard){selectText();return}
   void navigator.clipboard.writeText(row.id).then(()=>setCopied(true),selectText)
 }
 return <article className="comparison">
    <div className="compare-title-line"><div><p className="detail-category">{row.category}</p><h2>{row.name}</h2></div><span className="detail-score" title="CIEDE2000 color difference"><small>ΔE00</small><strong>{formatDelta(row.delta)}</strong></span></div>
    <div className="id-line"><span id="active-block-id">{row.id}</span><Button size="small" variant="clear" icon onClick={clipboard} aria-label={copied?'Block ID copied':'Copy block ID'} title={copied?'Copied':'Copy block ID'}>{copied?<Check/>:<Copy/>}</Button></div>
    <Tabs.Root value={face} onValueChange={v=>setFace(v as 'top'|'side')} className="texture-tabs">
      <div className="compare-section-head"><h3>Textures</h3><Tabs.List tabs={surfaces} height={30} aria-label="Texture face"/></div>
      {(['side','top'] as const).map(f=>{const p=f==='top'?row.top:row.side;return <Tabs.Panel value={f} key={f} className="texture-pair">
        <Sample game="Minecraft" label={row.name} img={thumbImg(pre,row,'mc',f,true)} color={p.mc}/>
        <ArrowRight className="compare-arrow" size={17} aria-hidden="true"/>
        <Sample game="Bloxd.io" label={suggestion(row)} img={thumbImg(pre,row,'b',f,true)} color={p.bloxd}/>
      </Tabs.Panel>})}
    </Tabs.Root>
    <Separator className="section-separator"/>
    <div className="compare-section-head"><h3>Mean colors</h3><small className="muted">sRGB</small></div>
    {measurable?<table className="mean-table" aria-label="Mean colors by surface">
      <thead><tr><th scope="col">Face</th><th scope="col">Minecraft</th><th scope="col">Bloxd.io</th><th scope="col">ΔE00</th></tr></thead>
      <tbody>{pairs.filter(([,p])=>p.mc||p.bloxd||p.delta!==null).map(([label,p])=><tr key={label}>
        <th scope="row">{label}</th><td><Hex code={p.mc}/></td><td><Hex code={p.bloxd}/></td><td>{label==='Exposed'?'—':formatDelta(p.delta)}</td>
      </tr>)}</tbody>
    </table>:<p className="detail-note">No comparable visible color was recorded.</p>}
    <Separator className="section-separator"/>
    <div className="compare-section-head"><h3>Match details</h3><MatchLabel value={row.verdict}/></div>
    <p className="detail-note">{row.note||'This row doesn’t specify limits. A similar color doesn’t guarantee the same behavior.'}</p>
    <Accordion.Root multiple className="details-accordion">
      <Accordion.Item value="sources">
        <Accordion.Trigger>Block data</Accordion.Trigger>
        <Accordion.Panel><dl className="block-meta">
          <Meta label="Exact Bloxd name or state">{row.bloxdExact}</Meta><Meta label="Bloxd registry ID">{row.bloxdId}</Meta><Meta label="Generation">{`${row.stage}${row.dimension?` · ${row.dimension}`:''}`}</Meta>
          <Meta label="Selection basis">{row.selection}</Meta><Meta label="Color comparison basis">{row.basis}</Meta>
          <Meta label="Minecraft state">{row.mcState}</Meta><Meta label="Bloxd state sampled">{row.bState}</Meta>
          <Meta label="Minecraft textures">{row.mcAssets&&<Parts text={row.mcAssets}/>}</Meta><Meta label="Bloxd textures and models">{row.bAssets&&<Parts text={row.bAssets}/>}</Meta>
          <Meta label="Minecraft sampling notes">{row.mcNotes}</Meta><Meta label="Bloxd sampling notes">{row.bNotes}</Meta><Meta label="Availability">{row.availability}</Meta>
          {([['Minecraft top',row.mcTopCov],['Bloxd top',row.bTopCov],['Minecraft sides',row.mcSideCov],['Bloxd sides',row.bSideCov]] as const).map(([label,v])=>v===null?null:<Meta key={label} label={`${label} texture coverage`}>{v.toFixed(1)}%</Meta>)}
          <Meta label="Terrain and features">{row.terrain}</Meta><Meta label="Structures">{row.structure}</Meta><Meta label="Later examples">{row.later}</Meta><Meta label="Inventory notes">{row.inventory}</Meta><Meta label="Release files">{row.releaseFiles&&<Parts text={row.releaseFiles}/>}</Meta>
        </dl></Accordion.Panel>
      </Accordion.Item>
      {(row.alternate||row.lower||row.shortlist)&&<Accordion.Item value="alternatives"><Accordion.Trigger>Other options</Accordion.Trigger><Accordion.Panel><dl className="block-meta">
        <Meta label="Alternate">{row.alternate&&`${row.alternate} · ΔE00 ${formatDelta(row.alternateDelta)}`}</Meta>
        <Meta label="Closest color in shortlist">{row.lower&&`${row.lower} · ΔE00 ${formatDelta(row.lowerDelta)}`}</Meta>
        <Meta label="Measured shortlist">{row.shortlist&&<Parts text={row.shortlist}/>}</Meta>
      </dl></Accordion.Panel></Accordion.Item>}
      {biome&&<Accordion.Item value="biomes"><Accordion.Trigger>Biome tint samples</Accordion.Trigger><Accordion.Panel>
        <table className="mean-table" aria-label="Biome tint samples"><thead><tr><th scope="col">Biome</th><th scope="col">Top</th><th scope="col">Sides</th><th scope="col">ΔE00</th></tr></thead><tbody>{biome.map(([label,top,side,d])=><tr key={label}><th scope="row">{label}</th><td>{top}</td><td>{side}</td><td>{formatDelta(d)}</td></tr>)}</tbody></table>
      </Accordion.Panel></Accordion.Item>}
    </Accordion.Root>
 </article>
}
export function EmptyComparison(){return <div className="empty-state"><Layers3 size={28} aria-hidden="true"/><h3>No block selected</h3><p>Pick a block to compare its textures.</p></div>}
export function HelpDialog(){return <Dialog.Root>
 <Dialog.Trigger size="regular" icon title="How comparisons work" aria-label="How comparisons work"><CircleHelp/></Dialog.Trigger>
 <Dialog.Popup className="help-dialog" closeButton={false}>
   <Dialog.Title>How comparisons work</Dialog.Title>
   <Dialog.Description>Compare the default textures, then check the limits of each substitute.</Dialog.Description>
   <ScrollArea className="dialog-scroll">
     <dl className="help-topics">
       <Meta label="Texture samples">The top and side swatches are alpha-weighted mean colors from representative block states. Biome tints and special renderers are noted in the block data.</Meta>
       <Meta label="ΔE00">Lower scores mean the mean colors are closer. A dash means no usable color comparison. Pattern, profile, and block behavior are separate.</Meta>
       <Meta label="Substitutes">Suggestions come from reviewed shortlists, not a global search of every Bloxd state. Check the limitations before using one.</Meta>
       <Meta label="Coverage">The bundled CSV includes the complete reference registry, including invisible and technical blocks.</Meta>
     </dl>
   </ScrollArea>
   <div className="dialog-actions"><Dialog.Close size="regular" variant="prominent">Done</Dialog.Close></div>
 </Dialog.Popup>
</Dialog.Root>}
