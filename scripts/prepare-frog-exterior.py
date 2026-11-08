"""Reference-guided copper frog exterior, authored without baking in lighting.

2K part-local XZ color atlas, 1K tileable surface detail. Python/Pillow/NumPy.
The image reference guides the palette and markings, not an anatomical identity.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'public/textures/frog'
rng = np.random.default_rng(810178)
S = 2048
y, x = np.mgrid[:S, :S].astype(np.float32) / (S - 1)
px, pz = x * .22 - .11, .11 - y * .20

def noise(n):
    a = rng.random((n, n)).astype(np.float32)
    xx, yy = x*n, y*n
    ix, iy = xx.astype(int) % n, yy.astype(int) % n
    fx, fy = xx-np.floor(xx), yy-np.floor(yy)
    fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy)
    return ((a[iy, ix]*(1-fx)+a[iy, (ix+1)%n]*fx)*(1-fy)
            +(a[(iy+1)%n, ix]*(1-fx)+a[(iy+1)%n, (ix+1)%n]*fx)*fy)

def blend(base, color, mask):
    return base*(1-mask[..., None])+np.array(color)*mask[..., None]

def spot(cx, cz, rx, rz):
    return np.exp(-((px-cx)/rx)**2-((pz-cz)/rz)**2)

cloud, grain, fine = noise(23), noise(160), noise(550)
warp = noise(67)
color = np.zeros((S, S, 3), dtype=np.float32) + [175, 63, 23]
color = blend(color, [201, 94, 37], np.clip((cloud-.2)*1.1, 0, .8))
color += ((grain-.5)*20+(fine-.5)*12)[..., None]*[1, .86, .7]

# Golden-yellow lateral patches have irregular edges, with a warmer central belly.
gold = np.zeros_like(x)
for side in [-1, 1]:
    gold += spot(side*.022, .025, .010, .018)*1.1
    gold += spot(side*.027, .004, .007, .022)*.32
    gold += spot(side*.043, .045, .018, .006)*.15
gold = np.clip((gold + (warp-.5)*.25 - .18)*1.6, 0, .94)
color = blend(color, [201, 177, 42], gold)

# Broken chestnut patches along the abdominal midline, plus a pigmented throat.
marks = np.zeros_like(x)
for cx, cz, rx, rz in [(-.007,-.008,.004,.012),(.008,.005,.0045,.013),
                       (-.002,.023,.002,.012),(.003,-.028,.0025,.008),
                       (-.01,-.047,.011,.005),(.012,-.047,.009,.006)]:
    marks += spot(cx,cz,rx,rz)
marks = np.clip((marks + (warp-.5)*.7 - .22)*1.7, 0, .85)
color = blend(color, [92, 32, 18], marks)
freckles = np.clip((noise(115)-.64)*4, 0, .5)
color = blend(color, [100, 39, 22], freckles*.6)
speckles = np.clip((noise(310)-.57)*3.5, 0, .7)
color = blend(color, [222, 161, 92], speckles*.24)

# Membranes sit between orange digits; their tendons remain lighter and raised.
web = Image.new('L', (S, S)); draw = ImageDraw.Draw(web)
def pixel(xz):
    xx, zz = xz
    return ((xx+.11)/.22*S, (.11-zz)/.20*S)
lengths=[.012,.018,.026,.029,.021]
for side in [-1,1]:
    base=(side*.081,.054)
    tips=[(side*(.081+(i-2)*.0067), .055+lengths[i]) for i in range(5)]
    for a,b in zip(tips,tips[1:]):
        # Inset the membrane so pigment doesn't swallow the finger edges.
        points=[base, ((a[0]+base[0])*.5,(a[1]+base[1])*.5),
                ((b[0]+base[0])*.5,(b[1]+base[1])*.5)]
        draw.polygon([pixel(p) for p in points],fill=210)
web = np.asarray(web.filter(ImageFilter.GaussianBlur(5)),dtype=np.float32)/255
color = blend(color,[82,57,48],web*(.8+.2*cloud))
# Tendon streaks follow the long axis of each folded leg rather than a UV seam.
streak = Image.new('L',(S,S)); draw=ImageDraw.Draw(streak)
for side in [-1,1]:
    for points in [[(.026,.031),(.039,.042),(.049,.05)],
                   [(.055,.05),(.065,.038),(.071,.028)]]:
        draw.line([pixel((side*a,b)) for a,b in points],fill=140,width=13)
streak = np.asarray(streak.filter(ImageFilter.GaussianBlur(6)),dtype=np.float32)/255
color = blend(color,[221,148,73],streak*.7)
Image.fromarray(np.uint8(np.clip(color,0,255))).save(
    OUT/'exterior-color.webp',quality=96,method=6)

# Jittered gland cells and broken wrinkles: linear RGB holds mottling, height,
# and a reserved (zero) vessel channel. No baked highlights or transparent pixels.
S=1024
y,x=np.mgrid[:S,:S].astype(np.float32)/S
n=52
seeds=rng.uniform(.16,.84,(n,n,2)).astype(np.float32)
xx,yy=x*n,y*n
ix,iy=xx.astype(int),yy.astype(int)
nearest=np.full_like(x,10)
for ox in [-1,0,1]:
    for oy in [-1,0,1]:
        seed=seeds[(iy+oy)%n,(ix+ox)%n]
        d=(ix+ox+seed[...,0]-xx)**2+(iy+oy+seed[...,1]-yy)**2
        nearest=np.minimum(nearest,d)
pebbles=np.exp(-nearest*6)
wrinkle=(.5+.5*np.sin(2*np.pi*(x*22+noise(11)*2.2)))**10
height=.38+pebbles*.34+(noise(210)-.5)*.1-wrinkle*.08
packed=np.stack([.6*noise(18)+.4*pebbles,height,np.zeros_like(x)],axis=-1)
Image.fromarray(np.uint8(np.clip(packed,0,1)*255)).save(OUT/'exterior-detail.png',optimize=True)
print('Saved 2048px exterior color atlas and 1024px skin micro-detail.')
