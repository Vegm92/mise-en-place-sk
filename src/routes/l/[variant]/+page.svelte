<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import LandingPage from '$lib/components/landing/LandingPage.svelte';

  const { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<LandingPage {form} data={{ canonicalUrl: data.canonicalUrl, spotTaken: data.spotTaken }} overrides={data.overrides} />
