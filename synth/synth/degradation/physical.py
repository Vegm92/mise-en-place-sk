"""Physical damage: coffee stains, staple holes, partial cuts."""

from __future__ import annotations
import random
import math
import numpy as np
from PIL import Image, ImageDraw
from synth.degradation.pipeline import Degradation


class CoffeeStain(Degradation):
    name = "coffee_stain"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        overlay = img.convert("RGBA").copy()
        w, h = img.size
        draw = ImageDraw.Draw(overlay)
        n = rng.randint(1, 3)
        for _ in range(n):
            cx = rng.randint(0, w)
            cy = rng.randint(0, h)
            r = rng.randint(20, 80)
            alpha = rng.randint(40, 90)
            color = (rng.randint(120, 160), rng.randint(80, 110), rng.randint(40, 70), alpha)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.paste(overlay, mask=overlay.split()[3])
        return bg.convert("RGB")


class StapleHoles(Degradation):
    name = "staple_holes"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        overlay = img.convert("RGBA").copy()
        draw = ImageDraw.Draw(overlay)
        w, h = img.size
        x = rng.randint(10, 30)
        for i in range(2):
            y = rng.randint(15, 40) + i * rng.randint(10, 20)
            r = rng.randint(3, 6)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=(10, 10, 10, 220))
        return overlay.convert("RGB")


class PartialCutBottom(Degradation):
    name = "partial_cut_bottom"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        w, h = img.size
        cut_pct = rng.uniform(0.10, 0.20)
        new_h = int(h * (1 - cut_pct))
        return img.crop((0, 0, w, new_h))


class PartialCutRight(Degradation):
    name = "partial_cut_right"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        w, h = img.size
        cut_pct = rng.uniform(0.08, 0.15)
        new_w = int(w * (1 - cut_pct))
        return img.crop((0, 0, new_w, h))


ALL_PHYSICAL_DEGRADATIONS: dict[str, type[Degradation]] = {
    cls.name: cls for cls in [CoffeeStain, StapleHoles, PartialCutBottom, PartialCutRight]
}
