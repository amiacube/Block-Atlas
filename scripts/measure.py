"""Measure unlit, alpha-weighted sRGB on representative block model projections."""
from dataclasses import dataclass
from functools import cache
from pathlib import Path
import base64, concurrent.futures, io, json, math, re, struct, subprocess, urllib.parse, zipfile
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
from skimage.color import rgb2lab, deltaE_ciede2000
try:
 import DracoPy
except ImportError:
 DracoPy=None

Q=32
A='assets/minecraft/'
DIR=('east','west','up','down','south','north')
NORM=np.array([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
PROJ=np.array([[[0,0,-1],[0,-1,0]],[[0,0,1],[0,-1,0]],[[1,0,0],[0,0,1]],[[1,0,0],[0,0,-1]],[[1,0,0],[0,-1,0]],[[-1,0,0],[0,-1,0]]])
SIDE=[0,1,4,5]
BLANK=np.zeros((6,Q,Q,4),np.float32)
DYE=('white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black').split()
DT={k:int(v,16) for k,v in zip(DYE,'f9fffe f9801d c74ebd 3ab3da fed83d 80c71f f38baa 474f52 9d9d97 169c9c 8932b8 3c44aa 835432 5e7c16 b02e26 1d1d21'.split())}

def rgba(im): return np.asarray(im.convert('RGBA'),dtype=np.float32)/255

def rgbint(v):return np.array([((v>>n)&255)/255 for n in (16,8,0)],np.float32)

def pngurl(ar):
 b=io.BytesIO(); Image.fromarray(np.clip(np.floor(ar*255+.5),0,255).astype(np.uint8)).save(b,'PNG',optimize=True)
 return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode('ascii')

def crop_pixel(z,x,y,X,Y):return z[y:Y,x:X]

def face(lo,hi,d):
 x,y,z=lo;X,Y,Z=hi
 return np.array((((X,Y,Z),(X,Y,z),(X,y,z),(X,y,Z)),((x,Y,z),(x,Y,Z),(x,y,Z),(x,y,z)),((x,Y,z),(X,Y,z),(X,Y,Z),(x,Y,Z)),((x,y,Z),(X,y,Z),(X,y,z),(x,y,z)),((x,Y,Z),(X,Y,Z),(X,y,Z),(x,y,Z)),((X,Y,z),(x,Y,z),(x,y,z),(X,y,z)))[d],float)

def defaultuv(lo,hi,d):
 x,y,z=lo;X,Y,Z=hi
 return ((16-Z,16-Y,16-z,16-y),(z,16-Y,Z,16-y),(x,z,X,Z),(x,16-Z,X,16-z),(x,16-Y,X,16-y),(16-X,16-Y,16-x,16-y))[d]

def uvquad(uv,rotation=0):
 u,v,U,V=uv
 return np.roll(np.array([(u,v),(U,v),(U,V),(u,V)]),-int(rotation//90),axis=0)

def box(q,lo,hi,imgs,uvs=None):
 if isinstance(imgs,np.ndarray):imgs=[imgs]*6
 for d,p in enumerate(imgs):
  if p is not None:q.append((face(lo,hi,d),uvquad(uvs[d] if uvs else (0,0,1,1)),p,NORM[d],0))

def plane(q,p,plane_d=4):
 lo=(0,0,.5) if plane_d in (4,5) else (0,.04,0); hi=(1,1,.5) if plane_d in (4,5) else (1,.04,1)
 q.append((face(lo,hi,plane_d),uvquad((0,0,1,1)),p,None,0))

def cross(q,im,square=False):
 if square:
  for d in SIDE:q.append((face((.19,0,.19),(.81,1,.81),d),uvquad((0,0,1,1)),im,NORM[d],0))
 else:
  for v in [[[.05,1,.05],[.95,1,.95],[.95,0,.95],[.05,0,.05]],[[.05,1,.95],[.95,1,.05],[.95,0,.05],[.05,0,.95]]]:
   q.append((np.array(v),uvquad((0,0,1,1)),im,None,0))

def tri_draw(target,dst,uv,tex):
 low=np.maximum(0,np.floor(dst.min(axis=0)).astype(int)); high=np.minimum(Q,np.ceil(dst.max(axis=0)).astype(int)); x,y=low;X,Y=high
 if x>=X or y>=Y:return
 XX,YY=np.meshgrid(np.arange(x,X)+.5,np.arange(y,Y)+.5); used=np.zeros_like(XX,bool)
 for ids in ((0,1,2),(0,2,3)) if len(dst)==4 else ((0,1,2),):
  a,b,c=dst[list(ids)]; bx,by=b-a;cx,cy=c-a; val=bx*cy-by*cx
  if abs(val)<1e-6:continue
  dx=XX-a[0];dy=YY-a[1];t=(cy*dx-cx*dy)/val;r=(bx*dy-by*dx)/val
  ok=(t>=-1e-6)&(r>=-1e-6)&(t+r<=1+1e-6)&~used
  if not np.any(ok):continue
  used|=ok;a,b,c=uv[list(ids)]; f=a+t[ok,None]*(b-a)+r[ok,None]*(c-a)
  h,w=tex.shape[:2]; v=np.clip(np.floor(f[:,1]*h).astype(int),0,h-1);u=np.clip(np.floor(f[:,0]*w).astype(int),0,w-1); px=tex[v,u]; A=px[:,3:4]
  dest=target[y:Y,x:X]; B=dest[ok]; B[:,:3]=px[:,:3]*A+B[:,:3]*(1-A);B[:,3:4]=A+B[:,3:4]*(1-A); dest[ok]=B

def raster(mesh):
 if not mesh:return BLANK.copy()
 out=BLANK.copy()
 for d in range(6):
  n=NORM[d]; p=PROJ[d]; layers=[]
  for vertices,uv,tx,nm,i in mesh:
   if nm is not None and float(nm@n)<=1e-6:continue
   x=((vertices-.5)@p.T+.5)*Q; layers.append(((vertices@n).mean()+i*1e-5,x,uv,tx))
  for _,dst,uv,tx in sorted(layers,key=lambda z:z[0]):tri_draw(out[d],dst,uv,tx)
  out[d,:,:,:3]/=np.maximum(1e-10,out[d,:,:,3:4]);
 return out

def all_frames(seq,weights=None):
 v=np.array(seq);alpha=np.average(v[:,:,:,3:4],axis=0,weights=weights); rgb=np.average(v[:,:,:,:3]*v[:,:,:,3:4],axis=0,weights=weights)/np.maximum(1e-10,alpha);return np.concatenate((rgb,alpha),axis=-1)

def stat(views):
 v=np.array(views).reshape(-1,4);a=v[:,3];s=float(a.sum())
 if s<=0:return None
 co=np.average(v[:,:3],axis=0,weights=a); Li=v[:,:3]@[.2126,.7152,.0722]
 return co, float(np.sqrt(np.average((Li-np.average(Li,weights=a))**2,weights=a)))

def hx(arg):return '' if arg is None else '#'+''.join(f'{int(np.clip(i,0,1)*255+.5):02X}' for i in arg[0])

@dataclass
class Profile:
 views:np.ndarray
 refs:str=''
 state:str=''
 note:str=''
 shape:str=''
 def __post_init__(self):
  self.cover=self.views[:,:,:,3].mean(axis=(1,2));self.sides=[i for i in SIDE if self.cover[i]>.001]; self.grps=[([2] if self.cover[2]>.001 else []),self.sides];self.grps.append(sum(self.grps,[]));
  self.stats=[stat(self.views[g]) if g else None for g in self.grps];self.labs=[rgb2lab(s[0].astype(float).reshape(1,3))[0] if s else None for s in self.stats]
  self.edges=[]
  for g in self.grps:
   vals=[]
   for i in g:
    p=self.views[i]; light=p[:,:,:3]@[.2126,.7152,.0722];a=p[:,:,3];
    for d in (0,1):
     t=a.shape[d]; x=np.take(a,range(2,t),axis=d)*np.take(a,range(t-2),axis=d)
     if float(x.sum())>0: vals.append(np.average(abs(np.take(light,range(2,t),axis=d)-np.take(light,range(t-2),axis=d)), weights=x))
   self.edges.append(float(np.mean(vals)) if vals else 0.)
  self.colors=[hx(s) for s in self.stats]
 def swatches(self):
  if not self.stats[2]:return ['','']
  d=max([4,5,0,1],key=lambda i:self.cover[i]);
  def thumb(i):
   if self.cover[i]<=.001:return ''
   v=self.views[i]; H=v.shape[0]
   if H>Q:
    xy=(max(1,int(Q*Q/H)),Q); im=Image.fromarray(np.clip(np.floor(v*255+.5),0,255).astype(np.uint8)).resize(xy,Image.Resampling.NEAREST); simg=Image.new('RGBA',(Q,Q));simg.paste(im,((Q-xy[0])//2,0)); v=rgba(simg)
   return pngurl(v)
  return [thumb(d),thumb(2)]

def compare(m,b):
 ds=[float(deltaE_ciede2000(x.reshape(1,3),y.reshape(1,3))[0]) if x is not None and y is not None else None for x,y in zip(m.labs,b.labs)]
 st,ss,sa=ds; mt,ms=float(m.cover[2]),float(max(m.cover[SIDE])); bt,bs=float(b.cover[2]),float(max(b.cover[SIDE]));
 if st is not None and ss is not None:
  t=.42*min(mt,bt);s=.58*min(ms,bs);w=(t/(t+s),s/(t+s),0);mode='Top + sides'
 elif st is not None:w=(1,0,0);mode='Top only'
 elif ss is not None:w=(0,1,0);mode='Sides only'
 elif sa is not None:w=(0,0,1);mode='Different surfaces'
 else:return (None,None,None,'Not applicable',float('inf'))
 C=sum((d or 0)*v for d,v in zip(ds,w)); shape=(abs(mt-bt)+sum(abs(i-j) for i,j in zip(sorted(m.cover[SIDE]),sorted(b.cover[SIDE]))))/5
 x=sum(w[i]*(18*abs((m.stats[i][1] if m.stats[i] else 0)-(b.stats[i][1] if b.stats[i] else 0))+28*abs(m.edges[i]-b.edges[i])) for i in range(3))
 return C,st,ss,mode,C+18*shape+x+(6 if mode=='Different surfaces' else 0)+(5 if 'proxy' in b.note else 0)

class DefaultAssets:
 def __init__(self,path:Path):
  self.path=path;self.mc=zipfile.ZipFile(path/'client.jar');self.mcfiles=set(self.mc.namelist());self.pack=zipfile.ZipFile(path/'bpack.zip'); self.reg=zipfile.ZipFile(path/'bentries.zip')
  assert self.pack.comment.decode()=='2e793bc63ebffe2333039516c9d9be55f504c20c'; assert self.reg.comment.decode()=='77393d1a1e30e2a1d35237fcd193ff3d573d096b';
  pr=self.pack.namelist()[0];zr=self.reg.namelist()[0]
  self.p_png={n.removeprefix(pr+'default/textures/')[:-4]:n for n in self.pack.namelist() if n.startswith(pr+'default/textures/') and n.endswith('.png')}
  self.p_glb={n.removeprefix(pr+'default/models/')[:-4]:n for n in self.pack.namelist() if n.startswith(pr+'default/models/') and n.endswith('.glb')}
  self.r_png={int(n.rsplit('/',1)[1].split('_',1)[0]):n for n in self.reg.namelist() if n.startswith(zr+'textures/') and n.endswith('.png')}
  self.entries={}
  for p in self.reg.namelist():
   if p.startswith(zr+'entries/') and p.endswith('.json'):
    e=json.loads(self.reg.read(p));
    if e['kind']=='block':self.entries[e['name']]=e
  off={re.sub(r' \[[^\]]+\]$','',l.strip()) for l in (path/'b_names.txt').read_text().splitlines() if l.strip() and not l.startswith('#')};assert len(off)==1523 and off<=self.entries.keys()
  self.roots={n:self.entries[n] for n in off|{'Air'}}
  st=(path/'atlas.js').read_text(); nt=(path/'textures.js').read_text(); gl=(path/'models.js').read_text()
  tn=re.search(r'const \w+="(lava0\\n[^"\n]+)"',nt)[1].split(r'\n'); self.tileids={n:i for i,n in enumerate(tn)}
  g=re.search(r'blockAtlasUrls:\(\)=>(\w+)',st)[1]; m=re.search(r'const (\w+)=(\d+),(\w+)=\[([\d,]+)\],'+g+r'=\[(.*?)\]',st)
  self.sz=int(m[2]);self.nums=list(map(int,m[4].split(',')));assert sum(self.nums)==len(tn)==1446
  bu={m[1]:m[2] for m in re.finditer(r'(?<!\d)(\d+):(?:\([^)]*\)|\w+)=>\{\w+\.exports="data:image/png;base64,([A-Za-z0-9+/=]+)"\}',st)}
  self.sheets=[rgba(Image.open(io.BytesIO(base64.b64decode(bu[i])))) for i in re.findall(r'\w+\((\d+)\)',m[5])]
  media={m[1]:m[2] for m in re.finditer(r'(?<!\d)(\d+):\([^)]*\)=>\{\w+\.exports=\w+\.p\+"(static/media/[^"]+)"\}',gl)}
  self.glb_url={m[1]:media[m[2]] for m in re.finditer(r'"\./([^\"]+)\.glb":(\d+)',gl) if m[2] in media}
  self.png_url={m[1]:media[m[2]] for m in re.finditer(r'\{name:"([^"]+)",url:\(\)=>\w+\((\d+)\)\}',gl) if m[2] in media}
  self.apath=path/'media'; self.apath.mkdir(exist_ok=True); self.liveMiss=set()
  self.lang=json.loads(self.mc.read(A+'lang/en_us.json'))
  self.declared={n.removeprefix('minecraft:') for n in json.loads((path/'registry-block.json').read_text())};
  files={n.rsplit('/',1)[1][:-5] for n in self.mcfiles if n.startswith(A+'blockstates/') and n.endswith('.json')};
  assert len(self.declared)==1286 and files-self.declared=={'item_frame','glow_item_frame'} and self.declared<=files
 @cache
 def mjson(self,p):
  p=A+p+'.json'; return json.loads(self.mc.read(p)) if p in self.mcfiles else {}
 @cache
 def mtex(self,tex,tint=None):
  p=A+'textures/'+tex+'.png'
  if p not in self.mcfiles:return None
  z=rgba(Image.open(io.BytesIO(self.mc.read(p))));h,w=z.shape[:2];fp=p+'.mcmeta'
  if fp in self.mcfiles:
   a=json.loads(self.mc.read(fp)).get('animation')
   if isinstance(a,dict):
    fw=a.get('width',min(h,w));fh=a.get('height',fw); cols=w//fw
    ids=a.get('frames',range((h//fh)*cols)); L=[]; ws=[]
    for f in ids:
     i=f.get('index') if isinstance(f,dict) else f; r=i//cols*fh;c=i%cols*fw; L.append(z[r:r+fh,c:c+fw]);ws.append(f.get('time',a.get('frametime',1)) if isinstance(f,dict) else a.get('frametime',1))
    if L:z=all_frames(L,ws)
  if tint is not None:z=z.copy(); z[:,:,:3]*=np.array(tint)
  return z
 @cache
 def model(self,n):
  j=self.mjson('models/'+n.removeprefix('minecraft:'))
  if not j:return {},[]
  t,v=self.model(j['parent']) if 'parent' in j else ({},[])
  return {**t,**j.get('textures',{})},j.get('elements',v)
 @staticmethod
 def resolve(t,d):
  for _ in range(16):
   if isinstance(d,dict):d=d.get('sprite','')
   if not d.startswith('#'):
    if d in t:d=t[d];continue # some models use bare aliases (e.g. heavy_core → all)
    return d.removeprefix('minecraft:')
   d=t.get(d[1:],'')
  return ''
 @cache
 def b_atlas(self,i):
  if not isinstance(i,int) or i<0 or i>=sum(self.nums):return None
  for arr,count in zip(self.sheets,self.nums):
   if i<count:
    col=arr.shape[1]//self.sz; u=i%col*self.sz;v=i//col*self.sz;return arr[v:v+self.sz,u:u+self.sz]
   i-=count
 def file_for(self,relative):return self.apath/urllib.parse.unquote(relative.rsplit('/',1)[1])
 def fetch_asset(self,u):
  p=self.file_for(u)
  if p.exists():return p
  if u in self.liveMiss:return None
  try:
   url='https://bloxd.io/'+urllib.parse.quote(urllib.parse.unquote(u),safe='/._-~!()')
   val=subprocess.check_output(['curl','-fsSL','--max-time','9',url],stderr=subprocess.DEVNULL)
   if val[:4] not in (b'glTF',b'\x89PNG'):raise ValueError('Invalid media')
   p.write_bytes(val);return p
  except (ValueError,subprocess.SubprocessError):self.liveMiss.add(u);return None
 @cache
 def btexture(self,n,idx=None):
  if n in self.tileids:return self.b_atlas(self.tileids[n]),'live default tile '+n
  x=self.b_atlas(idx)
  if x is not None:return x,'live default tile #'+str(idx)
  if n in self.png_url:
   p=self.file_for(self.png_url[n]);
   if p.exists():return rgba(Image.open(p)),'live default sprite '+n
  if n in self.p_png:return rgba(Image.open(io.BytesIO(self.pack.read(self.p_png[n])))),'Bloxdy default PNG '+n
  return None
 def fetch_models(self,choices):
  U=set()
  for n in choices:
   e=self.entries.get(n,{})
   if not e:continue
   root=e.get('meta',{}).get('rootName',n);model=e.get('blockModel'); tex=e.get('textureInfo');
   if not tex or model or isinstance(tex,str) and tex not in self.tileids and e.get('model') in ('rotatable','rotatableOffset','CustomModel','door','trapdoor'):
    for k in (model,n,root,e.get('itemTexture')):
     u=self.glb_url.get(k)
     if u:U.add(u); break
   for k in ('_'+root+' Top','_'+root+' Head','_'+root+' Flag Hanging'):
    if k in self.glb_url and (root.endswith((' Door',' Bed',' Banner'))):U.add(self.glb_url[k]);
   if not e.get('atlasIdx') and isinstance(tex,str) and tex in self.png_url:U.add(self.png_url[tex])
  with concurrent.futures.ThreadPoolExecutor(10) as ex: x=list(ex.map(self.fetch_asset,sorted(U))); print('Visible model/sprite assets fetched',sum(bool(f) for f in x),'/',len(U),flush=True)

 def tints(self,k,tx,index,props):
  if tx.endswith(('water_still','water_flow')):return tuple(rgbint(0x3f76e4))
  if index is None:return None
  if k in ('golden_dandelion','potted_golden_dandelion'):return None
  if k in ('potted_fern','fern','grass','bamboo_sapling','frogspawn'):
   t=self.mtex('colormap/grass'); return tuple(t[173,51,:3])
  if k.endswith('_leaves'):
   t=self.mtex('colormap/foliage');return tuple(t[173,51,:3])
  return None
 def _prefs(self,k,override):
  p=dict(axis='y', facing='north', vertical_direction='up', half='bottom', type='bottom', part='foot', hinge='left', open='false',
   shape='straight', attachment='floor', face='floor', snowy='false', powered='false', lit='false', waterlogged='false', extended='false',
   age='0', hatch='0', bites='0', power='0', rotation='0', attached='true', level='3', tested='false', crafting='false', triggered='false',
   mode='data', conditional='false', up='true', down='false', north='false', south='false', east='false', west='false', orientation='north_up',
   occupied='false', distance='1', bottom='false', count='1', candles='1', slot_0_occupied='false', slot_1_occupied='false', slot_2_occupied='false')
  if k.endswith('_wall'):p.update(north='low',south='low',east='none',west='none')
  if k.endswith(('_pane','_bars','_fence')):p.update(north='true',south='true')
  if k.endswith('_trapdoor'):p['half']='top'
  if k.endswith(('candle','candle_cake')) or k=='soul_campfire':p['lit']='true'
  if k=='torchflower_crop':p['age']='1'
  if k in ('pitcher_crop','pitcher_plant'):p['age']='4'
  if override:p.update(override)
  return p
 def _blocks(self,j,p):
  if j.get('variants'):
   x=[]
   for i,(key,v) in enumerate(j['variants'].items()):
    kv=dict(a.split('=',1) for a in key.split(',') if '=' in a)
    w=sum((a in p and p[a]!=b)*(4 if a in ('half','part','age','type','shape','axis','mode') else 1) for a,b in kv.items());x.append((w,i,key,v,kv))
   _,_,key,v,e=min(x);return [v[0] if isinstance(v,list) else v],key or 'default',p|e
  def applies(cond):
   if not cond:return True
   if 'OR' in cond:return any(applies(c) for c in cond['OR'])
   if 'AND' in cond:return all(applies(c) for c in cond['AND'])
   return all(str(p.get(key,'false')) in str(v).split('|') for key,v in cond.items())
  cs=[q['apply'] for q in j.get('multipart',[]) if applies(q.get('when'))]
  if not cs and j.get('multipart'):cs=[j['multipart'][0]['apply']]
  return [c[0] if isinstance(c,list) else c for c in cs],'multipart • representative connections',p
 def mmesh(self,k,variants,props):
  q=[]; refs=set(); fbs=set()
  for v in variants:
   tx,els=self.model(v['model']);
   if 'particle'in tx:fbs.add(self.resolve(tx,tx['particle']))
   for i,c in enumerate(els):
    if not ('from'in c and 'to'in c):continue
    lo=np.array(c['from']); hi=np.array(c['to']); rotate=c.get('rotation')
    for dn,d in c.get('faces',{}).items():
     idx=DIR.index(dn);key=self.resolve(tx,d['texture']); tc=self.mtex(key,self.tints(k,key,d.get('tintindex'),props))
     if tc is None:continue
     ref=key; refs.add(ref); pts=face(lo,hi,idx)/16; n=NORM[idx].astype(float)
     if rotate and 'axis'in rotate:
      a='xyz'.index(rotate['axis']); angle=rotate.get('angle',0); ang=[0,0,0];ang[a]=angle; rm=Rotation.from_euler('xyz',ang,degrees=True)
      pa=np.array(rotate.get('origin',[8,8,8]))/16;pts=rm.apply(pts-pa);n=rm.apply(n)
      if rotate.get('rescale') and abs(angle)<89:pts*=np.array([1 if b==a else 1/math.cos(math.radians(angle)) for b in range(3)])
      pts+=pa
     if v.get('x') or v.get('y'):
      r=Rotation.from_euler('xyz',[-v.get('x',0),-v.get('y',0),0],degrees=True); pts=r.apply(pts-.5)+.5;n=r.apply(n)
     uv=uvquad(np.array(d.get('uv',defaultuv(lo,hi,idx)))/16,d.get('rotation',0));q.append((pts,uv,tc,n,i))
  return q,refs,fbs
 def entmesh(self,k,q,refs):
  def tx(name,tint=None):refs.add(name);return self.mtex(name,tint)
  def texbox(lo,hi,t,off,w,h,d):
   if t is None:return
   u,v=off;H,W=t.shape[:2]
   R=[(u+d+w,v+d,u+d+w+d,v+d+h),(u,v+d,u+d,v+d+h),(u+d,v,u+d+w,v+d),(u+d+w,v,u+d+2*w,v+d),(u+d,v+d,u+d+w,v+d+h),(u+2*d+w,v+d,u+2*d+2*w,v+d+h)]
   box(q,lo,hi,t,[(a/W,b/H,c/W,e/H) for a,b,c,e in R]);
  c=k.removeprefix('waxed_'); ox=next((x for x in ('exposed','weathered','oxidized') if c.startswith(x+'_')), ''); oxs='_'+ox if ox else ''
  if c.endswith('copper_chest'):
   v=tx('entity/chest/copper'+oxs);texbox((1/16,0,1/16),(15/16,10/16,15/16),v,(0,19),14,10,14);texbox((1/16,10/16,1/16),(15/16,15/16,15/16),v,(0,0),14,5,14);texbox((7/16,7/16,15/16),(9/16,11/16,1),v,(0,0),2,4,1)
   return 'Single closed chest; visible entity UV faces.'
  if c.endswith('copper_golem_statue'):
   v=tx('entity/copper_golem/copper_golem'+oxs);texbox((.3,.48,.31),(.7,.86,.69),v,(0,0),8,8,8);texbox((.31,.14,.34),(.69,.48,.66),v,(0,19),8,7,6);return 'Measured copper-golem skin UV on representative head/body; exact pose can vary.'
  if k.endswith('shulker_box'):
   color=k.removesuffix('_shulker_box');v=tx('entity/shulker/shulker'+('_'+color if color in DYE else ''))
   texbox((0,0,0),(1,.5,1),v,(0,28),16,8,16);texbox((0,.5,0),(1,1,1),v,(0,0),16,12,16);return 'Closed shulker-box entity UV; no opening animation.'
  if k.endswith('_banner'):
   co=k.removesuffix('_banner').removesuffix('_wall');v=tx('entity/banner/banner_base',tuple(rgbint(DT.get(co,DT['white'])))); cloth=v[1:41,1:21];
   for d in (4,5):q.append((face((.17,0,.5),(.83,.96,.5),d),uvquad((0,0,1,1)),cloth,NORM[d],0))
   return 'Plain dye-color cloth; patterns and supports are not scored.'
  if k.endswith(('_head','_skull')):
   t={'creeper':'entity/creeper/creeper','zombie':'entity/zombie/zombie','piglin':'entity/piglin/piglin','player':'entity/player/wide/steve','dragon':'entity/enderdragon/dragon','skeleton':'entity/skeleton/skeleton','wither_skeleton':'entity/skeleton/wither_skeleton'}
   root=re.sub(r'_(?:wall_)?(?:head|skull)$','',k);tex=t.get(root)
   if tex:
    v=tx(tex);s=.42 if 'wall' in k else .25
    if root=='dragon':
     texbox((.125,.20,.05),(.875,.95,.80),v,(112,30),16,16,16);texbox((.2,.18,.66),(.8,.60,1),v,(176,44),12,5,16)
    else:texbox((.25,0,s),(.75,.5,min(s+.5,1)),v,(0,0),8,8,8)
    return 'Representative closed head; model extensions or jaw omitted.'+(' Steve skin used as an example; player skins vary.' if root=='player' else '')
  if k=='conduit':
   v=tx('entity/conduit/base');box(q,(.27,.27,.27),(.73,.73,.73),v);return 'Conduit base texture reference; independent cage, eye and wind effects excluded.'
  if k=='enchanting_table':return 'Table base measured; moving book omitted.'
  return ''
 @cache
 def minecraft(self,k):
  if k in ('air','cave_air','void_air','barrier','light','structure_void','moving_piston'):return Profile(BLANK, state='No permanent visible surface', note='Visible only as an editor/held-item marker, if applicable; editor particles were not scored.')
  j=self.mjson('blockstates/'+k); variants=list(j.get('variants',{})); variant_sets=[None];notes=[]
  if any('half=upper' in s for s in variants):variant_sets=[{'half':'upper'},{'half':'lower'}];notes.append('Both halves sampled.')
  if any('part=foot' in s for s in variants):variant_sets=[{'part':'foot'},{'part':'head'}];notes.append('Both bed parts sampled.')
  states=[];refs=set();imgs=[];fallback=set()
  for vr in variant_sets:
   opts,state,props=self._blocks(j,self._prefs(k,vr)); mesh,r,fbs=self.mmesh(k,opts,props); note=self.entmesh(k,mesh,r);fallback|=fbs
   if note:notes.append(note)
   if mesh: imgs.append(raster(mesh));states.append(state);refs|=r
  if not imgs:
   for p in [*sorted(fallback),'block/'+k]:
    t=self.mtex(p)
    if t is None:continue
    mesh=[];box(mesh,(0,0,0),(1,1,1),t);imgs=[raster(mesh)];refs.add(p);notes.append('Texture proxy: no static model faces resolved. Do not infer geometry from the swatch.');states=['Texture-only reference'];break
  if not imgs:return Profile(BLANK,'','No resolved surface','No visible default surface was available to score.')
  if len(imgs)>1:
   v=np.concatenate(imgs,axis=1)
   if k.endswith('_door'):
    v[2]=0;v[2,:Q]=imgs[0][2];v[3]=0;v[3,Q:]=imgs[1][3]
  else:v=imgs[0]
  return Profile(v,'; '.join(sorted(refs)),' + '.join(states),'; '.join(dict.fromkeys(notes)))
 @staticmethod
 def b_shape(n,e):
  root=e.get('meta',{}).get('rootName',n); name=root.lower();m=e.get('model','').split('|')[0]
  if root=='Air' or root.startswith('Invisible '):return 'empty'
  if root in ('Water','Lava'):return 'fluid'
  if root.endswith(' Ladder'):return 'ladder'
  if root.endswith(' Log'):return 'log'
  if name.endswith('leaves') and not name.startswith('fallen '):return 'leaves'
  if name.endswith(' glass') or name=='glass' or name=='reactor glass':return 'glass'
  if name.endswith((' bed',' strongbed')):return 'bed'
  if name.endswith(' carpet'):return 'carpet'
  if name.endswith(' banner'):return 'banner'
  if name.endswith(' sapling'):return 'sapling'
  if m in ('Slab','Stairs','fence','fenceGate','door','trapdoor'):return m.lower()
  if root.endswith('Torch') or root in ('Lantern','Crystal'):return 'fixture'
  if 'vine' in name or root=='Dangling Rope':return 'vine'
  if root in ('Wire','Pipe','Extractor Pipe'):return 'line'
  if root.endswith(' Chest') or root=='Chest':return 'storage'
  if m in ('CentreCross','SquareSided','CustomPlanes'):return 'plant'
  if root.endswith(' Ore'):return 'ore'
  if ' portal' in name:return 'portal'
  if (m in ('CustomModel','rotatable','rotatableOffset') and e.get('blockModel')):return 'prop'
  return 'cube'
 @cache
 def glb(self,n):
  if n in self.glb_url and (p:=self.file_for(self.glb_url[n])).exists():b=p.read_bytes();label='live default GLB '+n
  elif n in self.p_glb:b=self.pack.read(self.p_glb[n]);label='Bloxdy default GLB '+n
  else:return None
  if b[:4]!=b'glTF':return None
  size=struct.unpack_from('<I',b,12)[0]; j=json.loads(b[20:20+size]); data=b[28+size:]; parts=[]
  def buf(v):
   g=j['bufferViews'][v];o=g.get('byteOffset',0);return data[o:o+g['byteLength']]
  def attr(a):
   t=j['accessors'][a]; v=j['bufferViews'][t['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[t['type']];c=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5122:'<i2',5121:'u1',5120:'i1'}[t['componentType']]);p=c.itemsize
   ar=np.ndarray((t['count'],n),c,data, v.get('byteOffset',0)+t.get('byteOffset',0),(v.get('byteStride',n*p),p));return ar.astype(float)/np.iinfo(c).max if t.get('normalized') else ar
  def mat(i):
   m=j.get('materials',[{}])[i] if 'materials'in j else {}; p=m.get('pbrMetallicRoughness',{}); im=np.ones((1,1,4),np.float32)
   if 'baseColorTexture'in p:
    tr=j['textures'][p['baseColorTexture']['index']]; f=j['images'][tr['source']];
    if 'bufferView'in f: im=rgba(Image.open(io.BytesIO(buf(f['bufferView']))))
   im*=np.array(p.get('baseColorFactor',[1,1,1,1]),np.float32)
   if m.get('alphaMode')=='MASK': im[:,:,3]=(im[:,:,3]>=m.get('alphaCutoff',.5))
   return im,m.get('doubleSided',False)
  mats={i:mat(i) for i in range(len(j.get('materials',[{}])))}
  def walk(i,V):
   m=j['nodes'][i];g=np.eye(4)
   if 'matrix'in m:g=np.array(m['matrix']).reshape(4,4).T
   else:
    g[:3,:3]=(Rotation.from_quat(m['rotation']).as_matrix() if 'rotation'in m else np.eye(3))@np.diag(m.get('scale',[1,1,1]));g[:3,3]=m.get('translation',[0,0,0])
   V=V@g
   if 'mesh'in m:
    for p in j['meshes'][m['mesh']]['primitives']:
     if p.get('mode',4)!=4:continue
     dr=p.get('extensions',{}).get('KHR_draco_mesh_compression'); ar=p['attributes']
     if dr:
      if DracoPy is None:continue
      D=DracoPy.decode(buf(dr['bufferView']));r={x['unique_id']:x['data'] for x in D.attributes};a={k:r[v] for k,v in dr['attributes'].items()};idx=np.asarray(D.faces).astype(int)
     else:
      if any('bufferView' not in j['accessors'][v] for v in ar.values()):continue
      a={k:attr(v) for k,v in ar.items()}; idx=attr(p['indices']).astype(int).reshape(-1,3) if 'indices'in p else np.arange(len(a['POSITION'])).reshape(-1,3)
     x=a['POSITION']@V[:3,:3].T+V[:3,3];uv=a.get('TEXCOORD_0',np.zeros((len(x),2)));nv=a.get('NORMAL');ns=nv@np.linalg.pinv(V[:3,:3]) if nv is not None else None;tex,dbl=mats.get(p.get('material',0),(np.ones((1,1,4),np.float32),False));parts.append((x,uv,ns,idx,tex,dbl))
   for c in m.get('children',[]):walk(c,V)
  for i in j['scenes'][j.get('scene',0)].get('nodes',[]):walk(i,np.eye(4))
  return (parts,label) if parts else None
 def transform_mesh(self,e,shape,parts):
  out=[]; a=np.concatenate([z[0] for z in parts]);lo=a.min(axis=0);hi=a.max(axis=0); w=hi-lo; mid=(lo+hi)/2;
  f=e.get('modelScale',8)/8
  if max(w)>2.2: f=1/max(w) if shape in ('door','trapdoor','fencegate','ladder','banner','prop') or max(w)>4 else .75/max(w)
  if shape in ('bed','carpet') and max(w)>0 and max(w)*f<.96:f=1/max(w)
  if shape=='bed' and max(w)>1.3: f=1/max(w)
  shift=[.5,0,.5];center=np.array([mid[0],lo[1],mid[2]])
  if shape=='trapdoor':shift[1]=.875
  if shape=='door':shift[2]=.93
  if shape in ('ladder','vine') and str(e.get('model','')).startswith('rotatable'):shift[2]=.07
  if shape=='line':shift[1]=.02
  if isinstance(e.get('blockModel'),str) and 'torch_wall' in e['blockModel']:shift[1]=.18;shift[2]=.80
  for x,uv,ns,idx,tx,db in parts:
   pos=(x-center)*f+shift
   for ii in idx:
    p=pos[ii]; n=ns[ii].mean(axis=0) if ns is not None else np.cross(p[1]-p[0],p[2]-p[0]);out.append((p,uv[ii],tx,None if db else n,0))
  return out
 @cache
 def bloxd(self,n):
  e=self.entries[n]; shape=self.b_shape(n,e); root=e.get('meta',{}).get('rootName',n); st=e.get('rootMetaDesc',n); t=e.get('textureInfo'); idx=e.get('atlasIdx'); it=e.get('itemTexture');bm=e.get('blockModel'); refs=[];notes=[]; meshes=[]; main=[]
  if shape=='empty':return Profile(BLANK,'',st,'No default visible texture.',shape)
  for name in dict.fromkeys((bm,n,root,it)) if bm or not t else ():
   if name is None:continue
   try:g=self.glb(name)
   except (ValueError,KeyError,OSError,IndexError,struct.error):g=None
   if g:
    main=self.transform_mesh(e,shape,g[0]);refs.append(g[1]);break
  if main:
   stem={'bed':' Head','door':' Top','banner':(' Flag Hanging' if n.endswith('|side') else ' Flag')}.get(shape)
   if stem:
    other='_'+root+stem; opt=self.entries.get(other,{})
    mn=opt.get('blockModel') if shape!='banner' else None
    try:v=(self.glb(other) or (self.glb(mn) if mn else None))
    except (ValueError,KeyError,OSError):v=None
    if v:meshes.append(self.transform_mesh(e,shape,v[0]));refs.append(v[1]);notes.append('Both model parts sampled.')
  if not main:
   def tx(n,i=None):
    if isinstance(n,str):return self.btexture(n,i if isinstance(i,int) else None)
    if isinstance(n,dict) and n.get('animTextures'):
     colors=[self.btexture(k) for k in n['animTextures']]; a=[x for x in colors if x]
     if a and all(x[0].shape==a[0][0].shape for x in a):return all_frames([x[0] for x in a]),'; '.join(x[1] for x in a)
    return None
   flats=[]; f=[]
   if isinstance(t,list) and len(t)==4 and all(isinstance(x,(int,float)) for x in t) and shape=='fluid':a=(np.array([[t]],np.float32),'live default RGBA '+str(t))
   elif isinstance(t,list):
    flats=[tx(s,idx[i] if isinstance(idx,list) and len(idx)>i else None) for i,s in enumerate(t)];a=next((x for x in flats if x),None);f=e.get('texturePerSide',[])
   elif t:a=tx(t,idx)
   else:a=self.btexture(None,idx) if isinstance(idx,int) else None
   if a is None and it:a=self.btexture(it);notes.append('Inventory sprite proxy; no complete geometry.') if a else None
   if a is None and not t and e['id'] in self.r_png:
    z=self.r_png[e['id']];a=(rgba(Image.open(io.BytesIO(self.reg.read(z)))),'registry texture proxy '+z.rsplit('/',1)[1]);notes.append('Fallback sprite proxy, not a world model.')
   if a is None:return Profile(BLANK,'',st,'No visible default surface was found.',shape)
   refs.append(a[1]); chosen=[flats[i] if isinstance(i,int) and i<len(flats) and flats[i] else a for i in f] if len(f)==6 else [a]*6
   refs.extend(x[1] for x in chosen);images=[x[0] for x in chosen]; z=a[0]; model=e.get('model','').split('|')[0];
   if shape=='slab':
    always_same=len({i[1] for i in chosen})==1
    box(main,(0,0,0),(1,.5,1),images,[(0,.5,1,1) if d in SIDE and always_same else (0,0,1,1) for d in range(6)])
   elif shape=='stairs':
    box(main,(0,0,0),(1,.5,1),images,[(0,.5,1,1) if d in SIDE else (0,0,1,1) for d in range(6)]);box(main,(0,.5,.5),(1,1,1),images,[(0,0,1,.5) if d in SIDE else (0,.5,1,1) for d in range(6)])
   elif shape in ('plant','sapling') or model in ('CentreCross','SquareSided'):
    cross(main,z, model=='SquareSided');
    if model=='CustomPlanes' and len(flats)>1 and flats[1]:cross(main,flats[1][0]);refs.append(flats[1][1]);
   elif shape=='fence':
    box(main,(.375,0,.375),(.625,1,.625),images);
    for l,h in ((0,.375),(.625,1)):
     for y in (.35,.68):box(main,(.431,y,l),(.569,y+.15,h),images)
   elif shape=='fencegate':
    for l,h in ((0,.16),(.84,1)):box(main,(l,0,.43),(h,1,.57),images)
    for y in (.34,.68):box(main,(.16,y,.44),(.84,y+.15,.56),images)
   elif shape in ('carpet','ladder','line','banner','fixture','door','trapdoor','prop','vine'):
    plane(main,z,2 if shape in ('carpet','trapdoor') else 4); notes.append('Flat texture proxy for this model.')
   else:box(main,(0,0,0),(1,1,1),images)
  v=raster(main)
  if meshes:
   extra=raster(meshes[0]);a=np.concatenate([extra,v],axis=1)
   if shape in ('door','banner'):
    a[2]=0;a[2,:Q]=extra[2];a[3]=0;a[3,Q:]=v[3]
   v=a
  return Profile(v,'; '.join(dict.fromkeys(refs)),st,'; '.join(dict.fromkeys(notes)),shape)
