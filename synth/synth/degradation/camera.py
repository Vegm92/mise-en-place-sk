"""Phone camera simulation: perspective warp, blur, vignette."""

from __future__ import annotations
import random
import numpy as np
from PIL import Image, ImageFilter
from synth.degradation.pipeline import Degradation


class PerspectivePhone(Degradation):
    name = "perspective_phone"

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        w, h = img.size
        jitter = int(min(w, h) * rng.uniform(0.02, 0.08))

        def j() -> int:
            return rng.randint(-jitter, jitter)

        # Source corners, destination corners (slight perspective warp)
        src = [(0, 0), (w, 0), (w, h), (0, h)]
        dst = [(j(), j()), (w + j(), j()), (w + j(), h + j()), (j(), h + j())]

        # Compute 8-point perspective coefficients
        coeffs = _find_coeffs(dst, src)
        return img.transform(
            (w, h), Image.Transform.PERSPECTIVE, coeffs,
            resample=Image.Resampling.BICUBIC,
            fillcolor=(255, 255, 255),
        )


def _find_coeffs(pa: list, pb: list) -> list[float]:
    """Compute 8 perspective transform coefficients from 4 point pairs."""
    matrix = []
    for (x1, y1), (x2, y2) in zip(pa, pb):
        matrix += [
            [x2, y2, 1, 0, 0, 0, -x1 * x2, -x1 * y2],
            [0, 0, 0, x2, y2, 1, -y1 * x2, -y1 * y2],
        ]
    import numpy as np
    A = np.matrix(matrix, dtype=float)
    B = np.array([x1 for (x1, y1) in pa] + [y1 for (x1, y1) in pa], dtype=float)
    B = np.array([coord for (x, y) in pa for coord in (x, y)], dtype=float)
    res = np.linalg.solve(A, B)
    return np.array(res).flatten().tolist()


ALL_CAMERA_DEGRADATIONS: dict[str, type[Degradation]] = {
    "perspective_phone": PerspectivePhone,
}
