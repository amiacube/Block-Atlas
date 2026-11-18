"""Fetch immutable assets for the Java 26.3 / Bloxd c0ace454 snapshot (not required to run the app)."""
import argparse, concurrent.futures, hashlib, subprocess
from pathlib import Path

URLS={
'client.jar':('https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar','sha1','e877b6a07acd633fb3bb475002175cec036e7b87'),
'registry-block.json':('https://raw.githubusercontent.com/misode/mcmeta/26.3-registries/block/data.json','sha256','f0a264dcec2a72b1e2d3a36e1dc70c73b99c04c4637b20f909b908eca8c651ae'),
'bpack.zip':('https://codeload.github.com/Bloxdy/texture-packs/zip/2e793bc63ebffe2333039516c9d9be55f504c20c',None,None),
'bentries.zip':('https://codeload.github.com/imu31465/Bloxd-Entries-Data/zip/77393d1a1e30e2a1d35237fcd193ff3d573d096b',None,None),
'b_names.txt':('https://raw.githubusercontent.com/Bloxdy/code-api/cec73059b21be931d490778c2128b5ce309374b0/BLOCK_NAMES.txt',None,None),
'atlas.js':('https://bloxd.io/static/js/l9xvfg.187.50ca908f.chunk.js','sha256','09221dcdd054c1cf527eeeebd84122d2e2bda2a4f9269c9c906e17c5d3dfb01b'),
'textures.js':('https://bloxd.io/static/js/l9xvfg.textureNameTable.51bcaa13.chunk.js','sha256','ba18563ff6b1d26eb0ba047fa1dacfe295505f77bed7807d18f94d6c9542f4f7'),
'models.js':('https://bloxd.io/static/js/l9xvfg.modelCatalogue.a29c5191.chunk.js','sha256','c93e2cf8181ee8f82bc2288b0ff5e275f83d556bb5c2c74ce7464fc918f62e77'),
}

def get_assets(base):
 base.mkdir(parents=True,exist_ok=True)
 def one(job):
  name,(url,algo,digest)=job;p=base/name
  verify=lambda: p.exists() and p.stat().st_size>0 and (not algo or hashlib.new(algo,p.read_bytes()).hexdigest()==digest)
  if not verify():
   tmp=p.with_suffix(p.suffix+'.tmp');subprocess.run(['curl','-fsSL','--retry','2','--max-time','70',url,'-o',str(tmp)],check=True);tmp.replace(p)
  if not verify():raise ValueError('Mismatched snapshot file: '+name)
  return name
 with concurrent.futures.ThreadPoolExecutor(6) as ex: print('Pinned inputs ready:',', '.join(ex.map(one,URLS.items())))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory',type=Path);get_assets(p.parse_args().directory)
