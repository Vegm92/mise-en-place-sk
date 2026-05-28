<script lang="ts">
  import { AlertTriangle, Clock, Check } from 'lucide-svelte';

  interface Reminder {
    id: number;
    supplier_name: string | null;
    invoice_number: string | null;
    display_amount: number;
    due_date: string | null;
    days_delta: number;
  }

  let {
    overdue,
    due_soon,
    total_amount,
  }: {
    overdue: Reminder[];
    due_soon: Reminder[];
    total_amount: number;
  } = $props();

  function fmtAmount(n: number) {
    return Math.round(n).toLocaleString('es-ES') + ' EUR';
  }
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    {#if !overdue.length && !due_soon.length}
      <div style="padding: 48px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        Sin alertas pendientes
      </div>
    {:else}

      <!-- Summary chips -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px;">
        {#if overdue.length}
          <div style="padding: 6px 12px; border-radius: 8px; background: var(--mep-neg-soft); font-size: 12.5px;">
            <strong style="color: var(--mep-neg);">{overdue.length}</strong>
            <span style="color: var(--mep-fg-2);"> vencidas</span>
          </div>
        {/if}
        {#if due_soon.length}
          <div class="card" style="padding: 6px 12px; font-size: 12.5px;">
            <strong style="color: var(--mep-fg);">{due_soon.length}</strong>
            <span style="color: var(--mep-fg-2);"> vencen esta semana</span>
          </div>
        {/if}
        <div class="card" style="padding: 6px 12px; font-size: 12.5px;">
          <span style="color: var(--mep-fg-2);">Total: </span>
          <strong class="num" style="color: var(--mep-fg);">{fmtAmount(total_amount)}</strong>
        </div>
      </div>

      <!-- Overdue section -->
      {#if overdue.length}
        <div>
          <div style="font-size: 11.5px; color: var(--mep-neg); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <AlertTriangle size={13} /> Vencidas
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each overdue as r}
              <div class="card" style="padding: 12px 14px; background: var(--mep-neg-soft);">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {r.supplier_name ?? '—'}
                    </div>
                    <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">
                      {r.invoice_number ?? '—'}
                    </div>
                  </div>
                  <div style="text-align: right; flex-shrink: 0;">
                    <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtAmount(r.display_amount)}</div>
                    <span class="badge badge-overdue" style="font-size: 9.5px;">{Math.abs(r.days_delta)}d venc.</span>
                  </div>
                </div>
                <form method="post" action="?/markPaid" style="margin-top: 10px;">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="btn btn-ghost" style="height: 30px; font-size: 12px; gap: 4px; width: 100%; justify-content: center; color: var(--mep-pos);">
                    <Check size={12} /> Marcar como pagada
                  </button>
                </form>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Due soon section -->
      {#if due_soon.length}
        <div>
          <div style="font-size: 11.5px; color: var(--mep-warn); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <Clock size={13} /> Vencen esta semana
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each due_soon as r}
              <div class="card" style="padding: 12px 14px;">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {r.supplier_name ?? '—'}
                    </div>
                    <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">
                      {r.invoice_number ?? '—'}
                    </div>
                  </div>
                  <div style="text-align: right; flex-shrink: 0;">
                    <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtAmount(r.display_amount)}</div>
                    <span class="badge badge-pending" style="font-size: 9.5px;">{r.days_delta}d restantes</span>
                  </div>
                </div>
                <form method="post" action="?/markPaid" style="margin-top: 10px;">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="btn btn-ghost" style="height: 30px; font-size: 12px; gap: 4px; width: 100%; justify-content: center; color: var(--mep-pos);">
                    <Check size={12} /> Marcar como pagada
                  </button>
                </form>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    {/if}
  </div>
</div>
