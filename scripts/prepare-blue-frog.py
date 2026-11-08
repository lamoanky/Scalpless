"""Recolor the existing detailed exterior atlas; keep markings and grain aligned."""
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'public/textures/frog'
source = Image.open(root / 'exterior-color.webp').convert('HSV')
pixels = np.asarray(source).copy()
# Preserve the authored luminance/contrast and saturation variation. Orange
# mottling becomes cyan/azure mottling in exactly the same texel locations.
hue = pixels[:, :, 0].astype(np.float32) / 255
pixels[:, :, 0] = np.uint8(np.clip(.56 + (hue - .07) * .35, .54, .62) * 255)
pixels[:, :, 1] = np.uint8(np.clip(pixels[:, :, 1].astype(np.float32) * .85 + 20, 0, 230))
Image.frombytes('HSV', source.size, pixels.tobytes()).convert('RGB').save(root / 'exterior-blue-color.webp', quality=96, method=6)
print('Saved detailed blue exterior atlas with the original markings and resolution.')
