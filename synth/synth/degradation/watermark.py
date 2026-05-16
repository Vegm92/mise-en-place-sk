"""Watermark overlays: DUPLICADO, COPIA, ANULADO."""

from __future__ import annotations
import random
from PIL import Image, ImageDraw, ImageFont
from synth.degradation.pipeline import Degradation


class Watermark(Degradation):
    def __init__(self, text: str):
        self.text = text
        self.name = f"watermark_{text.lower()}"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        w, h = img.size
        font_size = max(60, w // 8)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()

        alpha = rng.randint(25, 50)
        color = (rng.randint(150, 200), 0, 0, alpha)
        bbox = draw.textbbox((0, 0), self.text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

        angle = rng.uniform(-40, -25)
        txt_img = Image.new("RGBA", (tw + 20, th + 20), (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_img)
        txt_draw.text((10, 10), self.text, font=font, fill=color)
        rotated = txt_img.rotate(angle, expand=True)

        # Tile across image
        rw, rh = rotated.size
        for x in range(-rw, w + rw, max(rw, 1)):
            for y in range(-rh, h + rh, max(rh, 1)):
                overlay.paste(rotated, (x, y), rotated)

        base = img.convert("RGBA")
        combined = Image.alpha_composite(base, overlay)
        return combined.convert("RGB")


class WatermarkDuplicado(Watermark):
    def __init__(self): super().__init__("DUPLICADO")

class WatermarkCopia(Watermark):
    def __init__(self): super().__init__("COPIA")

class WatermarkAnulado(Watermark):
    def __init__(self): super().__init__("ANULADO")


ALL_WATERMARK_DEGRADATIONS: dict[str, type] = {
    "watermark_duplicado": WatermarkDuplicado,
    "watermark_copia":     WatermarkCopia,
    "watermark_anulado":   WatermarkAnulado,
}
