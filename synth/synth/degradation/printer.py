"""Thermal printer and carbonless paper degradations."""

from __future__ import annotations
import random
import numpy as np
from PIL import Image, ImageEnhance
from synth.degradation.pipeline import Degradation


class ThermalFade(Degradation):
    name = "thermal_fade"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        arr = np.array(img.convert("RGB"), dtype=np.float32)
        h = arr.shape[0]
        start = int(h * rng.uniform(0.4, 0.65))
        for row in range(start, h):
            fade = (row - start) / (h - start)
            arr[row] = arr[row] + (255 - arr[row]) * fade * rng.uniform(0.6, 0.9)
        return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


class ThermalBanding(Degradation):
    name = "thermal_banding"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        arr = np.array(img.convert("RGB"), dtype=np.float32)
        h = arr.shape[0]
        n_bands = rng.randint(3, 8)
        for _ in range(n_bands):
            row = rng.randint(0, h - 1)
            height = rng.randint(1, 4)
            arr[row:row + height] = 245
        return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


class CarbonlessTint(Degradation):
    name = "carbonless_tint"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        arr = np.array(img.convert("RGB"), dtype=np.float32)
        # Blue/violet tint typical of NCR paper
        strength = rng.uniform(0.05, 0.15)
        arr[:, :, 2] = np.clip(arr[:, :, 2] + 40 * strength, 0, 255)  # boost blue
        arr[:, :, 1] = np.clip(arr[:, :, 1] - 10 * strength, 0, 255)  # reduce green
        return Image.fromarray(arr.astype(np.uint8), "RGB")


ALL_PRINTER_DEGRADATIONS: dict[str, type[Degradation]] = {
    cls.name: cls for cls in [ThermalFade, ThermalBanding, CarbonlessTint]
}
