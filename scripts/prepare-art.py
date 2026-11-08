"""Separate the user-supplied composition into scene and interface artwork.

This is conventional image compositing, not generated imagery. The editable
HTML interface replaces the reference's panels and toolbar.
Requires Pillow and NumPy only; the exported assets are committed.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public" / "art"
source = Image.open(ART / "reference.png").convert("RGB")
scene = source.copy()

cards = [
    ("outer", [(51, 156), (241, 174), (245, 488), (55, 456)], (190, 310), (10, 55, 184, 268)),
    ("first", [(258, 182), (430, 210), (435, 535), (261, 495)], (178, 325), (9, 65, 168, 275)),
    ("inner", [(448, 170), (620, 204), (623, 534), (451, 498)], (176, 333), (8, 64, 165, 280)),
    ("cells", [(1118, 144), (1365, 183), (1364, 526), (1118, 476)], (248, 340), (15, 54, 234, 284)),
    ("microscope", [(1388, 188), (1646, 225), (1646, 581), (1387, 535)], (260, 350), (26, 64, 235, 288)),
]

def remove_blue_background(image):
    rgb = np.asarray(image.convert("RGB"), dtype=float)
    selected = ((rgb[:, :, 0] > rgb[:, :, 1] * 1.035) &
                (rgb[:, :, 2] > rgb[:, :, 1] * 1.025))
    mask = Image.fromarray((selected * 255).astype("uint8"))
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    padded = Image.new("L", (mask.width + 2, mask.height + 2))
    padded.paste(mask, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    solid = np.asarray(padded)[1:-1, 1:-1]
    mask = Image.fromarray(np.where(solid == 128, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(.45))
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba

for name, quad, size, crop in cards:
    tl, tr, br, bl = quad
    flat = source.transform(size, Image.Transform.QUAD, tuple(tl + bl + br + tr), Image.Resampling.BICUBIC)
    image = flat.crop(crop)
    if name in ("outer", "first", "inner"):
        image = remove_blue_background(image)
    elif name == "microscope":
        image = image.resize((512, 512), Image.Resampling.LANCZOS).convert("RGBA")
        alpha = Image.new("L", image.size)
        ImageDraw.Draw(alpha).ellipse((1, 1, 511, 511), fill=255)
        image.putalpha(alpha.filter(ImageFilter.GaussianBlur(.7)))
    image.save(ART / f"{name}.png")

    # The cards cover these plates in the final interface. Preserve the original
    # connecting lines, floor reflections, central specimen and instruments.
    mask = Image.new("L", source.size)
    ImageDraw.Draw(mask).polygon(quad, fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(8))
    w, h = source.size
    top = np.array([225, 239, 254.0])
    bottom = np.array([217, 235, 254.0])
    blend = np.clip(np.arange(h)[:, None] / 850, 0, 1)
    row = top[None, :] * (1 - blend) + bottom[None, :] * blend
    plate = Image.fromarray(np.repeat(row[:, None, :], w, axis=1).astype("uint8"))
    scene = Image.composite(plate, scene, mask)

# Replace the illustrated toolbar with a real, keyboard-operable HTML toolbar.
mask = Image.new("L", source.size)
ImageDraw.Draw(mask).rounded_rectangle((42, 761, 419, 862), radius=48, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(9))
plate = Image.new("RGB", source.size, (218, 234, 253))
scene = Image.composite(plate, scene, mask)
scene.save(ART / "workspace.webp", quality=96)

# Inspection uses the supplied detail, not an unrelated stock specimen.
source.crop((623, 124, 1104, 646)).save(ART / "specimen.png")
print("Prepared scene, three isolated layer images, and two microscopy images.")
