"""Extract a reusable blue backdrop from the supplied reference.

Conventional masked retouching, not generative image output. Original exposed
floor pixels are retained; hidden regions are filled from the surrounding blue
surface. Baked subjects, cards and instruments are removed so live 3D objects
can move without revealing duplicate specimens. Requires Pillow and NumPy.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT/'design/reference.png').convert('RGB')
w,h = source.size
mask = Image.new('L', source.size)
d = ImageDraw.Draw(mask)
# Cards and their soft floor reflections, including the connecting annotation lines.
for quad in [
 [(36,143),(248,157),(256,499),(44,467)],
 [(248,170),(443,199),(448,549),(250,510)],
 [(434,156),(635,190),(642,553),(437,507)],
 [(1106,130),(1380,171),(1379,541),(1104,489)],
 [(1376,173),(1661,211),(1663,595),(1372,547)],
]: d.polygon(quad,fill=255)
d.polygon([(0,464),(280,498),(455,539),(623,503),(665,601),(506,729),(0,632)],fill=255)
d.polygon([(1091,487),(1655,563),(1672,679),(1250,700),(1072,568)],fill=255)
# Central onion, original platform, their cast shadow and foreground reflection.
d.polygon([(610,609),(607,388),(677,246),(683,118),(784,111),(824,176),(944,187),(1059,268),(1110,399),(1107,559),(1038,631)], fill=255)
d.polygon([(425,552),(797,407),(1124,477),(1296,559),(1294,699),(1189,764),(879,864),(435,704)], fill=255)
d.polygon([(529,683),(1207,723),(1168,905),(689,940),(497,825)], fill=255)
# Static instruments and illustrated toolbar.
d.polygon([(1254,645),(1556,621),(1643,710),(1653,799),(1387,888),(1231,878)],fill=255)
d.rounded_rectangle((40,758,422,868),radius=48,fill=255)
# Fine connectors to the removed cards.
for line in [[(616,242),(676,257),(733,323)],[(984,308),(1070,198),(1126,216)],[(512,490),(511,552),(634,516)],[(1216,486),(1220,541),(1151,566)]]:
 d.line(line,fill=255,width=20)
mask = mask.filter(ImageFilter.MaxFilter(23))
# Weighted multiscale diffusion uses only unmasked pixels, avoiding copied objects.
# Work on a reduced image for the low-frequency fill; retain the source at full size.
small = (418,235)
rgb = np.asarray(source.resize(small,Image.Resampling.LANCZOS),dtype=np.float32)
known = 1 - np.asarray(mask.resize(small,Image.Resampling.BILINEAR),dtype=np.float32)/255
fill = np.zeros_like(rgb); assigned=np.zeros(known.shape,dtype=bool)
def blur(a,r):
 return np.asarray(Image.fromarray(np.uint8(np.clip(a,0,255))).filter(ImageFilter.GaussianBlur(r)),dtype=np.float32)
for radius in [8,16,32,64,128]:
 weight=blur(known*255,radius)/255
 good=(weight>.045)&(~assigned)
 for c in range(3):
  avg=blur(rgb[:,:,c]*known,radius)/np.maximum(weight,.001)
  fill[:,:,c][good]=avg[good]
 assigned|=good
fill[~assigned]=[222,238,254]
plate=Image.fromarray(np.uint8(np.clip(fill,0,255))).filter(ImageFilter.GaussianBlur(5)).resize(source.size,Image.Resampling.BICUBIC)
soft=mask.filter(ImageFilter.GaussianBlur(8))
clean=Image.composite(plate,source,soft)
# Continue the original perspective grid across the areas formerly hidden by objects.
grid=Image.new('RGBA',source.size); gd=ImageDraw.Draw(grid)
for a,b in [((-100,560),(1000,1000)),((-100,295),(1672,970)),((-100,28),(1672,700)),((360,-100),(1672,393)),((-130,767),(1780,190)),((370,1000),(1780,569)),((-100,466),(1500,-20))]:
 gd.line([a,b],fill=(104,166,230,44),width=2)
grid=grid.filter(ImageFilter.GaussianBlur(.65))
# Draw the reconstructed segments only within retouched regions.
alpha=np.asarray(grid.getchannel('A'),dtype=np.float32)*np.asarray(soft,dtype=np.float32)/255
grid.putalpha(Image.fromarray(np.uint8(alpha)))
clean=Image.alpha_composite(clean.convert('RGBA'),grid).convert('RGB')
(ROOT/'public/art').mkdir(exist_ok=True)
clean.save(ROOT/'public/art/lab-reference-background.webp',quality=97)
mask.save(ROOT/'output/background-retouch-mask.png')
print('Saved original-reference backdrop:',clean.size)
