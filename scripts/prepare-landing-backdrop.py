"""Prepare the supplied glass-panel artwork for the separate live GLB hero."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'design/frog-landing-reference.png').convert('RGB')
w, h = source.size
source.save(ROOT / 'public/art/frog-landing-poster.webp', quality=93, method=6)
# Rebuild only the open studio behind the photographed frog. Preserve the
# supplied cards, the ceiling lights, and the side reflections as image pixels.
anchors = [(0, (135, 181, 244)), (330, (172, 213, 250)),
           (400, (197, 226, 253)), (510, (207, 231, 254)),
           (580, (214, 235, 255)), (650, (190, 217, 251)),
           (730, (174, 207, 252)), (830, (166, 201, 248)),
           (941, (158, 195, 247))]
y = np.arange(h)
rows = np.array([np.interp(y, [a[0] for a in anchors],
                         [a[1][c] for a in anchors]) for c in range(3)]).T
plate = np.broadcast_to(rows[:, None, :], (h, w, 3)).copy()
x = np.linspace(-1, 1, w)
plate += np.exp(-((x - .12) / .42) ** 2)[None, :, None] * np.array([1.8, 2., 0.])
plate = Image.fromarray(np.uint8(np.clip(plate, 0, 255)))
mask = Image.new('L', (w, h))
draw = ImageDraw.Draw(mask)
draw.polygon([(704, 352), (860, 354), (1042, 425), (1090, 536),
              (1154, 550), (1168, 625), (1140, 716), (1045, 750),
              (795, 748), (637, 675), (632, 599), (693, 570),
              (745, 500), (712, 443)], fill=255)
draw.polygon([(668, 680), (1130, 680), (1160, 790), (1100, 941),
              (704, 941), (650, 808)], fill=255)
mask = mask.filter(ImageFilter.MaxFilter(45)).filter(ImageFilter.GaussianBlur(12))
# Keep the third card's edge intact beside the frog's former snout.
limit = np.array(mask)
limit[:550, :690] = 0
mask = Image.fromarray(limit)
Image.composite(plate, source, mask).save(
    ROOT / 'public/art/landing-frog-background.webp', quality=93, method=6)
