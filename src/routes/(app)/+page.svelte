<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import UploadPanel from '$lib/components/UploadPanel.svelte';

  const { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<UploadPanel {data} {form} />
