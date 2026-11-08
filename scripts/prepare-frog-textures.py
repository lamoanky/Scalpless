"""Author seamless frog PBR textures. No marketplace assets are copied.

Run with Python, Pillow and NumPy. The anatomy remains an artistic approximation.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'public/textures/frog'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(1780)
S = 2048
y, x = np.mgrid[:S, :S].astype(np.float32) / S

def noise(size):
    a = rng.random((size+1,size+1))
    a[-1] = a[0]; a[:,-1] = a[:,0]
    return np.asarray(Image.fromarray(np.uint8(a*255)).resize((S,S),Image.Resampling.BICUBIC),dtype=np.float32)/255

broad, grain, fine = noise(12), noise(90), noise(650)
cloud = .62*broad+.26*noise(32)+.12*grain
spots = np.zeros((S,S),dtype=np.float32)
for size,amount in [(19,.75),(43,.25)]:
    n=noise(size)
    spots+=np.clip((n-.65)*5,0,1)*amount
pores = np.clip((fine-.56)*3,0,1)

def save_maps(name, color, height, roughness):
    Image.fromarray(np.uint8(np.clip(color,0,255))).save(OUT/f'{name}-color.webp',quality=94,method=6)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*3
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*3
    normal=np.stack([-dx,dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255)).save(OUT/f'{name}-normal.webp',quality=94,method=6)
    Image.fromarray(np.uint8(np.clip(roughness,0,1)*255)).save(OUT/f'{name}-roughness.webp',quality=92,method=6)

skin=np.array([112,125,65])+((cloud-.5)*52-spots*70)[...,None]*np.array([1,.86,.53])
skin+=(grain-.5)[...,None]*12
save_maps('skin',skin,.65*pores+.15*grain+.3*spots,.58+grain*.25-spots*.12)

belly=np.array([191,183,149])+((cloud-.5)*26)[...,None]*np.array([1,.95,.8])
belly+=(fine-.5)[...,None]*8
fold=np.sin(y*270+x*9+np.sin(x*25)*2)*.5+.5
save_maps('belly',belly,.2*pores+.11*fold,.65+grain*.23)

# Tissue mottling and a delicate branching vascular network, deliberately subtle.
vessels=Image.new('RGBA',(S,S)); draw=ImageDraw.Draw(vessels)
for i in range(18):
    px,py=rng.uniform(0,S,2)
    points=[]
    for j in range(12):
        px+=rng.uniform(-25,35); py+=rng.uniform(14,40)
        points.append((px,py))
    draw.line(points,fill=(111,58,60,55),width=int(rng.integers(1,4)))
    for k in [3,6,9]:
        bx,by=points[k]
        branch=[(bx,by),(bx+35,by+10),(bx+53,by+36),(bx+74,by+43)]
        draw.line(branch,fill=(115,61,63,32),width=2)
tissue=np.array([220,192,178])+((cloud-.5)*30+(fine-.5)*5)[...,None]
ti=Image.fromarray(np.uint8(np.clip(tissue,0,255))).convert('RGBA')
ti.alpha_composite(vessels)
save_maps('tissue',np.asarray(ti)[:,:,:3],.22*grain+.09*pores,.45+.33*grain)

fiber=(np.sin(x*1900+np.sin(y*35)*7+np.sin(x*27)*3)*.5+.5)
muscle=np.array([165,87,82])+((cloud-.5)*30+fiber*12)[...,None]*np.array([1,.8,.65])
save_maps('muscle',muscle,.18*fiber+.1*pores,.5+.2*grain)

# Radial golden iris with an elliptical pupil and a pigmented limbal ring.
N=1024
iy,ix=np.mgrid[:N,:N].astype(np.float32)/(N-1)*2-1
r=np.sqrt(ix*ix+iy*iy); theta=np.arctan2(iy,ix)
striations=(np.sin(theta*137+r*14)+np.sin(theta*293-r*27))*.5
flecks=rng.random((N,N))
iris=np.array([164,120,39])+(striations*23+flecks*28)[...,None]*np.array([1,.9,.45])
ring=np.clip((r-.85)/.1,0,1)
iris=iris*(1-ring[...,None])+np.array([28,36,20])*ring[...,None]
pupil=np.clip((1-(ix/.56)**2-(iy/.27)**2)*25,0,1)
iris=iris*(1-pupil[...,None])+np.array([8,12,10])*pupil[...,None]
Image.fromarray(np.uint8(np.clip(iris,0,255))).save(OUT/'iris-color.webp',quality=97,method=6)
print('Saved authored 2K frog material maps and golden iris.')
