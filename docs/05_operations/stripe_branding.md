# Stripe branding

Stripe-facing surfaces (Checkout, the customer portal, receipts and invoice
emails Stripe sends) take their logo, icon and colours from the **Stripe
Dashboard**, not from this codebase. When the brand artwork changes (last:
ADR-033, the m monogram), someone with Dashboard access must re-upload it.

## Where

Stripe Dashboard → **Settings → Business → Branding** (applies to Checkout,
payment links and the customer portal; receipts use the same assets).
Do it in both **test** and **live** mode — branding does not copy over.

## What to upload

| Field | Value |
|---|---|
| Icon | `static/icons/icon-512x512.png` (square, ink `#1B2A44` with the paper m) |
| Logo | `static/brand/wordmark.png` (the "Mise en place" wordmark, ink on white) |
| Brand color | `#1B2A44` (ink — matches `manifest.webmanifest` `theme_color`) |
| Accent color | `#1B2A44` (the accent *is* the ink, ADR-028) |

Stripe prefers the icon on Checkout's header; the logo appears on receipts
and the customer portal. Both files are generated artefacts: the icon comes
from `node scripts/generate-pwa-icons.mjs`, the wordmark from the Logo
component's wordmark treatment (ADR-033) rendered with Mona Sans 600.

## Product naming

The Stripe **Products** (Starter/Pro price IDs in `DEPLOYMENT.md`) carry
their own display names and statement descriptors in the Dashboard — check
they still read "Mise en Place" after any rebrand.
