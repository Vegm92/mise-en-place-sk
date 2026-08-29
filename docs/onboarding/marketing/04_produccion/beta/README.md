# Guía de registro para beta testers (código MISE50)

- `guia-beta-mise-en-place.pdf` — PDF de una página listo para compartir con beta testers: pasos de registro en https://mise-place.com/signup y uso del código promocional **MISE50** en el checkout de Stripe (Ajustes → Suscripción).
- `make_beta_pdf.py` — script generador (Python + reportlab). Para regenerar tras cambiar textos o el código:

```bash
pip install reportlab
python3 make_beta_pdf.py
```

Nota: `MISE50` debe existir como *promotion code* activo en Stripe; el checkout ya lo permite (`allow_promotion_codes: true` en `src/lib/server/billing.ts`).
