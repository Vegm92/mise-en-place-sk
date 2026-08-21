<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';

  let {
    id,
    name,
    value = '',
    label,
  }: {
    id: string;
    name: string;
    value?: string;
    label: string;
  } = $props();

  let hasValue = $state(!!value);
</script>

<div class="date-field">
  <input
    type="date"
    {id}
    {name}
    {value}
    class="input"
    class:is-empty={!hasValue}
    style="height:32px;font-size:12.5px;padding:0 8px;"
    oninput={(e) => { hasValue = !!(e.currentTarget as HTMLInputElement).value; }}
  />
  <span class="date-field-placeholder" class:is-hidden={hasValue}>
    <CalendarDays size={13} />
    {label}
  </span>
</div>
