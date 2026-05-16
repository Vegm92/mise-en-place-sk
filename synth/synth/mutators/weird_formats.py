"""Date, decimal, and currency format mutations — Spanish/i18n quirks."""

from __future__ import annotations
import random
from datetime import datetime


SPANISH_MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

DATE_STYLES = [
    "dmy_slash",       # 12/05/2026
    "dmy_dash",        # 12-05-2026
    "short_year",      # 12/05/26
    "long_spanish",    # 12 de mayo de 2026
    "iso",             # 2026-05-12 (default)
    "us_style",        # 05/12/2026 — ambiguous
]


def format_date(date_str: str | None, style: str) -> str:
    """Convert YYYY-MM-DD to the requested display style."""
    if not date_str:
        return ""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return date_str

    if style == "dmy_slash":
        return d.strftime("%d/%m/%Y")
    elif style == "dmy_dash":
        return d.strftime("%d-%m-%Y")
    elif style == "short_year":
        return d.strftime("%d/%m/%y")
    elif style == "long_spanish":
        return f"{d.day} de {SPANISH_MONTHS[d.month - 1]} de {d.year}"
    elif style == "us_style":
        return d.strftime("%m/%d/%Y")
    else:  # iso default
        return date_str


DECIMAL_STYLES = [
    "es_standard",   # 1.234,56 (Spanish standard)
    "en_style",      # 1,234.56 (English / wrong for Spain)
    "apostrophe",    # 1'234,56 (Catalan typewriter)
    "no_thousands",  # 1234,56
]

CURRENCY_STYLES = [
    "euro_before",   # € 1.234,56
    "euro_after",    # 1.234,56 €
    "eur_code",      # 1.234,56 EUR
    "no_symbol",     # 1.234,56
]


def format_money(amount: float, decimal_style: str = "es_standard", currency_style: str = "euro_after") -> str:
    """Format a monetary amount with the chosen decimal and currency style."""
    if amount is None:
        return ""
    abs_amt = abs(amount)
    sign = "-" if amount < 0 else ""

    # Thousands separator and decimal
    int_part = int(abs_amt)
    dec_part = round((abs_amt - int_part) * 100)

    if decimal_style == "es_standard":
        formatted = f"{int_part:,}".replace(",", ".") + f",{dec_part:02d}"
    elif decimal_style == "en_style":
        formatted = f"{int_part:,},{dec_part:02d}"  # deliberate wrong — comma as decimal
        formatted = f"{abs_amt:,.2f}"
    elif decimal_style == "apostrophe":
        formatted = f"{int_part:,}".replace(",", "'") + f",{dec_part:02d}"
    else:  # no_thousands
        formatted = f"{int_part},{dec_part:02d}"

    formatted = sign + formatted

    if currency_style == "euro_before":
        return f"€ {formatted}"
    elif currency_style == "euro_after":
        return f"{formatted} €"
    elif currency_style == "eur_code":
        return f"{formatted} EUR"
    else:  # no_symbol
        return formatted


MUTATOR_MAP = {
    "date_dmy_slash":    lambda style: ("dmy_slash",),
    "date_dmy_dash":     lambda style: ("dmy_dash",),
    "date_short_year":   lambda style: ("short_year",),
    "date_long_spanish": lambda style: ("long_spanish",),
    "date_us_style":     lambda style: ("us_style",),
    "decimal_en_style":  lambda style: ("en_style",),
    "decimal_apostrophe": lambda style: ("apostrophe",),
    "eur_symbol_missing": lambda style: ("no_symbol",),
}
