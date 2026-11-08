"""Author seamless 4K onion PBR maps with reference-matched pigments.
The supplied reference provides the palette, not falsely upscaled photographic detail.
Fine paper fibers, wrinkles, and roughness are synthesized at native resolution.
Requires Pillow and NumPy; generated assets ship with the app.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/onion/textures';OUT.mkdir(parents=True,exist_ok=True)
W,H=4096,2048
rng=np.random.default_rng(6231)
u=np.arange(W,dtype=np.float32)[None,:]/W
v=np.arange(H,dtype=np.float32)[:,None]/(H-1)

def noise(w,h):
    data=rng.standard_normal((h,w+1)).astype(np.float32);data[:,-1]=data[:,0]
    image=Image.fromarray(data).resize((W+1,H),Image.Resampling.BICUBIC)
    return np.asarray(image,dtype=np.float32)[:,:W].copy()

broad=noise(28,7);fine=noise(320,48);grain=noise(1000,300)
height=broad*.014+fine*.009+grain*.003
pigment=broad*.042+fine*.018
rows=np.arange(H)[:,None]
# Non-mirrored, vertically flowing paper creases. Periodic indexing joins the back seam.
for i in range(560):
    width=rng.uniform(.6,2.4) if i>95 else rng.uniform(3,12)
    margin=int(width*4)+2;offsets=np.arange(-margin,margin+1)[None,:]
    start=rng.uniform(0,W)
    path=start + np.sin(v*rng.uniform(3,12)+rng.uniform(0,6.28))*rng.uniform(8,32)
    path+=np.sin(v*25+start)*1.4
    ix=np.floor(path).astype(np.int32)+offsets
    dist=ix-path
    amplitude=rng.uniform(.008,.04) if i>95 else rng.uniform(.05,.14)
    # Fold crests and their adjacent grooves remain geometrically paired in the normal map.
    fold=np.exp(-.5*(dist/width)**2)-.35*np.exp(-.5*((dist-width*1.8)/(width*.7))**2)
    fade=.65+.35*np.sin(v*rng.uniform(2,9)+i)**2
    height[rows,ix%W]+=fold*amplitude*fade
    pigment[rows,ix%W]-=np.exp(-.5*(dist/(width*.65))**2)*rng.uniform(.01,.06)*fade

# Fine cross-grain wrinkles interrupt the long paper fibers without a mirrored tile.
crinkle=np.sin(u*2*np.pi*87 + np.sin(v*59)*1.7 + broad*.25) * np.sin(v*143 + np.sin(u*2*np.pi*24)*2)
height+=crinkle*.022
pigment+=crinkle*.014
# Reference-matched purple, with restrained longitudinal pigment variation.
base=np.array([104,23,82],np.float32)
color=base[None,None,:]*(1+pigment[:,:,None])
color+=np.concatenate([v*0+1,v*0+.55,v*0+1.1],axis=1)[:,None,:]*(8*np.sin(v*4+1))[:,:,None]
color+=grain[:,:,None]*np.array([1.5,.8,1.3])[None,None,:]
color=np.uint8(np.clip(color,0,255))
rough=np.uint8(np.clip(132+broad*18+fine*8-height*95,95,192))
# Periodic derivatives match the longitude seam; vertical derivatives follow the meridian.
dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.5
dy=np.gradient(height,axis=0)
norm=np.stack([-dx*32,dy*22,np.ones_like(dx)],axis=2)
norm/=np.linalg.norm(norm,axis=2,keepdims=True)
normal=np.uint8(np.clip((norm*.5+.5)*255,0,255))
Image.fromarray(color).save(OUT/'onion-skin-color-4k.webp',quality=96)
Image.fromarray(rough).save(OUT/'onion-skin-roughness-4k.png',optimize=True)
Image.fromarray(normal).save(OUT/'onion-skin-normal-4k.png',optimize=True)
Image.fromarray(np.uint8(np.clip(128+height*210,0,255))).save(OUT/'onion-skin-height-4k.png',optimize=True)

# Cut-face atlas: wide pearl flesh, uneven purple membranes, and fine longitudinal fibers.
S=2048
fy,fx=np.mgrid[0:S,0:S].astype(np.float32)/(S-1)
warp=fx+.014*np.sin(fy*15)+.006*np.sin(fy*49)
border=np.exp(-np.maximum(warp,0)/.13)+.65*np.exp(-np.maximum(1-warp,0)/.11)
colors=np.array([236,210,228],np.float32)[None,None,:]-border[:,:,None]*np.array([75,109,72],np.float32)[None,None,:]
fiber=np.sin(fx*2*np.pi*71+np.sin(fy*8))*1.8+np.sin(fx*2*np.pi*233+fy*12)*.8
mottle=rng.normal(0,.65,(S,S)).astype(np.float32)
colors+=(fiber+mottle)[:,:,None]
Image.fromarray(np.uint8(np.clip(colors,0,255))).save(OUT/'onion-flesh-color-2k.webp',quality=96)
fleshHeight=np.sin(fx*2*np.pi*71+np.sin(fy*8))*.003+np.sin(fx*2*np.pi*233+fy*12)*.0006
fdy,fdx=np.gradient(fleshHeight)
fn=np.stack([-fdx*18,fdy*18,np.ones_like(fdx)],axis=2);fn/=np.linalg.norm(fn,axis=2,keepdims=True)
Image.fromarray(np.uint8((fn*.5+.5)*255)).save(OUT/'onion-flesh-normal-2k.png',optimize=True)
print('Authored 4096 × 2048 skin maps and 2048 × 2048 cut-face maps:',OUT)
