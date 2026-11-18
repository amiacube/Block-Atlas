import { parseCsv } from './dataset'
export { clean } from './dataset'
export type { AtlasRow, ColorPair, CsvResult, PreviewMap, Stage } from './dataset'

export const STATIC_BASE=import.meta.env.BASE_URL
export const FILE_NAME='minecraft-26.3-bloxd.csv'
export const FULL_COUNT=1286
export const SOURCE_KEY='block-atlas.csv.v1'
const root=new URL(STATIC_BASE,window.location.href)
export const BUILTIN_URL=new URL('data/'+FILE_NAME,root).href
export const assetUrl=(file:string)=>new URL(file.replace(/^\//,''),root).href

export function checkedUrl(value:string) {
 const s=value.trim();
 if(!s) throw new Error('Enter a direct URL to a CSV file.')
 if(!(/^https?:\/\//i.test(s)||s.startsWith('/')||s.startsWith('./')||s.startsWith('../')))throw new Error('Use a full https:// URL or a local path starting with /.')
 let u:URL; try {u=new URL(s,window.location.href)}catch{throw new Error('That does not look like a valid URL.')}
 if(!['http:','https:'].includes(u.protocol) || u.username || u.password)throw new Error('Use an HTTP(S) URL without credentials.')
 if(window.location.protocol==='https:' && u.protocol==='http:') throw new Error('Use HTTPS so the browser can load the CSV securely.')
 u.hash=''; return u.href
}

export function initialUrl(){
 let saved='';try{saved=localStorage.getItem(SOURCE_KEY)||''}catch{/* Storage is optional. */}
 const explicit=new URLSearchParams(window.location.search).get('csv')
 const configured=(import.meta.env.VITE_CSV_URL||'').trim()
 for(const candidate of [explicit,saved,configured])if(candidate){try{return {url:checkedUrl(candidate),message:''}}catch(error){return {url:BUILTIN_URL,message:`Invalid configured CSV URL. ${String((error as Error).message)}`}}}
 return {url:BUILTIN_URL,message:''}
}

export function persistUrl(url:string){
 try { if(url===BUILTIN_URL&&!(import.meta.env.VITE_CSV_URL||'').trim())localStorage.removeItem(SOURCE_KEY); else localStorage.setItem(SOURCE_KEY,url) }catch{/* sandbox/browser may deny */}
 const u=new URL(window.location.href); if(url===BUILTIN_URL)u.searchParams.delete('csv');else u.searchParams.set('csv',url);
 try{window.history.replaceState(null,'',u)}catch{/* also works without a shareable address */}
}

export function friendlySource(url:string){
 try{const p=new URL(url);return p.origin===window.location.origin?p.pathname:`${p.hostname}${p.pathname}`}catch{return url}
}

export async function loadCsv(url:string,signal:AbortSignal){
 const request=await fetch(url,{signal,cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer',headers:{Accept:'text/csv,text/plain,application/octet-stream;q=0.8,*/*;q=0.5'}})
 if(!request.ok)throw new Error(`CSV request returned HTTP ${request.status}. Check the URL and that the file is public.`)
 const max=12_000_000, declared=Number(request.headers.get('content-length'))
 if(declared && declared>max)throw new Error('The CSV is too large (12 MB limit).')
 const bytes=await request.arrayBuffer();if(bytes.byteLength>max)throw new Error('The CSV is too large (12 MB limit).')
 return {...parseCsv(new TextDecoder().decode(bytes)),bytes,loadedUrl:request.url||url}
}
