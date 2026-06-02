<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import { fmtEur, semColor } from '$lib/formatters';

  let { data }: { data: PageData } = $props();

  const today = new Date().getDate();

  let customCategories = $state<string[]>([]);
  let newCatName = $state('');
  let showAddForm = $state(false);

  const allCategories = $derived([...data.categories, ...customCategories]);

  function addCategory() {
    const name = newCatName.trim();
    if (!name || allCategories.includes(name)) return;
    customCategories.push(name);
    newCatName = '';
    showAddForm = false;
  }

  const rows = $derived(allCategories.map(cat => {
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

<!-- ── Desktop layout ──────────────────────────────────────────────────── -->
<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
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
          <input type="hidden" name="_categories" value={JSON.stringify(allCategories)} />
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
              <!-- Add category row -->
              {#if showAddForm}
                <tr>
                  <td colspan={7} style="padding:8px 12px;background:var(--mep-surface-2);">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <input
                        type="text" maxlength="80"
                        bind:value={newCatName}
                        placeholder="Nombre de categoría…"
                        class="input"
                        style="height:30px;font-size:12.5px;width:220px;"
                        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                      />
                      <button type="button" class="btn btn-primary" style="height:30px;font-size:12.5px;"
                        onclick={addCategory}>Añadir</button>
                      <button type="button" class="btn btn-ghost" style="height:30px;font-size:12.5px;"
                        onclick={() => { showAddForm = false; newCatName = ''; }}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan={7} style="padding:10px 12px;background:var(--mep-surface-2);cursor:pointer;
                    color:var(--mep-fg-3);font-size:12.5px;font-weight:500;"
                    role="button" tabindex="0"
                    onclick={() => showAddForm = true}
                    onkeydown={(e) => e.key === 'Enter' && (showAddForm = true)}>
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
                        <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                      </svg>
                      Añadir categoría…
                    </span>
                  </td>
                </tr>
              {/if}
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

<!-- ── Mobile layout ───────────────────────────────────────────────────── -->
<div class="flex md:hidden" style="height:100%;flex-direction:column;overflow:hidden;">
  <form method="post" action="?/save" use:enhance style="display:contents;">
    <input type="hidden" name="_categories" value={JSON.stringify(allCategories)} />

    <!-- Scrollable content -->
    <div style="flex:1;overflow-y:auto;padding:14px 16px 100px;display:flex;flex-direction:column;gap:12px;">

      <!-- Hero summary card -->
      <div class="card" style="padding:16px;">
        <div class="label" style="margin-bottom:6px;text-transform:capitalize;">{monthLabel} · al día {today}</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
          <div class="num" style="font-size:30px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.6px;line-height:1;">
            {fmtEur(totalSpent)}
          </div>
          <div style="font-size:12.5px;color:var(--mep-fg-3);">
            de <span class="num" style="color:var(--mep-fg-2);font-weight:500;">{fmtEur(totalLimit)}</span>
          </div>
        </div>
        {#if totalLimit > 0}
          <!-- Segmented bar -->
          <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;display:flex;margin-bottom:10px;">
            {#each rows as r}
              {#if r.limit > 0}
                <span style="width:{(r.spent / totalLimit) * 100}%;height:100%;background:{r.color};border-right:1px solid var(--mep-bg);flex-shrink:0;"></span>
              {/if}
            {/each}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--mep-fg-3);">
            <span>
              <span class="num" style="color:{semColor(totalPct)};font-weight:600;">{totalPct.toFixed(1).replace('.',',')}%</span>
              · proyección {(totalPct * 31 / today).toFixed(0)}% al cierre
            </span>
            <span class="num">{fmtEur(totalLimit - totalSpent)} restante</span>
          </div>
        {:else}
          <div style="font-size:13px;color:var(--mep-fg-3);">
            Define presupuestos por categoría para controlar tu gasto.
          </div>
        {/if}
      </div>

      <!-- Section header -->
      <div style="padding:4px 2px 0;">
        <div class="subtitle" style="font-size:14px;">Presupuesto por categoría</div>
      </div>

      <!-- Category cards -->
      {#each rows as r}
        {@const projOver = r.limit > 0 && r.projected > 100}
        <div class="card" style="padding:14px;">

          <!-- Top row: swatch + name + projection badge -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="width:8px;height:28px;border-radius:2px;background:{r.color};flex-shrink:0;"></span>
            <span style="flex:1;font-size:14px;font-weight:500;color:var(--mep-fg);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{r.cat}</span>
            {#if r.limit > 0}
              <span class="num" style="
                font-size:11px;font-weight:500;padding:2px 7px;border-radius:4px;flex-shrink:0;
                background:{projOver ? 'var(--mep-neg-soft)' : 'var(--mep-pos-soft)'};
                color:{projOver ? 'var(--mep-neg)' : 'var(--mep-pos)'};
              ">{projOver ? '↑' : '✓'} {Math.round(r.projected)}% cierre</span>
            {/if}
          </div>

          <!-- Progress bar -->
          {#if r.limit > 0}
            <div style="position:relative;height:7px;border-radius:4px;background:var(--mep-surface-2);overflow:visible;margin-bottom:10px;">
              <div style="width:{Math.min(r.pct, 100)}%;height:100%;border-radius:4px;background:{semColor(r.pct)};"></div>
              {#if r.pct > 100}
                <div style="position:absolute;left:100%;top:0;bottom:0;width:{Math.min(r.pct - 100, 40)}%;
                  background:repeating-linear-gradient(45deg,var(--mep-neg),var(--mep-neg) 4px,var(--mep-neg-soft) 4px,var(--mep-neg-soft) 8px);
                  border-radius:0 4px 4px 0;"></div>
              {/if}
              <!-- 80% target marker -->
              <div style="position:absolute;left:80%;top:-3px;bottom:-3px;width:1.5px;background:var(--mep-fg-3);opacity:0.4;"></div>
            </div>
          {/if}

          <!-- Amounts row: spent · % · remaining -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div>
              <span class="num" style="font-size:13.5px;font-weight:600;color:var(--mep-fg);">{fmtEur(r.spent)}</span>
              {#if r.limit > 0}
                <span style="font-size:11.5px;color:var(--mep-fg-3);"> · {fmtEur(r.limit)}</span>
              {/if}
            </div>
            <span class="num" style="font-size:13.5px;font-weight:600;color:{r.limit > 0 ? semColor(r.pct) : 'var(--mep-fg-3)'};">
              {r.limit > 0 ? Math.round(r.pct) + '%' : '—'}
            </span>
          </div>

          <!-- Budget input -->
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:11px;color:var(--mep-fg-3);font-weight:500;white-space:nowrap;">Presupuesto</label>
            <input type="number" step="0.01" min="0"
              name={r.cat}
              value={r.limit > 0 ? r.limit : ''}
              placeholder={$t('bud.noLimit')}
              class="input"
              style="flex:1;height:34px;font-size:13px;text-align:right;" />
          </div>
        </div>
      {/each}

      <!-- Add category card (mobile) -->
      {#if showAddForm}
        <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:13px;font-weight:500;color:var(--mep-fg);">Nueva categoría</div>
          <input
            type="text" maxlength="80"
            bind:value={newCatName}
            placeholder="Nombre de categoría…"
            class="input"
            style="height:40px;font-size:14px;"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn btn-primary"
              style="flex:2;height:40px;justify-content:center;font-size:14px;"
              onclick={addCategory}>Añadir</button>
            <button type="button" class="btn btn-ghost"
              style="flex:1;height:40px;justify-content:center;font-size:14px;"
              onclick={() => { showAddForm = false; newCatName = ''; }}>Cancelar</button>
          </div>
        </div>
      {:else}
        <button type="button" class="card"
          style="padding:14px;display:flex;align-items:center;gap:10px;
            border:1.5px dashed var(--mep-divider);background:transparent;
            color:var(--mep-fg-3);font-size:13.5px;font-weight:500;
            width:100%;cursor:pointer;font-family:inherit;"
          onclick={() => showAddForm = true}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          Añadir categoría
        </button>
      {/if}

    </div>

    <!-- Sticky save button -->
    <div style="
      position:sticky;bottom:0;left:0;right:0;
      padding:12px 16px;
      background:var(--mep-bg);
      border-top:1px solid var(--mep-divider);
    ">
      <button type="submit" class="btn btn-primary"
        style="width:100%;height:44px;justify-content:center;font-size:15px;font-weight:600;">
        {$t('bud.save')}
      </button>
    </div>

  </form>
</div>

