<script lang="ts">
  import { t } from '$lib/i18n';
  import { badgeClass, statusKey } from '$lib/status';

  const { status, style }: { status: string; style?: string } = $props();
</script>

<span class={badgeClass(status)} {style}>{$t(statusKey(status))}</span>
