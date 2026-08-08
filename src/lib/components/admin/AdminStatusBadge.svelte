<script lang="ts">
  type Status = 'ok' | 'warn' | 'error';

  let { status, size = 'sm' }: { status: Status; size?: 'sm' | 'lg' } = $props();

  const MAP: Record<Status, { label: string; bg: string; fg: string }> = {
    ok:    { label: 'OK',   bg: 'var(--mep-pos-soft)',  fg: 'var(--mep-pos)' },
    warn:  { label: 'WARN', bg: 'var(--mep-warn-soft)', fg: 'var(--mep-warn)' },
    error: { label: 'ERR',  bg: 'var(--mep-neg-soft)',  fg: 'var(--mep-neg)' },
  };

  const s = $derived(MAP[status] ?? MAP.ok);
  const big = $derived(size === 'lg');
</script>

<span class="num" style="
  display:inline-flex;align-items:center;gap:{big ? 10 : 6}px;
  padding:{big ? '10px 16px' : '3px 9px'};
  border-radius:{big ? 8 : 4}px;
  background:{s.bg};color:{s.fg};
  font-size:{big ? 14 : 11}px;font-weight:{big ? 600 : 500};
  letter-spacing:0.04em;text-transform:uppercase;line-height:1;
">
  <span style="
    width:{big ? 8 : 6}px;height:{big ? 8 : 6}px;border-radius:50%;
    background:{s.fg};
    box-shadow:{big ? `0 0 0 4px ${s.bg}` : 'none'};
  "></span>
  {s.label}
</span>
