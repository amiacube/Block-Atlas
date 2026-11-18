"""Generate the complete dataset, preserving previously audited rows and measuring the new ones.
Usage: OPENBLAS_NUM_THREADS=1 python scripts/build_data.py --sources ~/.cache/block-atlas-sources
"""
from argparse import ArgumentParser
from collections import Counter
from pathlib import Path
import csv, json, re, math
import numpy as np
from measure import DefaultAssets, SIDE, compare
from replacements import recipe, title, ABSENT
from fetch_inputs import get_assets

ROOT=Path(__file__).resolve().parents[1]
SCOPES={'World generation','After generation','Other registered'}
DATS='minecraft-26.3-bloxd.csv'

def read_inputs(csvp,htmlp):
 with csvp.open(encoding='utf-8-sig') as f:
  d=csv.DictReader(f); fields=list(d.fieldnames); old={r['Minecraft block ID'].split(':')[1]:r for r in d}
 if htmlp.suffix=='.json':prev=json.loads(htmlp.read_text())
 else:
  s=htmlp.read_text();prev=json.loads(re.search(r'<script id="textures-json" type="application/json">(.*?)</script>',s,flags=re.S)[1])
 return fields,old,prev

def group(k,name):
 # Align legacy rows with the consolidated app filter vocabulary.
 if re.match(r'^(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(?:wool|concrete|stained_glass|terracotta|glazed_terracotta|carpet)',k):return 'Dyed building blocks'
 if k.endswith('_candle') or k=='candle':return 'Lighting'
 if any(s in k for s in ('chest','barrel','shulker_box')):return 'Storage'
 if name=='Mechanics & utilities':return 'Engineering & technical' if re.search('redstone|wire|plate|piston|button|lever|tripwire|rail|dispenser|repeater|comparator|trial|spawner|vault',k) else 'Utility'
 if name=='Decor & color':return 'Decor & furnishings'
 if name=='Plants & crops':return 'Plants & agriculture'
 if name=='Ores, metals & crystals':return 'Ores & minerals'
 if name=='Light & fire':return 'Lighting'
 return name

def build(args):
 if not args.no_download:get_assets(args.sources)
 a=DefaultAssets(args.sources); fields,ex,pre=read_inputs(args.legacy_csv,args.legacy_preview)
 assert len(ex)==608 and set(ex)<=a.declared
 fields.append('Atlas category')
 todo=sorted(a.declared-set(ex)); rules={};missing=[]
 for k in todo:
  try: rules[k]=recipe(k,a,ex)
  except KeyError as e:missing.append(k)
 if missing:raise ValueError('Missing reviewed families: '+', '.join(missing))
 chosen_names={n for r in rules.values() for n in r[2]}
 def allowed(n):
  e=a.entries.get(n)
  if not e:return False
  root=e.get('meta',{}).get('rootName',n)
  return root in a.roots and e['kind']=='block'
 if not args.no_download:a.fetch_models([n for n in chosen_names if allowed(n)])
 both=[];audit=[]
 for k,rec in ex.items():
  x=rec.copy();x['Atlas category']=group(k,x['Category']);both.append(x)
 for k,(g,mode,candidates,note,fixed) in rules.items():
  m=a.minecraft(k); candidates=tuple(dict.fromkeys(n for n in candidates if allowed(n)))
  if fixed and fixed not in candidates:
   audit.append((k,'Unavailable pinned counterpart: '+fixed));fixed=None
  invisible=not m.stats[2]
  pairs=[]
  for n in candidates:
   q=a.bloxd(n); z=compare(m,q)
   if q.stats[2] or invisible:pairs.append((n,q,z))
  pairs.sort(key=lambda p:(p[2][-1],candidates.index(p[0])))
  if fixed and (hit:=next((t for t in pairs if t[0]==fixed),None)):pair=hit
  else:pair=pairs[0] if pairs else None
  if not pair and mode!=ABSENT:
   audit.append((k,'No candidate surface for '+', '.join(candidates))); mode=ABSENT
   note+=' No measured standalone counterpart could be shown.'
  n,b,z=pair if pair else ('',None,(None,None,None,'Not applicable',float('inf')))
  e=a.entries.get(n,{}); root=e.get('meta',{}).get('rootName',n); e0=a.roots.get(root,e); inv=e0.get('showInCreativeInven') is not False
  if not inv:note+=' This Bloxd block is flagged outside the standard Creative inventory; mode may restrict it.'
  if z[3]=='Different surfaces':note+=' The color score compares different exposed surfaces, not like-for-like.'
  alt=next((p for p in pairs if p[0]!=n and p[2][0] is not None),None); least=min((p for p in pairs if p[2][0] is not None),key=lambda c:c[2][0],default=None)
  if least and (least[0]==n or z[0] is None or least[2][0]>=z[0]-1.5 or alt and least[0]==alt[0]):least=None
  f=lambda x:'' if x is None else f'{float(x):.1f}'
  def cover(q,i):return f(q.cover[2]*100 if i==0 else 100*np.mean(q.cover[SIDE])) if q and q.stats[2] else ''
  if m.refs and 'proxy' in m.note:audit.append((k,'MC proxy'))
  if not m.stats[2] and k not in ('barrier','light','structure_void','void_air'):audit.append((k,'No MC visible surface'))
  if b and 'proxy' in b.note:audit.append((k,'Bloxd proxy: '+n))
  tr=a.lang.get('block.minecraft.'+k,title(k)); bg=b.colors if b else ['','',''];
  out={
   'Minecraft block':tr,'Minecraft block ID':'minecraft:'+k,'Generation stage':'Other registered','Category':g,'Atlas category':g,'Bloxd block':root,'Bloxd exact block or state name':n,'Bloxd registry ID':e.get('id',''),
   'Replacement tier':mode,'Selection basis':'Related role prioritized' if fixed and n==fixed else 'Measured shortlist (color, profile, texture)' if n else 'None',
   'Minecraft mean top sRGB':m.colors[0], 'Bloxd mean top sRGB':bg[0], 'Minecraft mean sides sRGB':m.colors[1],'Bloxd mean sides sRGB':bg[1], 'Minecraft mean exposed sRGB':m.colors[2],'Bloxd mean exposed sRGB':bg[2],
   'Color difference ΔE00':f(z[0]),'Top ΔE00':f(z[1]),'Sides ΔE00':f(z[2]),'Color comparison basis':z[3],
   'Minecraft top alpha coverage %':cover(m,0),'Bloxd top alpha coverage %':cover(b,0),'Minecraft sides alpha coverage %':cover(m,1),'Bloxd sides alpha coverage %':cover(b,1),
   'Alternate block':alt[0] if alt else '', 'Alternate ΔE00':f(alt[2][0]) if alt else '', 'Lowest ΔE00 option in the shortlist, when different':least[0] if least else '','Lowest-option ΔE00':f(least[2][0]) if least else '',
   'Real limitations':note, 'Bloxd availability note':'Mode-dependent / outside standard Creative list' if not inv else ('Canonical block; mode may restrict it' if n and n!='Air' else 'Not applicable'),
   'Measured shortlist (ΔE00)':'; '.join(k+(' (ΔE '+f(t[0])+')' if t[0] is not None else '') for k,q,t in pairs),
   'Minecraft representative state':m.state, 'Bloxd representative state':b.state if b else '',
   'Minecraft default texture references':m.refs, 'Bloxd default texture or model references':b.refs if b else '',
   'Minecraft sampling notes':m.note, 'Bloxd sampling notes':b.note if b else '',
  }
  pre['m'][k]=m.swatches()
  if n and n not in pre['b']:pre['b'][n]=b.swatches()
  both.append(out)
 outdir=args.out;outdir.mkdir(exist_ok=True,parents=True)
 both.sort(key=lambda x:(x['Minecraft block'].casefold(),x['Minecraft block ID']))
 assert len(both)==len(a.declared)==1286 and len({r['Minecraft block ID'] for r in both})==1286
 assert {r['Minecraft block ID'].split(':')[1] for r in both}==a.declared
 assert all(not r['Bloxd exact block or state name'] or allowed(r['Bloxd exact block or state name']) for r in both)
 assert all(math.isfinite(float(r['Color difference ΔE00'])) for r in both if r['Color difference ΔE00'])
 assert {r['Generation stage'] for r in both}==SCOPES
 with (outdir/DATS).open('w',encoding='utf-8-sig',newline='') as h:
  w=csv.DictWriter(h,fieldnames=fields);w.writeheader();w.writerows(both)
 (outdir/'previews.json').write_text(json.dumps(pre,separators=(',',':')))
 (outdir/'registry-ids.json').write_text(json.dumps(['minecraft:'+k for k in sorted(a.declared)],separators=(',',':')))
 meta={'edition':'Java','version':'26.3','blockIds':1286,'releaseBlockstateFiles':1288,'excludedRenderOnlyModels':['item_frame','glow_item_frame'],'stages':dict(Counter(r['Generation stage'] for r in both)),'verdicts':dict(Counter(r['Replacement tier'] for r in both)),'measured':sum(bool(r['Color difference ΔE00']) for r in both),'registryAudit':audit,'bloxdClient':'c0ace454','blocksCommit':'cec73059b21be931d490778c2128b5ce309374b0','registryCommit':'77393d1a1e30e2a1d35237fcd193ff3d573d096b','texturePackCommit':'2e793bc63ebffe2333039516c9d9be55f504c20c'}
 (outdir/'snapshot.json').write_text(json.dumps(meta,indent=2)); print(json.dumps(meta,indent=2))
if __name__=='__main__':
 q=ArgumentParser();q.add_argument('--sources',type=Path,default=ROOT.parent/'.cache/block-atlas-sources');q.add_argument('--legacy-csv',type=Path,default=ROOT/'source-data/worldgen-palette.csv');q.add_argument('--legacy-preview',type=Path,default=ROOT/'source-data/worldgen-previews.json');q.add_argument('--out',type=Path,default=ROOT/'public/data');q.add_argument('--no-download',action='store_true');build(q.parse_args())
