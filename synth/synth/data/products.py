"""Spanish restaurant food product pool, organised by IVA rate.

Each entry: (description, canonical_unit, price_range_per_unit)
IVA rates: 4% basic staples, 10% most food, 21% alcohol/cleaning
"""

from __future__ import annotations
import random
from synth.data.units import random_unit

# (description, canonical_unit, min_price, max_price)
IVA_4_BASIC: list[tuple] = [
    ("Pan de molde blanco", "ud", 1.20, 2.50),
    ("Harina de trigo T-55", "kg", 0.45, 0.90),
    ("Harina de fuerza", "kg", 0.55, 1.10),
    ("Leche entera UHT", "L", 0.70, 1.10),
    ("Huevos camperos L", "docena", 2.80, 4.20),
    ("Aceite de girasol refinado", "garrafa", 8.50, 14.00),
    ("Azúcar blanquilla", "kg", 0.70, 1.30),
    ("Arroz redondo", "kg", 0.85, 1.60),
    ("Pasta espagueti seca", "kg", 1.10, 2.20),
    ("Pan payés artesano", "ud", 2.50, 4.00),
    ("Mantequilla sin sal", "kg", 6.50, 9.00),
    ("Queso fresco", "kg", 4.00, 7.00),
]

IVA_10_RESTAURANT: list[tuple] = [
    ("Aceite de oliva virgen extra Picual 5L", "garrafa", 28.00, 45.00),
    ("Aceite de oliva virgen extra arbequina 5L", "garrafa", 30.00, 48.00),
    ("Tomate cherry rama", "kg", 1.80, 3.50),
    ("Tomate pera kg", "kg", 0.90, 2.00),
    ("Lechuga romana", "ud", 0.70, 1.40),
    ("Espinacas baby bolsa 500g", "ud", 2.20, 3.80),
    ("Cebolla blanca", "kg", 0.55, 1.20),
    ("Ajo morado", "kg", 3.50, 6.00),
    ("Pimiento rojo", "kg", 1.20, 2.80),
    ("Berenjena", "kg", 1.00, 2.20),
    ("Calabacín", "kg", 0.80, 1.80),
    ("Patata agria", "kg", 0.45, 1.00),
    ("Zanahoria", "kg", 0.50, 1.10),
    ("Lomo de cerdo ibérico", "kg", 12.00, 18.00),
    ("Pechuga de pollo", "kg", 4.50, 7.50),
    ("Muslo de pollo", "kg", 2.80, 4.50),
    ("Ternera picada", "kg", 7.00, 11.00),
    ("Solomillo de cerdo", "kg", 9.00, 15.00),
    ("Bacalao desalado", "kg", 8.00, 14.00),
    ("Merluza fileteada", "kg", 10.00, 18.00),
    ("Gambas peladas congeladas", "kg", 12.00, 22.00),
    ("Sepia limpia", "kg", 8.50, 14.00),
    ("Mejillones cocidos", "kg", 3.50, 6.00),
    ("Caldo de pollo brick 1L", "ud", 1.80, 3.00),
    ("Tomate triturado lata 800g", "ud", 1.10, 2.00),
    ("Garbanzos cocidos bote 400g", "ud", 1.20, 2.20),
    ("Aceitunas verdes sin hueso 1kg", "ud", 4.50, 7.00),
    ("Queso manchego curado", "kg", 12.00, 18.00),
    ("Jamón cocido loncheado", "kg", 7.50, 12.00),
    ("Chorizo extra", "kg", 6.00, 10.00),
    ("Nata para cocinar 35%", "L", 2.50, 4.00),
    ("Yogur natural sin azúcar", "ud", 0.40, 0.80),
    ("Mozzarella fresca", "kg", 8.00, 13.00),
    ("Parmesano rallado", "kg", 14.00, 22.00),
    ("Crema de leche vegetal", "L", 2.80, 4.50),
    ("Vinagre de vino blanco", "garrafa", 4.50, 8.00),
    ("Sal marina gruesa", "kg", 0.60, 1.20),
    ("Pimienta negra molida", "kg", 8.00, 14.00),
    ("Pimentón dulce", "kg", 5.50, 9.00),
    ("Orégano seco", "kg", 4.00, 8.00),
    ("Tomillo seco", "kg", 5.00, 9.00),
    ("Perejil fresco manojo", "ud", 0.60, 1.20),
    ("Albahaca fresca maceta", "ud", 1.50, 2.80),
    ("Limón kg", "kg", 0.90, 2.00),
    ("Naranja de zumo kg", "kg", 0.70, 1.50),
    ("Fresas", "kg", 2.50, 6.00),
    ("Plátanos", "kg", 0.90, 1.80),
    ("Manzana golden", "kg", 1.20, 2.50),
    ("Mantequilla clarificada", "kg", 9.00, 14.00),
    ("Chocolate negro 70% profesional", "kg", 12.00, 18.00),
    ("Azúcar glas", "kg", 1.20, 2.20),
    ("Levadura seca 500g", "ud", 4.00, 7.00),
]

IVA_21_GENERAL: list[tuple] = [
    ("Vino blanco Albariño bot. 750ml", "botella", 5.50, 9.00),
    ("Vino tinto Rioja crianza bot. 750ml", "botella", 6.00, 12.00),
    ("Cava brut nature bot. 750ml", "botella", 5.00, 10.00),
    ("Cerveza artesana bot. 33cl", "botella", 1.20, 2.50),
    ("Cerveza lager barril 30L", "ud", 55.00, 90.00),
    ("Ron añejo bot. 70cl", "botella", 14.00, 28.00),
    ("Gin premium bot. 70cl", "botella", 16.00, 35.00),
    ("Whisky blended bot. 70cl", "botella", 12.00, 22.00),
    ("Vermut rojo bot. 1L", "botella", 7.00, 14.00),
    ("Agua mineral sin gas 1.5L", "botella", 0.45, 0.90),
    ("Agua con gas 1L", "botella", 0.55, 1.10),
    ("Refresco cola lata 33cl pack 24", "pack", 8.00, 14.00),
    ("Zumo naranja brick 1L", "ud", 1.50, 2.80),
    ("Detergente lavavajillas profesional 5L", "garrafa", 12.00, 22.00),
    ("Desengrasante cocina 5L", "garrafa", 8.00, 16.00),
    ("Film transparente rollo", "ud", 8.00, 15.00),
    ("Papel albal rollo 300m", "ud", 12.00, 22.00),
    ("Servilletas 33×33 paquete 500", "pack", 6.00, 12.00),
    ("Bolsas basura 90L pack 25", "pack", 4.50, 8.00),
    ("Guantes nitrilo talla M caja 100", "caja", 7.00, 14.00),
    ("Café espresso mezcla 80/20 kg", "kg", 8.00, 16.00),
    ("Café descafeinado kg", "kg", 9.00, 18.00),
    ("Té verde bolsitas caja 100", "caja", 5.00, 10.00),
    ("Azúcar monodosis sobres caja 500", "caja", 8.00, 15.00),
]


def sample_basket(
    rng: random.Random,
    n: int = 8,
    category: str | None = None,
    mix_iva: bool = True,
) -> list[dict]:
    """
    Sample n products for a basket.
    Returns list of dicts with description, canonical_unit, unit_price, iva_rate.
    """
    if mix_iva:
        pool = IVA_4_BASIC + IVA_10_RESTAURANT + IVA_21_GENERAL
        rate_map = (
            {id(p): 0.04 for p in IVA_4_BASIC}
            | {id(p): 0.10 for p in IVA_10_RESTAURANT}
            | {id(p): 0.21 for p in IVA_21_GENERAL}
        )
    else:
        # Use supplier category to bias pool
        if category in ("bebidas_alcoholicas", "vinos", "cafe", "limpieza"):
            pool = IVA_21_GENERAL
            rate_map = {id(p): 0.21 for p in pool}
        elif category in ("panaderia",):
            pool = IVA_4_BASIC
            rate_map = {id(p): 0.04 for p in pool}
        else:
            pool = IVA_10_RESTAURANT
            rate_map = {id(p): 0.10 for p in pool}

    items = rng.sample(pool, min(n, len(pool)))
    result = []
    for item in items:
        desc, canon_unit, min_p, max_p = item
        unit_price = round(rng.uniform(min_p, max_p), 2)
        quantity = round(rng.choice([1, 2, 3, 4, 5, 6, 10, 12, 24, 0.5, 1.5]), 2)
        result.append({
            "description": desc,
            "unit": canon_unit,
            "unit_price": unit_price,
            "quantity": quantity,
            "total_price": round(unit_price * quantity, 2),
            "iva_rate": rate_map.get(id(item), 0.10),
        })
    return result
