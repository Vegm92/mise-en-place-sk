"""Scan / photocopy degradations using augraphy + Pillow."""

from __future__ import annotations
import random
import math
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from synth.degradation.pipeline import Degradation

try:
    import augraphy
    _AUGRAPHY = True
except ImportError:
    _AUGRAPHY = False


def _pil_to_np(img: Image.Image) -> np.ndarray:
    return np.array(img.convert("RGB"))


def _np_to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(arr.astype(np.uint8), "RGB")


class RotateSmall(Degradation):
    name = "rotate_small"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        angle = rng.uniform(-4, 4)
        return img.rotate(angle, expand=True, fillcolor=(255, 255, 255))


class Rotate90(Degradation):
    name = "rotate_90"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        return img.rotate(90, expand=True)


class Rotate180(Degradation):
    name = "rotate_180"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        return img.rotate(180, expand=True)


class LowContrast(Degradation):
    name = "low_contrast"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        factor = rng.uniform(0.45, 0.65)
        img = ImageEnhance.Contrast(img).enhance(factor)
        return ImageEnhance.Brightness(img).enhance(rng.uniform(1.1, 1.4))


class OverExposed(Degradation):
    name = "over_exposed"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        arr = _pil_to_np(img)
        h = arr.shape[0]
        cutoff = h // rng.randint(2, 4)
        arr[:cutoff] = np.clip(arr[:cutoff].astype(np.int32) + 120, 0, 255).astype(np.uint8)
        return _np_to_pil(arr)


class JpegArtifactsLow(Degradation):
    name = "jpeg_artifacts_low"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        import io
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=30)
        buf.seek(0)
        return Image.open(buf).copy()


class JpegArtifactsExtreme(Degradation):
    name = "jpeg_artifacts_extreme"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        import io
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=12)
        buf.seek(0)
        return Image.open(buf).copy()


class BinarisedAggressive(Degradation):
    name = "binarised_aggressive"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        threshold = rng.randint(100, 160)
        gray = img.convert("L")
        bw = gray.point(lambda x: 255 if x > threshold else 0, "1")
        return bw.convert("RGB")


class MotionBlur(Degradation):
    name = "motion_blur"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        return img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(1.5, 3.0)))


class InkBleedDeg(Degradation):
    name = "ink_bleed"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        if not _AUGRAPHY:
            return img
        aug = augraphy.InkBleed(
            intensity_range=(0.3, 0.7),
            kernel_size=rng.choice([(7, 7), (9, 9)]),
            severity=(0.3, 0.5),
        )
        arr = _pil_to_np(img)
        result = aug(arr)
        return _np_to_pil(result)


class BleedThroughDeg(Degradation):
    name = "bleed_through"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        if not _AUGRAPHY:
            return img
        arr = _pil_to_np(img)
        aug = augraphy.BleedThrough(
            intensity_range=(0.05, 0.2),
            color_range=(32, 224),
            ksize=(17, 17),
            sigmaX=rng.uniform(1, 3),
        )
        return _np_to_pil(aug(arr))


class WrinkleDeg(Degradation):
    name = "wrinkle"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        if not _AUGRAPHY:
            return img
        arr = _pil_to_np(img)
        aug = augraphy.Folding(fold_count=rng.randint(1, 3), fold_noise=0.1)
        return _np_to_pil(aug(arr))


class DirtyDrumDeg(Degradation):
    name = "dirty_drum"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        if not _AUGRAPHY:
            return img
        arr = _pil_to_np(img)
        aug = augraphy.DirtyDrum(
            line_width_range=(1, 4),
            line_concentration=rng.uniform(0.05, 0.15),
            direction=0,
            noise_intensity=0.5,
            noise_value=(0, 30),
            ksize=(3, 3),
        )
        return _np_to_pil(aug(arr))


class LightingGradientDeg(Degradation):
    name = "lighting_gradient"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        if not _AUGRAPHY:
            return img
        arr = _pil_to_np(img)
        aug = augraphy.LightingGradient(
            light_position=None,
            direction=rng.randint(0, 360),
            max_brightness=255,
            min_brightness=0,
            mode="gaussian",
            linear_decay_rate=rng.uniform(0.2, 0.5),
        )
        return _np_to_pil(aug(arr))


class VignetteDeg(Degradation):
    name = "vignette"
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        arr = _pil_to_np(img).astype(np.float32)
        h, w = arr.shape[:2]
        cx, cy = w / 2, h / 2
        Y, X = np.ogrid[:h, :w]
        dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
        max_dist = np.sqrt(cx**2 + cy**2)
        strength = rng.uniform(0.4, 0.7)
        mask = 1 - strength * (dist / max_dist) ** 2
        mask = np.clip(mask, 0, 1)[:, :, np.newaxis]
        arr = arr * mask
        return _np_to_pil(np.clip(arr, 0, 255).astype(np.uint8))


# Registry for lookup by name
ALL_SCAN_DEGRADATIONS: dict[str, type[Degradation]] = {
    cls.name: cls for cls in [
        RotateSmall, Rotate90, Rotate180, LowContrast, OverExposed,
        JpegArtifactsLow, JpegArtifactsExtreme, BinarisedAggressive,
        MotionBlur, InkBleedDeg, BleedThroughDeg, WrinkleDeg,
        DirtyDrumDeg, LightingGradientDeg, VignetteDeg,
    ]
}
