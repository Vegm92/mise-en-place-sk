<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import { fmtEur, semColor } from '$lib/formatters';

  let { data }: { data: PageData } = $props();

  const today = new Date().getDate();

  const rows = $derived(data.categories.map(cat => {
    const limit = data.budgets[cat] ?? 0;
    const spent = data.category_spend[cat] ?? 0;
    const pct   = limit > 0 ? (spent / limit) * 100 : 0;
    const remaining  = limit - spent;
    const projected  = today > 0 ? pct * 31 / today : 0;
    const color = data.colors[cat] ?? '#888';
    return { cat, limit, spent, pct, remaining, projected, color };
  }));

  const totalLimit = $derived(rows.reduce((s, r) => s + r.limit, 0));
  const totalSpent = $derived(rows.reduce((s, r) => s + r.spent, 0));
  const totalPct   = $derived(totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0);

  const monthLabel = new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' });
</script>

<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">

    <!-- Overall progress card -->
    <div class="card" style="padding:18px 20px;flex-shrink:0;">
      <div class="label" style="margin-bottom:6px;text-transform:capitalize;">{monthLabel} · al día {today}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;">
        <div class="num" style="font-size:32px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.7px;line-height:1;">
          {fmtEur(totalSpent)}
        </div>
        <div style="font-size:13px;color:var(--mep-fg-3);">
          de <span class="num" style="color:var(--mep-fg-2);font-weight:500;">{fmtEur(totalLimit)}</span>
        </div>
      </div>
      {#if totalLimit > 0}
        <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;display:flex;">
          {#each rows as r}
            {#if r.limit > 0}
              <span style="width:{(r.spent / totalLimit) * 100}%;height:100%;background:{r.color};border-right:1px solid var(--mep-bg);flex-shrink:0;"></span>
            {/if}
          {/each}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--mep-fg-3);margin-top:8px;">
          <span>
            <span class="num" style="color:{semColor(totalPct)};font-weight:600;">{totalPct.toFixed(1).replace('.',',')}%</span>
            usado · proyección {(totalPct * 31 / today).toFixed(0)}% al cierre
          </span>
          <span class="num">{fmtEur(totalLimit - totalSpent)} restante</span>
        </div>
      {:else}
        <div style="font-size:13px;color:var(--mep-fg-3);">Define presupuestos mensuales por categoría para controlar tu gasto. Edita los campos en la tabla y guarda.</div>
      {/if}
    </div>

    <!-- Budget table -->
    <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
      <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--mep-divider);flex-shrink:0;">
        <div>
          <div class="subtitle">Presupuesto por categoría</div>
          <div style="font-size:12px;color:var(--mep-fg-3);margin-top:2px;">Edita el campo de presupuesto y guarda</div>
        </div>
      </div>

      <div style="overflow:auto;flex:1;">
        <form method="post" action="?/save" use:enhance>
          <table class="tbl" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:22%;">Categoría</th>
                <th class="num" style="width:160px;">Presupuesto</th>
                <th class="num" style="width:130px;">Gastado</th>
                <th class="num" style="width:130px;">Restante</th>
                <th style="min-width:120px;">Progreso</th>
                <th class="num" style="width:70px;">%</th>
                <th style="width:100px;">Proyección</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r}
                {@const projOver = r.limit > 0 && r.projected > 100}
                <tr class="row">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="width:14px;height:14px;border-radius:3px;background:{r.color};flex-shrink:0;"></span>
                      <span style="font-size:13px;font-weight:500;color:var(--mep-fg);">{r.cat}</span>
                    </div>
                  </td>
                  <td class="num">
                    <input type="number" step="0.01" min="0"
                      name={r.cat}
                      value={r.limit > 0 ? r.limit : ''}
                      placeholder={$t('bud.noLimit')}
                      class="input"
                      style="height:30px;font-size:12.5px;width:130px;text-align:right;" />
                  </td>
                  <td class="num" style="color:var(--mep-fg-2);">{fmtEur(r.spent)}</td>
                  <td class="num" style="color:{r.limit > 0 && r.remaining < 0 ? 'var(--mep-neg)' : 'var(--mep-fg-2)'};font-weight:{r.limit > 0 && r.remaining < 0 ? 500 : 400};">
                    {r.limit > 0 ? fmtEur(r.remaining) : '—'}
                  </td>
                  <td>
                    {#if r.limit > 0}
                      <div style="position:relative;height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:visible;">
                        <div style="width:{Math.min(r.pct, 100)}%;height:100%;border-radius:4px;background:{semColor(r.pct)};"></div>
                        {#if r.pct > 100}
                          <div style="position:absolute;left:100%;top:0;bottom:0;width:{Math.min(r.pct - 100, 40)}%;
                            background:repeating-linear-gradient(45deg,var(--mep-neg),var(--mep-neg) 4px,var(--mep-neg-soft) 4px,var(--mep-neg-soft) 8px);
                            border-radius:0 4px 4px 0;"></div>
                        {/if}
                        <div style="position:absolute;left:80%;top:-3px;bottom:-3px;width:1.5px;background:var(--mep-fg-3);opacity:0.4;"></div>
                      </div>
                    {:else}
                      <span style="font-size:11.5px;color:var(--mep-fg-4);">Sin presupuesto</span>
                    {/if}
                  </td>
                  <td class="num" style="color:{r.limit > 0 ? semColor(r.pct) : 'var(--mep-fg-3)'};font-weight:600;">
                    {r.limit > 0 ? Math.round(r.pct) + '%' : '—'}
                  </td>
                  <td>
                    {#if r.limit > 0}
                      <span class="num" style="
                        font-size:11px;font-weight:500;padding:2px 6px;border-radius:4px;
                        background:{projOver ? 'var(--mep-neg-soft)' : 'var(--mep-pos-soft)'};
                        color:{projOver ? 'var(--mep-neg)' : 'var(--mep-pos)'};
                        display:inline-flex;align-items:center;gap:3px;
                      ">{projOver ? '↑' : '✓'} {Math.round(r.projected)}%</span>
                    {:else}
                      <span style="color:var(--mep-fg-4);font-size:11.5px;">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
            {#if totalLimit > 0}
              <tfoot>
                <tr>
                  <td style="font-weight:600;color:var(--mep-fg);font-size:13px;padding:12px;">Total</td>
                  <td class="num" style="font-weight:600;font-size:13px;">{fmtEur(totalLimit)}</td>
                  <td class="num" style="font-weight:600;font-size:13px;">{fmtEur(totalSpent)}</td>
                  <td class="num" style="font-weight:600;font-size:13px;color:var(--mep-fg-2);">{fmtEur(totalLimit - totalSpent)}</td>
                  <td colspan={2} class="num" style="font-weight:600;font-size:13px;color:{semColor(totalPct)};">
                    {totalPct.toFixed(1).replace('.',',')}%
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            {/if}
          </table>
          <div style="padding:14px 16px;border-top:1px solid var(--mep-divider);">
            <button type="submit" class="btn btn-primary" style="height:36px;">{$t('bud.save')}</button>
          </div>
        </form>
      </div>
    </div>

  </div>
</div>
