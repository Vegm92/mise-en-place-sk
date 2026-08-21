# TDD — High Priority Billing & Architecture Risks

> Technical Design Document
>
> Scope: High-priority findings identified in PR #585.
>
> This document defines the expected behaviour, invariants, failure modes and validation strategy. It does not prescribe implementation details.

---

# 1. Stripe Subscription Ownership & Reconciliation

## Problem

The reconciliation flow can fall back to the most recent Stripe subscription when the expected subscription cannot be identified.

This is unsafe when a Stripe Customer has multiple subscriptions.

## Goal

Reconciliation must never silently associate a restaurant/user with an unrelated Stripe subscription.

## Invariants

- A local subscription must have an unambiguous Stripe identity.
- `customerId` alone is insufficient to identify the correct subscription.
- A fallback must never select a subscription solely because it is the most recent one.
- Ambiguous ownership must result in a safe unresolved state, not an arbitrary association.
- Reconciliation must be idempotent.

## Expected behaviour

### Known subscription

```text
Local subscription
    ↓
stripeSubscriptionId exists
    ↓
Retrieve Stripe subscription
    ↓
Identity matches expected customer/metadata
    ↓
Synchronize state
