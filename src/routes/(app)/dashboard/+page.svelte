<script lang="ts">
  import type { PageData } from './$types';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import { Bell, TrendingUp, TriangleAlert, Upload, MessageCircle, X, Send } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  let remindersDismissed = $state(false);

  // Chat widget
  let chatOpen = $state(false);
  let chatInput = $state('');
  let chatLoading = $state(false);
  type Message = { role: 'user' | 'assistant'; text: string };
  let messages = $state<Message[]>([]);

  async function sendMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    chatInput = '';
    messages = [...messages, { role: 'user', text }];
    chatLoading = true;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      messages = [...messages, { role: 'assistant', text: data.reply ?? 'No response.' }];
    } catch {
      messages = [...messages, { role: 'assistant', text: 'Something went wrong. Try again.' }];
    } finally {
      chatLoading = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function momLabel(pct: number | null) {
    if (pct === null) return '—';
    return (pct >= 0 ? '+' : '') + pct + '%';
  }
  function momColor(pct: number | null): string {
    if (pct === null) return '#888888';
    return pct > 10 ? '#E05555' : pct < -5 ? '#3A8C5C' : '#1A1A1A';
  }
  function budgetPct(spend: number, budget: number) {
    return Math.min(Math.round(spend / budget * 100), 100);
  }
  function budgetBarColor(pct: number, threshold: number) {
    if (pct >= 100) return '#B91C1C';
    if (pct >= threshold) return '#92400E';
    return '#2271B1';
  }

  const statusBg: Record<string, string> = {
    pending:  '#F3F4F6',
    paid:     '#F0FDF4',
    overdue:  '#FFF1F0',
    due_soon: '#FFFBEB',
  };
  const statusColor: Record<string, string> = {
    pending:  '#555555',
    paid:     '#166534',
    overdue:  '#B91C1C',
    due_soon: '#92400E',
  };
</script>

<!-- Page header -->
<div class="flex items-center justify-between mb-6">
  <div>
    <h1 class="text-[22px] font-bold text-[#1A1A1A] tracking-[-0.02em] leading-none">Dashboard</h1>
    <p class="text-[13px] text-[#666666] mt-1">Welcome back — here's what needs your attention.</p>
  </div>
  <a
    href="/"
    class="flex items-center gap-2 px-4 h-9 rounded-[8px] bg-[#2271B1] text-white text-[13px] font-semibold no-underline hover:bg-[#1A5E90] transition-colors"
  >
    <Upload size={13} />
    Upload Invoice
  </a>
</div>

<!-- KPI Strip -->
<div class="grid grid-cols-7 gap-3 mb-5 max-[1100px]:grid-cols-4 max-[640px]:grid-cols-2">

  <!-- Overdue -->
  <div class="rounded-[12px] p-5 {data.overdue.count > 0 ? 'bg-[#FFF1F0] border border-[#FECACA]' : 'bg-white border border-[#E5E7EB]'}">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase {data.overdue.count > 0 ? 'text-[#B91C1C]' : 'text-[#666666]'} mb-2">Overdue</p>
    <p class="text-[26px] font-bold leading-none {data.overdue.count > 0 ? 'text-[#B91C1C]' : 'text-[#1A1A1A]'}">{data.overdue.count}</p>
    <p class="text-[11px] text-[#666666] mt-1">invoices past due</p>
  </div>

  <!-- Due this week -->
  <div class="rounded-[12px] p-5 {data.due_week.count > 0 ? 'bg-[#FFFBEB] border border-[#FDE68A]' : 'bg-white border border-[#E5E7EB]'}">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase {data.due_week.count > 0 ? 'text-[#92400E]' : 'text-[#666666]'} mb-2">Due this week</p>
    <p class="text-[26px] font-bold leading-none text-[#1A1A1A]">€{Math.round(data.due_week.amount).toLocaleString()}</p>
    <p class="text-[11px] text-[#666666] mt-1">{data.due_week.count} invoice{data.due_week.count !== 1 ? 's' : ''}</p>
  </div>

  <!-- Pending -->
  <div class="rounded-[12px] p-5 bg-white border border-[#E5E7EB]">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase text-[#666666] mb-2">Pending</p>
    <p class="text-[26px] font-bold leading-none text-[#1A1A1A]">€{Math.round(data.pending.amount).toLocaleString()}</p>
    <p class="text-[11px] text-[#666666] mt-1">{data.pending.count} invoice{data.pending.count !== 1 ? 's' : ''}</p>
  </div>

  <!-- Paid this month -->
  <div class="rounded-[12px] p-5 bg-[#F0FDF4] border border-[#BBF7D0]">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase text-[#166534] mb-2">Paid this month</p>
    <p class="text-[26px] font-bold leading-none text-[#1A1A1A]">€{Math.round(data.paid_month.amount).toLocaleString()}</p>
    <p class="text-[11px] text-[#666666] mt-1">{data.paid_month.count} invoice{data.paid_month.count !== 1 ? 's' : ''}</p>
  </div>

  <!-- MoM spend -->
  <div class="rounded-[12px] p-5 bg-white border border-[#E5E7EB]">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase text-[#666666] mb-2">MoM spend</p>
    <p class="text-[26px] font-bold leading-none" style="color:{momColor(data.mom.pct_change)}">{momLabel(data.mom.pct_change)}</p>
    <p class="text-[11px] text-[#666666] mt-1">vs last month</p>
  </div>

  <!-- Avg invoice -->
  <div class="rounded-[12px] p-5 bg-white border border-[#E5E7EB]">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase text-[#666666] mb-2">Avg invoice</p>
    <p class="text-[26px] font-bold leading-none text-[#1A1A1A]">{data.avg_invoice != null ? '€' + Math.round(data.avg_invoice).toLocaleString() : '—'}</p>
    <p class="text-[11px] text-[#666666] mt-1">EUR</p>
  </div>

  <!-- Suppliers -->
  <div class="rounded-[12px] p-5 bg-white border border-[#E5E7EB]">
    <p class="text-[10px] font-bold tracking-[0.08em] uppercase text-[#666666] mb-2">Suppliers</p>
    <p class="text-[26px] font-bold leading-none text-[#1A1A1A]">{data.supplier_count}</p>
    <p class="text-[11px] text-[#666666] mt-1">active</p>
  </div>

</div>

<!-- Main 3-column grid -->
<div class="grid grid-cols-[260px_1fr_260px] gap-4 items-start max-[1100px]:grid-cols-[1fr_1fr] max-[640px]:grid-cols-1">

  <!-- LEFT COLUMN -->
  <div class="flex flex-col gap-4 max-[1100px]:col-span-1">

    <!-- Recent invoices -->
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
        <span class="text-[13px] font-semibold text-[#1A1A1A]">Recent Invoices</span>
        <a href="/invoices" class="text-[12px] text-[#2271B1] no-underline hover:underline">All →</a>
      </div>
      <div class="px-5">
        {#if data.recent_invoices.length}
          {#each data.recent_invoices as inv (inv.id)}
            <div class="flex items-center gap-2 py-[10px] border-b border-[#F9FAFB] last:border-0">
              <span class="flex-1 text-[12px] font-medium text-[#1A1A1A] overflow-hidden text-ellipsis whitespace-nowrap">{inv.supplier_name ?? '—'}</span>
              <span class="text-[12px] font-semibold text-[#1A1A1A] font-mono shrink-0">€{Math.round(inv.display_amount).toLocaleString()}</span>
              <span
                class="text-[10px] font-semibold px-2 py-[2px] rounded-full shrink-0"
                style="background:{statusBg[inv.status] ?? '#F3F4F6'}; color:{statusColor[inv.status] ?? '#666'}"
              >{inv.status.replace('_', ' ')}</span>
            </div>
          {/each}
        {:else}
          <p class="text-[13px] text-[#666666] py-4">No invoices yet.</p>
        {/if}
      </div>
    </div>

    <!-- Budget -->
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
        <span class="text-[13px] font-semibold text-[#1A1A1A]">Budget Overview</span>
        <a href="/budgets" class="text-[12px] text-[#2271B1] no-underline hover:underline">Edit →</a>
      </div>
      <div class="px-5 py-4 flex flex-col gap-3">
        {#if data.total_budget === 0}
          <p class="text-[13px] text-[#666666]">No budgets set. <a href="/budgets" class="text-[#2271B1] underline">Set them →</a></p>
        {:else}
          <!-- Total bar -->
          <div class="flex flex-col gap-[6px]">
            <div class="flex justify-between">
              <span class="text-[11px] text-[#555555]">Total · {Math.round(data.total_pct_actual)}% used</span>
              <span class="text-[11px] text-[#666666]">€{Math.round(data.total_spent).toLocaleString()} / €{Math.round(data.total_budget).toLocaleString()}</span>
            </div>
            <div class="h-[6px] bg-[#F3F4F6] rounded-full overflow-hidden">
              <div class="h-full rounded-full bg-[#4A9FD8]" style="width:{data.total_pct_bar}%"></div>
            </div>
          </div>
          <!-- Category bars -->
          {#each data.valid_categories as cat}
            {@const spend = data.category_spend_map[cat] ?? 0}
            {@const budget = data.budgets[cat] ?? 0}
            {#if budget > 0}
              {@const pct = budgetPct(spend, budget)}
              {@const color = budgetBarColor(pct, data.budget_threshold)}
              <div class="flex flex-col gap-[5px]">
                <div class="flex justify-between">
                  <span class="text-[11px] font-medium text-[#1A1A1A] overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]" title={cat}>{cat}</span>
                  <span class="text-[11px] font-semibold shrink-0" style="color:{color}">{pct}%</span>
                </div>
                <div class="h-[4px] bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div class="h-full rounded-full" style="width:{pct}%;background:{color}"></div>
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>

  </div>

  <!-- MIDDLE COLUMN -->
  <div class="flex flex-col gap-4">

    <!-- Trend chart -->
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
      <TrendChart initialScale="monthly" />
    </div>

    <!-- Category spend -->
    {#if data.category_spend.length}
      <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
          <span class="text-[13px] font-semibold text-[#1A1A1A]">Category Spend</span>
          <span class="text-[12px] text-[#666666]">this month</span>
        </div>
        <div class="px-5 py-4 flex flex-col gap-[10px]">
          {#each data.category_spend as cat (cat.category)}
            <div class="flex items-center gap-3">
              <div class="w-2 h-2 rounded-full shrink-0" style="background:{cat.color}"></div>
              <span class="text-[12px] font-medium text-[#1A1A1A] w-[80px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap" title={cat.category}>{cat.category}</span>
              <div class="flex-1 h-[6px] bg-[#F3F4F6] rounded-full overflow-hidden">
                <div class="h-full rounded-full" style="width:{cat.pct}%;background:{cat.color}"></div>
              </div>
              <span class="text-[11px] font-semibold text-[#1A1A1A] font-mono w-[52px] text-right shrink-0">€{Math.round(cat.total).toLocaleString()}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Suppliers -->
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
        <span class="text-[13px] font-semibold text-[#1A1A1A]">Top Suppliers</span>
        <a href="/suppliers" class="text-[12px] text-[#2271B1] no-underline hover:underline">View all →</a>
      </div>
      <div class="p-5">
        {#if data.suppliers.length}
          <div class="grid grid-cols-3 gap-3 max-[800px]:grid-cols-2">
            {#each data.suppliers as s (s.id)}
              <div class="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] p-[14px] flex flex-col gap-[8px]">
                <p class="text-[9px] font-bold tracking-[0.06em] uppercase overflow-hidden text-ellipsis whitespace-nowrap" style="color:{s.color}">{s.category}</p>
                <p class="text-[12px] font-semibold text-[#1A1A1A] overflow-hidden text-ellipsis whitespace-nowrap">{s.name}</p>
                <div>
                  <p class="text-[9px] text-[#666666]">This month</p>
                  <p class="text-[12px] font-semibold font-mono text-[#1A1A1A]">€{Math.round(s.month_spend).toLocaleString()}</p>
                </div>
                <span
                  class="text-[10px] font-semibold px-2 py-[2px] rounded-full self-start"
                  style="background:{statusBg[s.badge] ?? '#F3F4F6'}; color:{statusColor[s.badge] ?? '#666'}"
                >
                  {#if s.badge === 'overdue'}Overdue{:else if s.badge === 'due_soon'}Due soon{:else}Paid up{/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-[13px] text-[#666666]">No suppliers yet.</p>
        {/if}
      </div>
    </div>

  </div>

  <!-- RIGHT COLUMN -->
  <div class="flex flex-col gap-4 max-[1100px]:col-span-2 max-[640px]:col-span-1">

    <!-- Invoice aging -->
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
        <span class="text-[13px] font-semibold text-[#1A1A1A]">Invoice Aging</span>
        <span class="text-[12px] text-[#666666]">pending</span>
      </div>
      <div class="grid grid-cols-3 gap-3 p-5">
        <div class="bg-[#F9FAFB] rounded-[8px] p-3 text-center border border-[#E5E7EB]">
          <p class="text-[22px] font-bold text-[#1A1A1A] leading-none">{data.aging.fresh}</p>
          <p class="text-[10px] font-medium text-[#666666] mt-1">≤7 days</p>
        </div>
        <div class="rounded-[8px] p-3 text-center border {data.aging.mid > 0 ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#F9FAFB] border-[#E5E7EB]'}">
          <p class="text-[22px] font-bold leading-none {data.aging.mid > 0 ? 'text-[#92400E]' : 'text-[#1A1A1A]'}">{data.aging.mid}</p>
          <p class="text-[10px] font-medium mt-1 {data.aging.mid > 0 ? 'text-[#92400E]' : 'text-[#666666]'}">8–30 days</p>
        </div>
        <div class="rounded-[8px] p-3 text-center border {data.aging.old > 0 ? 'bg-[#FFF1F0] border-[#FECACA]' : 'bg-[#F9FAFB] border-[#E5E7EB]'}">
          <p class="text-[22px] font-bold leading-none {data.aging.old > 0 ? 'text-[#B91C1C]' : 'text-[#1A1A1A]'}">{data.aging.old}</p>
          <p class="text-[10px] font-medium mt-1 {data.aging.old > 0 ? 'text-[#B91C1C]' : 'text-[#666666]'}">&gt;30 days</p>
        </div>
      </div>
    </div>

    <!-- Reminders -->
    {#if data.reminders.length && !remindersDismissed}
      <div class="bg-white rounded-[12px] border border-[#E5E7EB] border-l-[3px] border-l-[#C8843A] overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
          <div class="flex items-center gap-2">
            <Bell size={13} class="text-[#C8843A]" />
            <span class="text-[13px] font-semibold text-[#92400E]">Reminders</span>
          </div>
          <div class="flex items-center gap-3">
            <a href="/reminders" class="text-[12px] text-[#2271B1] no-underline hover:underline">All →</a>
            <button
              type="button"
              class="bg-transparent border-none cursor-pointer text-[#666666] text-[13px] leading-none p-0 hover:text-[#1A1A1A]"
              onclick={() => { remindersDismissed = true; sessionStorage.setItem('reminders-dismissed', '1'); }}
            >✕</button>
          </div>
        </div>
        <div class="px-5">
          {#each data.reminders as r (r.id)}
            <div class="flex items-center gap-2 py-[10px] border-b border-[#F9FAFB] last:border-0">
              <span class="flex-1 text-[12px] font-medium text-[#1A1A1A] overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</span>
              <span class="text-[12px] font-semibold font-mono text-[#1A1A1A] shrink-0">€{Math.round(r.display_amount).toLocaleString()}</span>
              {#if r.overdue}
                <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full bg-[#FFF1F0] text-[#B91C1C] shrink-0">{Math.abs(r.days_delta)}d late</span>
              {:else}
                <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full bg-[#FFFBEB] text-[#92400E] shrink-0">{r.days_delta}d left</span>
              {/if}
              <form method="post" action="?/markPaid" class="m-0 shrink-0">
                <input type="hidden" name="invoiceId" value={r.id} />
                <button type="submit" class="text-[11px] font-semibold py-[3px] px-[8px] bg-[#F0FDF4] text-[#166534] border-none rounded-[6px] cursor-pointer hover:bg-[#DCFCE7] transition-colors">✓</button>
              </form>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Missing invoices -->
    {#if data.missing_invoices.length}
      <div class="bg-white rounded-[12px] border border-[#E5E7EB] border-l-[3px] border-l-[#E05555] overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-4 border-b border-[#F3F4F6]">
          <TriangleAlert size={13} class="text-[#E05555]" />
          <span class="text-[13px] font-semibold text-[#B91C1C]">Missing Invoices</span>
        </div>
        <div class="p-5 flex flex-wrap gap-2">
          {#each data.missing_invoices as m (m.supplier_name)}
            <div class="bg-[#FFF1F0] border border-[#FECACA] rounded-[8px] py-[6px] px-3">
              <p class="text-[12px] font-semibold text-[#1A1A1A]">{m.supplier_name}</p>
              <p class="text-[10px] text-[#666666] mt-[2px]">{m.days_late}d late · {m.frequency}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Dark summary tile -->
    <div class="bg-[#0A0A0A] rounded-[12px] p-5 flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <TrendingUp size={15} class="text-[#4A9FD8]" />
        <span class="text-[13px] font-semibold text-white">Performance</span>
      </div>
      <div>
        <p class="text-[34px] font-bold text-white leading-none">{data.avg_invoice != null ? '€' + Math.round(data.avg_invoice).toLocaleString() : '—'}</p>
        <p class="text-[12px] text-[#808080] mt-1">avg invoice · {data.supplier_count} active suppliers</p>
      </div>
      <div class="h-px bg-[#1A1A1A]"></div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-[16px] font-semibold font-mono text-white leading-none">{data.paid_month.count + data.pending.count}</p>
          <p class="text-[11px] text-[#808080] mt-1">Invoices this month</p>
        </div>
        <div>
          <p class="text-[16px] font-semibold font-mono text-[#4A9FD8] leading-none">{data.paid_month.count + data.pending.count > 0 ? Math.round(data.paid_month.count / (data.paid_month.count + data.pending.count) * 100) : 0}%</p>
          <p class="text-[11px] text-[#808080] mt-1">Paid on time</p>
        </div>
      </div>
    </div>

  </div>

</div>

<!-- Chat widget -->
<div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

  {#if chatOpen}
    <div class="w-[340px] max-h-[480px] bg-white rounded-[16px] border border-[#E5E7EB] shadow-xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[#F3F4F6] bg-[#FAFAFA]">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-[#4A9FD8] flex items-center justify-center">
            <MessageCircle size={12} class="text-white" />
          </div>
          <span class="text-[13px] font-semibold text-[#1A1A1A]">Ask your data</span>
        </div>
        <button onclick={() => chatOpen = false} class="text-[#888] hover:text-[#1A1A1A] transition-colors border-none bg-transparent cursor-pointer p-0">
          <X size={15} />
        </button>
      </div>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-[200px]">
        {#if messages.length === 0}
          <p class="text-[12px] text-[#666666] text-center mt-auto mb-auto">Ask anything about your invoices, suppliers, stock, or spending.</p>
        {/if}
        {#each messages as msg (msg)}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[80%] px-3 py-2 rounded-[10px] text-[12px] leading-relaxed whitespace-pre-wrap
              {msg.role === 'user'
                ? 'bg-[#4A9FD8] text-white rounded-br-[3px]'
                : 'bg-[#F3F4F6] text-[#1A1A1A] rounded-bl-[3px]'}">
              {msg.text}
            </div>
          </div>
        {/each}
        {#if chatLoading}
          <div class="flex justify-start">
            <div class="bg-[#F3F4F6] rounded-[10px] rounded-bl-[3px] px-3 py-2">
              <div class="flex gap-1 items-center h-4">
                <span class="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce" style="animation-delay:300ms"></span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Input -->
      <div class="flex items-center gap-2 px-3 py-3 border-t border-[#F3F4F6]">
        <input
          type="text"
          bind:value={chatInput}
          onkeydown={onKeydown}
          placeholder="Ask about your data…"
          disabled={chatLoading}
          class="flex-1 text-[12px] px-3 py-2 rounded-[8px] border border-[#E5E7EB] bg-white outline-none focus:border-[#4A9FD8] transition-colors disabled:opacity-50"
        />
        <button
          onclick={sendMessage}
          disabled={!chatInput.trim() || chatLoading}
          class="w-8 h-8 rounded-[8px] bg-[#4A9FD8] flex items-center justify-center border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send size={13} class="text-white" />
        </button>
      </div>
    </div>
  {/if}

  <!-- FAB -->
  <button
    onclick={() => chatOpen = !chatOpen}
    class="w-12 h-12 rounded-full bg-[#4A9FD8] border-none cursor-pointer shadow-lg hover:bg-[#3d8ec7] transition-colors flex items-center justify-center"
    aria-label="Toggle chat"
  >
    {#if chatOpen}
      <X size={18} class="text-white" />
    {:else}
      <MessageCircle size={18} class="text-white" />
    {/if}
  </button>

</div>
