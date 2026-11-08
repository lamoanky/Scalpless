"""Derive the landing artwork from the supplied onion reference.

Preserves the reference's onion pixels. The blue plates combine its retouched
floor with defocused glassware and light, recreated from the landing mockup.
Requires Pillow and NumPy. Run from any directory.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/art'
source = Image.open(ROOT / 'design/reference.png').convert('RGB')
# Retouch annotation strokes by sampling along the nearby tissue fibers.
# A color-only key leaves the pale bloom of the cyan lines visible at hero scale.
rgb = np.asarray(source,dtype=np.float32)
for start,end,offset in [((688,274),(713,305),(8,-14)),
                         ((983,291),(1034,235),(13,12))]:
    repair_mask=Image.new('L',source.size)
    ImageDraw.Draw(repair_mask).line([start,end],fill=255,width=17)
    blend=np.asarray(repair_mask.filter(ImageFilter.GaussianBlur(2)),dtype=np.float32)[...,None]/255
    dx,dy=offset
    before=np.roll(rgb,(dy,dx),axis=(0,1))
    after=np.roll(rgb,(-dy,-dx),axis=(0,1))
    rgb=rgb*(1-blend)+(before+after)*.5*blend
source = Image.fromarray(np.uint8(np.clip(rgb,0,255)))

# A chroma matte keeps the fine, papery silhouette and roots. A loose hand mask
# excludes the neighboring cards and the purple contact shadow below the bulb.
boundary = [(715,128),(769,128),(781,154),(791,179),(821,195),
 (896,190),(957,210),(1007,249),(1052,299),(1081,353),(1093,414),
 (1084,479),(1061,530),(1031,559),(1025,577),(1040,595),(1013,611),
 (973,626),(932,620),(910,594),(852,596),(787,590),(728,580),
 (681,550),(646,501),(629,449),(628,398),(645,346),(671,296),
 (703,247),(715,219),(715,199),(697,212),(697,197),(714,175)]
mask = Image.new('L',source.size)
ImageDraw.Draw(mask).polygon(boundary,fill=255)
rgb = np.asarray(source,dtype=np.float32)
chroma = np.clip((rgb[:,:,0]-rgb[:,:,1]-1.5)/9,0,1)
alpha = np.asarray(mask,dtype=np.float32)/255*chroma
# Keep the interior completely opaque, including its cool near-white highlights.
core = Image.new('L',source.size)
ImageDraw.Draw(core).polygon([(731,152),(760,149),(772,185),(809,211),
 (894,206),(954,230),(1010,278),(1047,333),(1072,392),(1070,458),
 (1046,511),(1009,550),(971,579),(901,589),(829,584),(764,578),
 (713,553),(670,508),(647,459),(646,403),(668,340),(704,281),
 (729,233)],fill=255)
alpha = np.maximum(alpha,np.asarray(core,dtype=np.float32)/255)
yy,xx=np.mgrid[0:source.height,0:source.width]
shadow=(yy>580)&(rgb[:,:,0]-rgb[:,:,1]<28)&(rgb[:,:,2]>rgb[:,:,0]*.95)
alpha[shadow]=0
matte = Image.fromarray(np.uint8(alpha*255)).filter(ImageFilter.GaussianBlur(.4))
onion = source.convert('RGBA'); onion.putalpha(matte)
onion = onion.crop((625,125,1096,628))
# Lanczos resampling softens enlargement artifacts; it does not invent detail.
onion.resize((942,1006),Image.Resampling.LANCZOS).save(OUT/'landing-onion-reference.webp',quality=98,method=6)

# Three static plates recreate the landing reference's changing depth of field.
# Only their opacity changes in the browser; glassware adds no WebGL workload.
w,h=1920,1080
floor=Image.open(OUT/'lab-reference-background.webp').convert('RGB').resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(1.8))
floor=np.asarray(floor,dtype=np.float32)/255
y,x=np.mgrid[0:h,0:w]; x=x/w; y=y/h
t=np.clip(x,0,1)[...,None]
left=np.array([77,112,167])/255; right=np.array([176,204,246])/255
plate=left*(1-t)+right*t
plate=np.broadcast_to(plate,(h,w,3)).copy()

def smooth(a,b,value):
    v=np.clip((value-a)/(b-a),0,1)
    return v*v*(3-2*v)

# Preserve the source's perspective tile lines, with a cool lavender floor.
detail=floor-floor.mean(axis=(0,1),keepdims=True)
floor_color=(np.array([155,183,226])*(1-t)+np.array([206,226,253])*t)/255
floor_blend=smooth(.35,1,y)[...,None]*.79
plate=plate*(1-floor_blend)+floor_color*floor_blend
plate+=detail*smooth(.24,.88,y)[...,None]*.95
glow=np.exp(-((x-.54)/.28)**2-((y-.94)/.31)**2)*.13
glow+=np.exp(-((x-.8)/.24)**2-((y-.30)/.55)**2)*.055
plate+=glow[...,None]*np.array([.90,.94,1])
# Broad diagonal shafts of light, deliberately softer than the foreground.
streak=np.exp(-((x-(.24+y*.23))/.046)**2)*.085
streak+=np.exp(-((x-(.65+y*.13))/.052)**2)*.055
streak-=np.exp(-((x-(.13+y*.32))/.075)**2)*.025
plate+=streak[...,None]*np.array([.88,.92,1])

def image_from_rgb(pixels):
    return Image.fromarray(np.uint8(np.clip(pixels,0,1)*255)).convert('RGBA')

def defocus(layer,radius):
    # Blur premultiplied colors so transparent pixels do not create dark rims.
    return layer.convert('RGBa').filter(ImageFilter.GaussianBlur(radius)).convert('RGBA')

hero=image_from_rgb(plate)
hero.convert('RGB').save(OUT/'landing-reference-background.webp',quality=96,method=6)

def glass_vessel(cx,top,bottom,width,blur=9,opacity=1):
    """Defocused glass cylinder, with refracted edges, lip and floor reflection."""
    layer=Image.new('RGBA',(w,h))
    d=ImageDraw.Draw(layer)
    l,r=(cx-width/2)*w,(cx+width/2)*w
    t,b=top*h,bottom*h
    lip=width*h*.18
    # Thick glass edges produce dark refraction beside a white specular strip.
    for i in range(60):
        u=i/59
        inset=(r-l)*.047*u
        edge=int((1-u)**1.5*3*opacity)
        d.rounded_rectangle((l+inset,t+lip/2,r-inset,b),radius=lip,
                            outline=(58,105,173,edge),width=2)
    d.rectangle((l+8,t+lip/2,r-8,b-lip/2),fill=(207,228,255,int(18*opacity)))
    d.ellipse((l,t,r,t+lip*2),outline=(224,242,255,int(110*opacity)),width=6)
    d.arc((l,t+5,r,t+lip*2+5),0,180,fill=(90,132,192,int(45*opacity)),width=7)
    d.line([(l+9,t+lip),(l+9,b-lip)],fill=(74,116,178,int(65*opacity)),width=17)
    d.line([(l+21,t+lip),(l+21,b-lip)],fill=(218,240,255,int(92*opacity)),width=10)
    d.line([(r-12,t+lip),(r-12,b-lip)],fill=(245,252,255,int(250*opacity)),width=18)
    d.line([(r-25,t+lip),(r-25,b-lip)],fill=(111,155,212,int(90*opacity)),width=9)
    d.arc((l,b-lip*2,r,b),0,180,fill=(226,246,255,int(190*opacity)),width=12)
    # Long softbox highlights and faint measuring marks, not interface labels.
    d.rounded_rectangle((l+(r-l)*.17,t+lip*2,l+(r-l)*.23,b-lip),radius=7,
                        fill=(237,251,255,int(185*opacity)))
    d.rounded_rectangle((l+(r-l)*.23,b-(b-t)*.22,l+(r-l)*.30,b-lip/2),radius=8,
                        fill=(247,255,255,int(220*opacity)))
    for j in range(5):
        sy=t+(b-t)*(.32+j*.1)
        d.line([(cx*w,sy),(cx*w+width*w*(.12 if j%2 else .18),sy)],
               fill=(224,241,255,int(38*opacity)),width=3)
    # Flip and stretch only the vessel into the floor, fading toward the viewer.
    reflection=layer.crop((0,int(t),w,int(b))).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    rh=max(1,int((h-b)*1.3))
    reflection=reflection.resize((w,rh),Image.Resampling.BICUBIC)
    rgba=np.asarray(reflection).copy()
    rgba[:,:,3]=(rgba[:,:,3]*(np.linspace(.32,0,rh)**1.3)[:,None]).astype(np.uint8)
    floor_reflection=Image.new('RGBA',(w,h))
    floor_reflection.alpha_composite(Image.fromarray(rgba),(0,int(b)))
    floor_reflection=defocus(floor_reflection,blur*1.5)
    floor_reflection.alpha_composite(defocus(layer,blur))
    return floor_reflection

# A broad reflective wash moves the back wall into the laboratory floor.
lab_plate=plate.copy()
floor_light=smooth(.55,.91,y)*np.exp(-((x-.72)/.48)**2)*.095
lab_plate+=floor_light[...,None]*np.array([1,.94,1])
lab=image_from_rgb(lab_plate)
for spec in [(.49,.46,.82,.12,12,.65),(.39,.58,.84,.15,7,.83),
             (.96,.29,.85,.19,11,1),(.31,.67,.84,.065,7,.55)]:
    lab.alpha_composite(glass_vessel(*spec))
# Tiny floor light reflections help anchor the glass without creating a horizon.
lights=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(lights)
for cx,length,strength in [(.35,.16,55),(.47,.12,40),(.91,.21,70),(.985,.15,80)]:
    d.rounded_rectangle((int(cx*w),int(.82*h),int(cx*w+8),int((.82+length)*h)),
                        radius=4,fill=(239,248,255,strength))
lab.alpha_composite(defocus(lights,8))
lab.convert('RGB').save(OUT/'landing-lab-background.webp',quality=96,method=6)

collection=lab.copy()
rings=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(rings)
for pad,strength,weight in [(0,195,4),(.032,70,2),(-.014,50,2)]:
    d.ellipse(((.455-pad)*w,(.82-pad*.23)*h,(.965+pad)*w,(.94+pad*.23)*h),
              outline=(250,254,255,strength),width=weight)
collection.alpha_composite(defocus(rings,11))
collection.alpha_composite(defocus(rings,.7))

# Reuse the actual silver instruments in the supplied bench reference. A tight
# silhouette avoids importing the source's floor or cyan grid into this plate.
original=Image.open(ROOT/'design/reference.png').convert('RGBA')
tool_mask=Image.new('L',original.size); d=ImageDraw.Draw(tool_mask)
d.polygon([(1292,738),(1298,729),(1314,724),(1377,685),(1537,640),
 (1556,641),(1561,646),(1559,679),(1340,765),(1323,773),(1313,772),
 (1307,769),(1309,764),(1315,764),(1322,766),(1342,759),(1460,688),
 (1388,711),(1324,732),(1310,732),(1302,732),(1296,741)],fill=255)
d.polygon([(1261,843),(1277,835),(1324,814),(1325,810),(1330,812),
 (1368,799),(1368,794),(1374,787),(1432,770),(1607,727),(1620,731),
 (1626,740),(1625,750),(1621,757),(1426,810),(1403,814),(1360,826),
 (1358,830),(1289,847),(1263,847)],fill=255)
original.putalpha(tool_mask.filter(ImageFilter.GaussianBlur(.6)))
tools=original.crop((1255,635,1632,854))
# Match the reference's smaller instruments at the lower-right of the collection.
tools=tools.rotate(-9,Image.Resampling.BICUBIC,expand=True)
# Compress vertical perspective to put the instruments flat on the floor.
tools=tools.resize((int(.29*w),int(.17*h)),Image.Resampling.LANCZOS)
tx,ty=int(.68*w),int(.83*h)
shadow=Image.new('RGBA',tools.size,(64,89,149,0))
shadow.putalpha(tools.getchannel('A').point(lambda a:int(a*.20)))
shadow_layer=Image.new('RGBA',(w,h)); shadow_layer.alpha_composite(shadow,(tx+4,ty+13))
collection.alpha_composite(defocus(shadow_layer,9))
collection.alpha_composite(tools,(tx,ty))
collection.convert('RGB').save(OUT/'landing-collection-background.webp',quality=96,method=6)

checker=Image.new('RGBA',onion.size,'#8eafe0')
checker.alpha_composite(onion)
(ROOT/'output').mkdir(exist_ok=True)
checker.convert('RGB').save(ROOT/'output/landing-onion-matte.jpg',quality=95)
print('Saved reference onion, hero, glass laboratory and collection backdrops.')
