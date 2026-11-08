"""Deterministic, tileable tissue detail; no reference/marketplace pixels copied.

1024px linear RGB: mottling, micro-height, capillary mask.
Sample in object space, not the procedural model's overlapping UV islands.
Run: python3 scripts/prepare-frog-detail.py (Pillow + NumPy).
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'public/textures/frog'
S = 1024
rng = np.random.default_rng(7319)
y, x = np.mgrid[:S, :S].astype(np.float32) / S

def noise(n):
    # Periodic bilinear value noise, including the last-to-first cell.
    a = rng.random((n, n)).astype(np.float32)
    xx, yy = x*n, y*n
    ix, iy = xx.astype(int), yy.astype(int)
    fx, fy = xx-ix, yy-iy
    fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy)
    return ((a[iy,ix]*(1-fx)+a[iy,(ix+1)%n]*fx)*(1-fy)
            +(a[(iy+1)%n,ix]*(1-fx)+a[(iy+1)%n,(ix+1)%n]*fx)*fy)

def vessels(count, length=(160,340), width=(3.2,4.8), depth=2):
    mask = Image.new('L', (S, S))
    draw = ImageDraw.Draw(mask)
    def branch(px, py, angle, length, width, depth):
        points = [(px, py)]
        for _ in range(12):
            angle += rng.normal(0, .12)
            px += np.cos(angle)*length/12
            py += np.sin(angle)*length/12
            points.append((px, py))
        # Wrap branches at tile edges so three-axis blending has no seams.
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                draw.line([(a+ox,b+oy) for a,b in points],
                          fill=int(170+depth*24), width=max(1,round(width)))
        if depth:
            for idx, sign in [(5,-1),(9,1)]:
                branch(*points[idx], angle+sign*rng.uniform(.45,.9),
                       length*.44, width*.58, depth-1)
    for _ in range(count):
        branch(*rng.uniform(0,S,2), rng.uniform(0,2*np.pi),
               rng.uniform(*length), rng.uniform(*width), depth)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(.55)),dtype=np.float32)/255

def cellular(n):
    # Periodic jittered cells: a texture of fine surface pits, not modeled alveoli.
    seeds = rng.uniform(.15,.85,(n,n,2)).astype(np.float32)
    xx, yy = x*n, y*n
    ix, iy = xx.astype(int), yy.astype(int)
    first = np.full_like(x, 10)
    second = np.full_like(x, 10)
    for ox in (-1,0,1):
        for oy in (-1,0,1):
            s = seeds[(iy+oy)%n,(ix+ox)%n]
            d = (ix+ox+s[...,0]-xx)**2 + (iy+oy+s[...,1]-yy)**2
            second = np.minimum(second,np.maximum(first,d))
            first = np.minimum(first,d)
    return np.sqrt(first), np.sqrt(second)-np.sqrt(first)

for name, count in [('skin',4),('organ',9),('membrane',18),('muscle',10),
                    ('lung',12),('liver',2),('digestive',3),('vascular',5)]:
    broad = .68*noise(7)+.32*noise(19)
    fine = noise(220)
    pores = np.clip((noise(110)-.53)*3,0,1)
    grain = noise(55)
    fiber = .5+.5*np.sin(2*np.pi*(x*145 + np.sin(y*2*np.pi)*.9))
    height = .48 + (grain-.5)*.13 + (fine-.5)*.16 - pores*.16
    if name == 'muscle':
        height += (fiber-.5)*.22
    elif name == 'membrane':
        # Fine cellular texture without large, mammalian-looking alveoli.
        height += (noise(83)-.5)*.15
    elif name == 'lung':
        pits, edge = cellular(68)
        cell = np.clip(pits*1.7,0,1)
        height = .6 - cell*.38 + (fine-.5)*.1
        broad = .48*broad + .52*(1-cell)
    elif name == 'liver':
        # Short, broken wrinkles underneath the wet surface instead of a smooth
        # varnish. Integer frequencies keep the tile periodic.
        # Break the direction and spacing so intersecting projections do not
        # read as a regular woven pattern across the liver lobes.
        warp = noise(13)
        folds = (.5+.5*np.sin(2*np.pi*(x*39+warp*2.4)))**8
        height = .5 + (grain-.5)*.12 + (fine-.5)*.05 - folds*(.04+.09*warp)
        broad = broad*.8 + grain*.2
    elif name == 'digestive':
        creases = (.5+.5*np.sin(2*np.pi*(y*27+.4*np.sin(x*2*np.pi*4))))**5
        height += (grain-.5)*.22 - creases*.16
        broad = broad*.7 + noise(29)*.3
    vessel_map = (vessels(count, length=(380,620), width=(5.5,8.5), depth=3)
                  if name == 'vascular' else vessels(count))
    # Opaque RGB avoids browser premultiplication discarding tissue data in
    # vessel-free pixels. Roughness variation is derived from the mottling.
    packed = np.stack([broad,height,vessel_map],axis=-1)
    Image.fromarray(np.uint8(np.clip(packed,0,1)*255)).save(
        OUT/f'{name}-detail.png', optimize=True)
    print(f'{name}-detail.png: {S} x {S}')
