<script lang="ts">
  import { initials } from '$lib/formatters';

  let { name, color, size = 32 }: {
    name: string;
    color: string;
    size?: number;
  } = $props();

  const fontSize = $derived(Math.round(size * (size <= 32 ? 0.4 : 0.31)));
  const fontWeight = $derived(size > 32 ? 700 : 600);
</script>

<span style="
  width:{size}px;height:{size}px;border-radius:{size / 2}px;flex-shrink:0;
  background:{color}24;color:{color};
  display:inline-flex;align-items:center;justify-content:center;
  font-size:{fontSize}px;font-weight:{fontWeight};
">{initials(name)}</span>
