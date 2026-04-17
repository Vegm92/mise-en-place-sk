<script lang="ts">
  import type { PageData } from './$types';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-[600px]">

  <Card.Root class="p-8 mb-4 text-center">
    <div class="text-4xl mb-3">✅</div>
    <h2 class="text-base font-semibold mb-2">Invoice saved successfully</h2>
    <p class="text-[.875rem] text-muted-foreground">
      Invoice #{data.invoiceId} has been stored and is ready for review.
    </p>
  </Card.Root>

  {#if data.alerts.length > 0}
    <Card.Root class="p-8 mb-4">
      <h2 class="text-base font-semibold mb-4">Alerts generated</h2>
      <div class="flex flex-col gap-2">
        {#each data.alerts as alert}
          <div class="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-4 py-3 text-[.875rem]">
            {alert.message}
          </div>
        {/each}
      </div>
      <p class="text-[.8rem] text-muted-foreground mt-3">
        These alerts have been queued for WhatsApp delivery.
      </p>
    </Card.Root>
  {:else}
    <div class="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-[.875rem] mb-4">
      No alerts for this invoice — all prices and stock levels look normal.
    </div>
  {/if}

  <div class="flex gap-3 mt-2">
    <Button href="/invoices">Go to Invoices</Button>
    <Button variant="outline" href="/">Upload another</Button>
  </div>

</div>
