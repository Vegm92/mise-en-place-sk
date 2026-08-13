# ADR-017 — Uploads Survive a Dead Connection via an IndexedDB Queue

**Status:** Active
**Feature:** Ingestion (PWA)
**Date:** 2026-08-09

## Context

The moment an invoice gets photographed is at the delivery door: a phone, one
hand, a supplier waiting, and whatever signal a walk-in refrigerator's
neighbourhood affords. That is the worst connectivity in the user's day and the
only moment the document is in their hand.

A failed upload there does not mean "try again in a second". It means the paper
goes in a pile and the app has lost the invoice — which is the app's entire job.

So the upload has to be durable **on the device**, before the network is
involved at all.

## Decision

**Failed and offline uploads are stored in IndexedDB and replayed
automatically.** The queue lives in `UploadPanel.svelte` (`mise-offline-queue`,
store `pending`), holding each file base64-encoded with its name, MIME type and
timestamp.

IndexedDB rather than the Cache API or `localStorage`: it is the only browser
store that takes multi-megabyte binary payloads and survives a tab close, an app
restart, and a phone reboot.

### Two entry points, one queue

- **Known offline** — `doUpload` checks `navigator.onLine` first and queues
  without attempting.
- **Failed while apparently online** — the `catch` re-checks `navigator.onLine`
  and queues if it has since gone false, otherwise surfaces a real error.

The second matters more than the first: `navigator.onLine` reports the network
interface, not reachability, so a phone associated to an access point with no
route reports `true`. The queue is populated from the *actual* failure, not just
the flag.

### Replay is automatic, on two triggers

The component's `$effect` replays on mount when the queue is non-empty and the
device is online, and registers a `window` `online` listener that replays on
reconnection. The user does nothing.

`retryOfflineUploads` walks the queue and **navigates away on the first
success**, taking the user to the batch review page for that upload. It does not
drain the queue silently in the background: the point is to get the user in front
of the document that just landed. Remaining items replay on the next mount.

On failure it stops, restores the "saved" banner, and leaves everything queued —
no per-item retry counters, no backoff, no partial-drain state to reason about.

### The queue is capped at three files

`OFFLINE_MAX = 3` rejects further queueing with an explicit message. Base64 in
IndexedDB costs ~1.33× the file size, phone storage quotas are opaque and
unforgiving, and a silent quota failure would lose the invoice — the exact
outcome this whole mechanism exists to prevent. A hard, visible limit beats an
invisible one.

### The service worker never caches pages or uploads

Workbox precaches JS, CSS, fonts and icons only — `globPatterns` covers
`**/*.{js,css,woff2}` and `icons/**/*.png`, with `navigateFallback: null`. Pages
are server-rendered and are **not** cached.

This is the deliberate boundary between the two mechanisms. The service worker
makes the shell load fast; the IndexedDB queue makes uploads durable. Caching
HTML would mean serving a restaurant stale spend figures, which is worse than a
slower load. `/api/*` uses `NetworkFirst` with a 10 s timeout and a 5-minute
expiry, so a cached API response is a brief bridge, never a source of truth.

Registration is manual (`injectRegister: null`, `registerPWA()` called from the
layout) to stay CSP-compatible, and `registerType: 'autoUpdate'` with a
`SKIP_WAITING` message means a new deploy activates on the next visit rather than
stranding users on old bundles.

## Consequences

- **The queue is per-browser and per-device.** Queued invoices are invisible to
  the server, absent from any other device, and unrecoverable if the user clears
  site data. They are pending work on that phone, nothing more.
- **Three files is a real limit** at a delivery-heavy moment. Raising it means
  facing the quota question honestly — storing `Blob`s directly instead of base64
  would cut the overhead by a third and is the first move if the cap needs to
  rise.
- **Replay uses the same `/api/upload` endpoint** as a live upload, so
  [ADR-016](./ADR-016-storage-driver-and-upload-validation.md)'s magic-byte and
  size validation applies identically. A file queued offline is not trusted more
  than one uploaded live.
- **A queued file that fails validation on replay** stays in the queue and retries
  on every reconnection, since the loop treats any failure as "still offline".
  There is no poison-message eviction; a permanently invalid file needs the user
  to clear site data.
- **Base64 round-tripping is done twice per file** (encode to queue, decode to
  replay) on the main thread. Noticeable on a low-end phone with a 5 MB photo,
  accepted for the simplicity of storing plain strings.
- **The queue lives inside one Svelte component.** It is not a store or a module,
  so nothing outside `UploadPanel` can see or influence it. That keeps the state
  machine local and readable; it also means a second upload surface would need
  the code extracted rather than duplicated.

## Related

- [ADR-016](./ADR-016-storage-driver-and-upload-validation.md) — what happens once the file lands
- [ADR-015](./ADR-015-batches-replace-single-file-sessions.md) — where replay navigates to
