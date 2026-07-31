<script lang="ts">
  import type { PageData } from './$types';
  import MobileSuppliersList from '$lib/components/mobile/MobileSuppliersList.svelte';
  import DesktopSuppliersList from '$lib/components/desktop/DesktopSuppliersList.svelte';

  let { data }: { data: PageData } = $props();

  const totalSpend         = $derived(data.suppliers.reduce((s, x) => s + (x.month_spend ?? 0), 0));
  const totalMonthInvoices = $derived(data.suppliers.reduce((s, x) => s + (x.month_invoice_count ?? 0), 0));
  const unassigned         = $derived(data.suppliers.filter(s => !s.category || s.category === 'Other').length);
  const firstUnassigned    = $derived(data.suppliers.find(s => !s.category || s.category === 'Other')?.name ?? '');
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileSuppliersList
    suppliers={data.suppliers}
    categories={data.categories}
    totalSpend={totalSpend}
    totalMonthInvoices={totalMonthInvoices}
    unassigned={unassigned}
    firstUnassigned={firstUnassigned}
  />
</div>

<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
  <DesktopSuppliersList
    suppliers={data.suppliers}
    categories={data.categories}
    totalSpend={totalSpend}
    totalMonthInvoices={totalMonthInvoices}
    unassigned={unassigned}
    firstUnassigned={firstUnassigned}
  />
</div>
