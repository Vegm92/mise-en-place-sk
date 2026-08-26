<script lang="ts">
  const SIZES = {
    sm: { width: 28, height: 36, fontSize: 8.5, letterSpacing: '0.04em' },
    md: { width: 30, height: 38, fontSize: 8.5, letterSpacing: 'normal' },
    lg: { width: 32, height: 40, fontSize: 9, letterSpacing: '0.04em' }
  } as const;

  const {
    kind,
    label,
    size = 'md',
    opacity = 1
  }: {
    kind: 'pdf' | 'other';
    label: string;
    size?: keyof typeof SIZES;
    opacity?: number;
  } = $props();

  const dims = $derived(SIZES[size]);
</script>

<div
  style="width:{dims.width}px;height:{dims.height}px;border-radius:4px;flex-shrink:0;background:{kind === 'pdf' ? 'var(--mep-badge-pdf)' : 'var(--mep-badge-other)'};color:var(--mep-badge-fg);display:flex;align-items:center;justify-content:center;font-size:{dims.fontSize}px;font-weight:700;letter-spacing:{dims.letterSpacing};opacity:{opacity};"
>
  {label}
</div>
