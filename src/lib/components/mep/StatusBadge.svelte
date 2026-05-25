<script lang="ts">
  import { t } from '$lib/i18n';
  import { badgeClass, statusKey } from '$lib/status';

  const { status }: { status: string } = $props();
</script>

<span class={badgeClass(status)}>{$t(statusKey(status))}</span>
