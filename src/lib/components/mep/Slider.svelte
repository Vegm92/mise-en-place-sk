<script lang="ts">
  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    name,
  }: {
    value?: number;
    min?: number;
    max?: number;
    name?: string;
  } = $props();

  const pct = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="mep-slider">
  <div class="mep-slider-track"></div>
  <div class="mep-slider-fill" style="width:{pct}%;"></div>
  <div class="mep-slider-thumb" style="left:calc({pct}% - 7px);"></div>
  <input class="mep-slider-input" type="range" {name} {min} {max} bind:value />
</div>

<style>
  .mep-slider {
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
  }
  .mep-slider-track {
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--mep-divider);
  }
  .mep-slider-fill {
    position: absolute;
    left: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--mep-acc);
  }
  .mep-slider-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 7px;
    background: var(--mep-surface);
    border: 2px solid var(--mep-acc);
    box-shadow: var(--mep-shadow-card);
    pointer-events: none;
  }
  .mep-slider-input {
    position: absolute;
    left: -2px;
    right: -2px;
    width: calc(100% + 4px);
    opacity: 0;
    height: 20px;
    margin: 0;
    cursor: pointer;
  }
</style>
