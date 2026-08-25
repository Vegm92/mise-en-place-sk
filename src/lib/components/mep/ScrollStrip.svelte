<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    padding = '0 18px 12px',
    leadIn = '18px',
    gap = '6px',
    label = undefined,
    extraStyle = '',
  }: {
    children: Snippet;
    padding?: string;
    leadIn?: string;
    gap?: string;
    label?: string;
    extraStyle?: string;
  } = $props();

  let el = $state<HTMLDivElement | null>(null);
  let moreStart = $state(false);
  let moreEnd = $state(false);

  function measure() {
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    moreStart = max > 1 && el.scrollLeft > 1;
    moreEnd = max > 1 && el.scrollLeft < max - 1;
  }

  $effect(() => {
    const node = el;
    if (!node) return;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    const mutate = new MutationObserver(measure);
    mutate.observe(node, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      mutate.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
</script>

<div
  bind:this={el}
  class="scroll-strip"
  data-scroll-strip-root
  data-more-start={moreStart}
  data-more-end={moreEnd}
  role={label ? 'group' : undefined}
  aria-label={label}
  style="--mep-strip-pad:{padding};--mep-strip-lead-in:{leadIn};--mep-strip-gap:{gap};{extraStyle}"
  onscroll={measure}
>
  {@render children()}
</div>
