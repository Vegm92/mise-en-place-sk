---
tags: [mep, product]
related: "[[CONTEXT]]"
---

# Personas

Derived from `docs/02_product/plan_de_negocio.md`, `docs/SPAIN_MARKET_RESEARCH.md` and the
implemented roles in the app. These describe who uses the product and what the
app must do for them; they are not the only lens for access control (roles in
code are `user_restaurants.role` = `owner`, plus admin via `AUTH_ADMIN_EMAIL`).

## Primary personas

### The restaurant owner-chef / manager (core persona)
- Runs one restaurant; wears buying, accounting and staffing hats.
- Needs: photo an albarán/invoice, know what was paid, spot silent price rises,
  not miss a due invoice, keep suppliers honest.
- App behavior targeted: WhatsApp ingestion (send invoice → review link), price
  shocks, reminders, budget warnings, weekly digest, dashboards.
- Plan: Starter/Pro. Single location.

### The group operator (multi-location)
- Runs several restaurants; wants one view across locations with per-location
  isolation.
- App behavior targeted: Business tier, `restaurants.parentId`, location
  switcher, unlimited quota.
- Plan: Business.

### The back-office admin (per restaurant)
- Shared access on the restaurant's account; sees invoices and data, cannot
  change billing/WhatsApp pairing (owner-only controls).

## Secondary personas

### The waiter / staff member who photographs invoices
- Sends photos over WhatsApp without any app.
- App behavior targeted: WhatsApp bot replies with `/batch/[id]` link, pairing
  code flow, 6-char code redeem from their phone.

### The product/ops operator (our team)
- Uses `/admin/*` to watch health, system events, revenue metrics, Sentry
  errors and the dead-letter queue.
- Gated by `AUTH_ADMIN_EMAIL`, not by product roles.

### The waitlist lead
- Lands on `/waitlist` (bilingual), captures email into the `waitlist` table.
- Not yet a user.

## Access model mapped to code

| Who | What they can do | Enforced by |
|---|---|---|
| Signed-in user | Any restaurant they hold a membership in (`user_restaurants`) | `hooks.server.ts` membership resolution |
| Member | Read/write business data of the active restaurant | `forTenant().scope()` |
| Owner (`role='owner'`) | Billing, WhatsApp pairing, settings, multi-location | role checks in `settings`, `whatsapp-pairing`, `billing` |
| Admin | `/admin/*` ops pages | `isAdminUser()` (`AUTH_ADMIN_EMAIL`) |

Every persona operates inside the tenant boundary — there is no cross-restaurant
data path (see `docs/00_system/architectural_invariants.md`).
