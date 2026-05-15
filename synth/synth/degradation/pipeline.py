"""Composable degradation pipeline for producing OCR-hostile documents."""

from __future__ import annotations
import random
from abc import ABC, abstractmethod
from PIL import Image


class Degradation(ABC):
    name: str = "base"

    @abstractmethod
    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        ...


class Pipeline:
    def __init__(self, degradations: list[Degradation]):
        self.degradations = degradations

    @property
    def tags(self) -> list[str]:
        return [d.name for d in self.degradations]

    def apply(self, img: Image.Image, rng: random.Random) -> Image.Image:
        result = img
        for deg in self.degradations:
            try:
                result = deg.apply(result, rng)
            except Exception:
                pass  # never let a degradation crash the whole generation
        return result
