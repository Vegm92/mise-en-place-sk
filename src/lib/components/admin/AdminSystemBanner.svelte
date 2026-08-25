<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  type Status = 'ok' | 'warn' | 'error';
  type Chip = { label: string; value: string | number; status: Status; href?: string };

  let {
    status,
    checkedAt,
    chips = [],
    caption,
  }: {
    status: Status;
    checkedAt: string;
    chips?: Chip[];
    caption?: string;
  } = $props();

  const TONE: Record<Status, { fg: string; soft: string; ink: string }> = {
    ok:    { fg: 'var(--mep-pos)',  soft: 'var(--mep-pos-soft)',  ink: 'var(--mep-pos-fg)' },
    warn:  { fg: 'var(--mep-warn)', soft: 'var(--mep-warn-soft)', ink: 'var(--mep-warn-fg)' },
    error: { fg: 'var(--mep-neg)',  soft: 'var(--mep-neg-soft)',  ink: 'var(--mep-neg-fg)' },
  };

  const tone = $derived(TONE[status] ?? TONE.ok);
</script>

<div class="card" style="
  padding:18px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;
  background:{tone.soft};border-color:{tone.soft};
">
  <div style="display:flex;align-items:center;gap:14px;min-width:0;">
    <div style="
      width:40px;height:40px;border-radius:20px;flex-shrink:0;
      background:{tone.fg};color:{tone.ink};
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 0 0 5px {tone.soft};
    ">
      {#if status === 'ok'}<Check size={20} />{:else}<AlertTriangle size={18} />{/if}
    </div>
    <div style="min-width:0;">
      <div class="num" style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:{tone.fg};margin-bottom:2px;">
        {caption}
      </div>
      <div style="font-size:26px;font-weight:600;color:{tone.fg};letter-spacing:-0.5px;line-height:1.1;">
        {status.toUpperCase()}
      </div>
    </div>
  </div>

  <div class="basis-full grow shrink md:basis-0" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
    {#each chips as chip}
      {@const ct = TONE[chip.status] ?? TONE.ok}
      <svelte:element
        this={chip.href ? 'a' : 'div'}
        href={chip.href}
        style="
          display:inline-flex;align-items:center;gap:7px;
          padding:7px 11px;border-radius:7px;
          background:var(--mep-surface);border:1px solid var(--mep-divider);
          text-decoration:none;min-width:0;
        "
      >
        <span style="width:7px;height:7px;border-radius:50%;background:{ct.fg};flex-shrink:0;"></span>
        <span style="font-size:11.5px;color:var(--mep-fg-2);white-space:nowrap;">{chip.label}</span>
        <span class="num" style="font-size:13px;font-weight:600;color:{chip.status === 'ok' ? 'var(--mep-fg)' : ct.fg};">
          {chip.value}
        </span>
        {#if chip.href}<ChevronRight size={11} style="color:var(--mep-fg-4);flex-shrink:0;" />{/if}
      </svelte:element>
    {/each}
  </div>

  <div class="num" style="font-size:11px;color:var(--mep-fg-3);text-align:right;white-space:nowrap;">
    {new Date(checkedAt).toLocaleTimeString('en-GB')}
  </div>
</div>
