<script lang="ts">
  type Pill = { value: string; label: string; href: string };

  let { pills, active }: { pills: Pill[]; active: string } = $props();
</script>

<div class="period-track" role="group">
  {#each pills as p (p.value)}
    <a href={p.href} class="period-pill {p.value === active ? 'active' : ''}" aria-current={p.value === active ? 'true' : undefined}>
      {p.label}
    </a>
  {/each}
</div>
