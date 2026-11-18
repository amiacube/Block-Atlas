import Papa from 'papaparse'

export type Stage='World generation'|'After generation'|'Other registered'
export type ColorPair={mc:string;bloxd:string;delta:number|null}
export type AtlasRow={
  id:string; name:string; stage:Stage; category:string; dimension:string;
  bloxd:string; bloxdExact:string; bloxdId:string; verdict:string; selection:string; note:string;
  delta:number|null; basis:string; top:ColorPair; side:ColorPair; exposed:ColorPair;
  mcState:string; bState:string; mcAssets:string; bAssets:string; mcNotes:string; bNotes:string;
  alternate:string; alternateDelta:number|null; lower:string; lowerDelta:number|null; shortlist:string;
  mcTopCov:number|null; bTopCov:number|null; mcSideCov:number|null; bSideCov:number|null;
  terrain:string; structure:string; later:string; inventory:string; releaseFiles:string; availability:string; haystack:string;
}
export type PreviewMap={m:Record<string,[string,string]>;b:Record<string,[string,string]>;biomes?:Record<string,[name:string,top:string,side:string,delta:number][]>}
export type CsvResult={rows:AtlasRow[];warnings:string[];bytes:ArrayBuffer;loadedUrl:string}


export const clean=(text:string)=>text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[_:|\-/]+/g,' ').replace(/\s+/g,' ').trim()
const headerKey=(text:string)=>text.replace(/^\ufeff/,'').normalize('NFKD').replace(/[^a-z0-9δ]/gi,'').toLowerCase()
const fmtId=(s:string)=>s.toLowerCase().includes(':')?s.toLowerCase():`minecraft:${s.toLowerCase()}`
const hex=(v:string)=>/^#[0-9a-f]{6}$/i.test(v)?v.toUpperCase():/^[0-9a-f]{6}$/i.test(v)?`#${v.toUpperCase()}`:''
const digit=(s:string)=>{const t=s.trim().replace(/%$/,''); if(!t || !/^\d+([.]\d+)?$/.test(t))return null; const n=Number(t); return Number.isFinite(n)?n:null}
const title=(id:string)=>id.split(':').pop()!.split(/[_ -]/).map(s=>s?`${s[0].toUpperCase()}${s.slice(1)}`:'').join(' ')
const stageFor=(s:string):Stage=>/after|post.gen/i.test(s)?'After generation':/(^world|natural)/i.test(s)?'World generation':'Other registered'


export function parseCsv(raw:string):Pick<CsvResult, 'rows'|'warnings'> {
 if(/^\s*</.test(raw.replace(/^\ufeff/,'')))throw new Error('This address returned a web page, not CSV. Use the raw or direct download link.')
 const result=Papa.parse<Record<string,string>>(raw,{header:true,skipEmptyLines:'greedy',transformHeader:s=>s.replace(/^\ufeff/,'').trim()})
 const keys=new Map((result.meta.fields||[]).map(s=>[headerKey(s),s]))
 const find=(options:string[])=>options.map(x=>keys.get(headerKey(x))).find(Boolean)
 const idCol=find(['Minecraft block ID','Block ID','Minecraft ID','minecraft_id','mcid','minecraft_block_id','id'])
 const nameCol=find(['Minecraft block','Minecraft name','Block name','minecraft_name','name'])
 if(!idCol)throw new Error('No block ID column was found. Use “Minecraft block ID” (or “Block ID”) with one ID per row.')
 if(result.errors.some(e=>e.type==='Quotes'))throw new Error('The CSV has malformed quoted fields.')
 const malformed=result.errors.find(e=>e.type==='FieldMismatch')
 if(malformed)throw new Error(`CSV row ${(malformed.row??0)+2} has a different number of fields from the header.`)
 const rows:AtlasRow[]=[];const seen=new Set<string>(); const bad:string[]=[]
 for(const [i,r] of result.data.entries()){
  const val=(...a:string[])=>{const f=find(a); return f && typeof r[f]==='string'?r[f].trim():''}
  const id=fmtId((r[idCol]||'').trim())
  if(!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)){bad.push(`line ${i+2}: invalid ID`);continue}
  if(seen.has(id)){bad.push(`line ${i+2}: duplicate ${id}`);continue} seen.add(id)
  const name=(nameCol&&r[nameCol]?.trim())||title(id)
  const bloxd=val('Bloxd block','Bloxd replacement','Bloxd suggestion','bloxd_name','replacement')
  const bloxdExact=val('Bloxd exact block or state name','bloxd_exact','bloxd_state_name')||bloxd
  const delta=digit(val('Color difference ΔE00','Color ΔE','Delta E','delta_e','deltaE00','color_difference'))
  const pair=(kind:'top'|'sides'|'exposed',tag:string):ColorPair=>({
    mc:hex(val(`Minecraft mean ${kind} sRGB`,`minecraft_${kind}_hex`,`${kind}_mc`, `mc_${kind}`,kind==='exposed'?'MC color':`mc_${tag}`)),
    bloxd:hex(val(`Bloxd mean ${kind} sRGB`,`bloxd_${kind}_hex`,`${kind}_bloxd`,`bloxd_${kind}`,kind==='exposed'?'Bloxd color':`b_${tag}`)),
    delta:kind==='exposed'?delta:digit(val(`${tag} ΔE00`,`${tag} Delta E`,`${tag}_delta`))
  })
  const stage=stageFor(val('Generation stage','Stage','Scope'))
  const category=val('Atlas category','Category','Family','Type')||'Uncategorized'
  const verdict=val('Replacement tier','Verdict','Match','Match type','status')||(bloxd?'Unclassified':'No suggestion supplied')
  rows.push({id,name,bloxd,bloxdExact,bloxdId:val('Bloxd registry ID','Bloxd ID'),stage,category,dimension:val('Dimensions','Dimension'),verdict,delta,
    top:pair('top','Top'),side:pair('sides','Sides'),exposed:pair('exposed','Exposed'),basis:val('Color comparison basis'),selection:val('Selection basis'),
    note:val('Real limitations','Limitations','Notes'),alternate:val('Alternate block','Alternate'),alternateDelta:digit(val('Alternate ΔE00','alternate_delta')),
    lower:val('Lowest ΔE00 option in the shortlist, when different'),lowerDelta:digit(val('Lowest-option ΔE00')),shortlist:val('Measured shortlist (ΔE00)','Shortlist'),
    mcState:val('Minecraft representative state'),bState:val('Bloxd representative state'),mcAssets:val('Minecraft default texture references'),bAssets:val('Bloxd default texture or model references'),mcNotes:val('Minecraft sampling notes'),bNotes:val('Bloxd sampling notes'),
    mcTopCov:digit(val('Minecraft top alpha coverage %')), bTopCov:digit(val('Bloxd top alpha coverage %')), mcSideCov:digit(val('Minecraft sides alpha coverage %')),bSideCov:digit(val('Bloxd sides alpha coverage %')),
    terrain:val('Minecraft terrain / feature sources'),structure:val('Minecraft structure sources'),later:val('Minecraft later-generation sources'),inventory:val('Minecraft inventory notes'),releaseFiles:val('Minecraft worldgen release-file references'),availability:val('Bloxd availability note'),
    haystack:clean([id,name,category,verdict,bloxd,bloxdExact,val('Alternate block')].join(' '))})
 }
 if(bad.length)throw new Error(`The CSV must have one valid, unique block ID per row. ${bad.slice(0,3).join('; ')}${bad.length>3?'…':''}.`)
 if(!rows.length)throw new Error('This CSV has a header, but no block rows.')
 const warnings:string[]=[]
 if(!find(['Bloxd block','Bloxd replacement','Bloxd suggestion','bloxd_name','replacement']))warnings.push('This CSV has no Bloxd replacement column. The app will display its block IDs without making up suggestions.')
 return {rows,warnings}
}
