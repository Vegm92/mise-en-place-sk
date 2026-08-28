<script lang="ts">
  import type { PageData } from './$types';
  import { categoryColor } from '$lib/colors';
  import { enhance } from '$app/forms';
  import { locale, t, tcat, ti } from '$lib/i18n';
  import { fmtEur, semColor, shiftMonth } from '$lib/formatters';
  import PeriodPicker from '$lib/components/mep/PeriodPicker.svelte';

  let { data }: { data: PageData } = $props();

  const today = new Date().getDate();

  let customCategories = $state<string[]>([]);
  let newCatName = $state('');
  let showAddForm = $state(false);

  const allCategories = $derived([...data.categories, ...customCategories]);

  const isPastMonth = $derived(data.selectedMonth < data.currentMonth);
  const prevMonthUrl = $derived(`/budgets?month=${shiftMonth(data.selectedMonth, -1)}`);
  const nextMonthUrl = $derived(`/budgets?month=${shiftMonth(data.selectedMonth, 1)}`);
  const canGoForward = $derived(data.selectedMonth < data.currentMonth);

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
    const color = categoryColor(cat);
    return { cat, limit, spent, pct, remaining, projected, color };
  }));

  let showAllCats = $state(false);
  const activeRows = $derived(rows.filter(r => r.limit > 0 || r.spent > 0 || customCategories.includes(r.cat)));
  const inactiveRows = $derived(rows.filter(r => !(r.limit > 0 || r.spent > 0 || customCategories.includes(r.cat))));

  const totalLimit = $derived(rows.reduce((s, r) => s + r.limit, 0));
  const totalSpent = $derived(rows.reduce((s, r) => s + r.spent, 0));
  const totalPct   = $derived(totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0);

  const monthLabel = $derived(new Date(data.selectedMonth + '-02').toLocaleString($locale, { month: 'long', year: 'numeric' }));
</script>

<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
  <div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">

    <div class="card" style="padding:18px 20px;flex-shrink:0;" data-coach="budgets-main">
      <div class="label" style="margin-bottom:6px;text-transform:capitalize;">{monthLabel} · {$t('bud.atDay')} {today}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;">
        <div class="num" style="font-size:32px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.7px;line-height:1;">
          {fmtEur(totalSpent, $locale)}
        </div>
        <div style="font-size:13px;color:var(--mep-fg-3);">
          {$t('bud.of')} <span class="num" style="color:var(--mep-fg-2);font-weight:500;">{fmtEur(totalLimit, $locale)}</span>
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
            {$t('bud.used')} · {$t('bud.projectionClose')} {(totalPct * 31 / today).toFixed(0)}% {$t('bud.atClose')}
          </span>
          <span class="num">{fmtEur(totalLimit - totalSpent, $locale)} {$t('bud.remaining')}</span>
        </div>
      {:else}
        <div style="font-size:13px;color:var(--mep-fg-3);">{$t('bud.emptyDesktop')}</div>
      {/if}
    </div>

    <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
      <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--mep-divider);flex-shrink:0;">
        <div>
          <div class="subtitle">{$t('bud.tableTitle')}</div>
          <div style="font-size:12px;color:var(--mep-fg-3);margin-top:2px;">{$t('bud.tableSub')}</div>
        </div>
        <PeriodPicker prevUrl={prevMonthUrl} nextUrl={nextMonthUrl} {canGoForward} label={monthLabel} compact />
      </div>

      <div style="overflow:auto;flex:1;">
        <form method="post" action="?/save" use:enhance>
          <input type="hidden" name="_categories" value={JSON.stringify(allCategories)} />
          <input type="hidden" name="_month" value={data.selectedMonth} />
          <table class="tbl" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:22%;">{$t('bud.colCategory')}</th>
                <th class="num" style="width:160px;">{$t('bud.colBudget')}</th>
                <th class="num" style="width:130px;">{$t('bud.colSpent')}</th>
                <th class="num" style="width:130px;">{$t('bud.colRemaining')}</th>
                <th style="min-width:120px;">{$t('bud.colProgress')}</th>
                <th class="num" style="width:70px;">%</th>
                <th style="width:100px;">{$t('bud.colProjection')}</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r}
                {@const projOver = r.limit > 0 && r.projected > 100}
                <tr class="row">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="width:14px;height:14px;border-radius:3px;background:{r.color};flex-shrink:0;"></span>
                      <span style="font-size:13px;font-weight:500;color:var(--mep-fg);">{$tcat(r.cat)}</span>
                    </div>
                  </td>
                  <td class="num">
                    {#if isPastMonth}
                      <div class="num" style="height:30px;font-size:12.5px;width:130px;text-align:right;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;background:var(--mep-surface-2);border-bottom:1px solid var(--mep-divider);color:var(--mep-fg-2);">
                        {r.limit > 0 ? r.limit : $t('bud.noLimit')}
                      </div>
                    {:else}
                      <input type="number" step="0.01" min="0"
                        name={r.cat}
                        value={r.limit > 0 ? r.limit : ''}
                        placeholder={$t('bud.noLimit')}
                        class="input"
                        style="height:30px;width:130px;text-align:right;" />
                    {/if}
                  </td>
                  <td class="num" style="color:var(--mep-fg-2);">{fmtEur(r.spent, $locale)}</td>
                  <td class="num" style="color:{r.limit > 0 && r.remaining < 0 ? 'var(--mep-neg)' : 'var(--mep-fg-2)'};font-weight:{r.limit > 0 && r.remaining < 0 ? 500 : 400};">
                    {r.limit > 0 ? fmtEur(r.remaining, $locale) : '—'}
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
                      <span style="font-size:11.5px;color:var(--mep-fg-4);">{$t('bud.noBudget')}</span>
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
              {#if !isPastMonth}
                {#if showAddForm}
                  <tr>
                    <td colspan={7} style="padding:8px 12px;background:var(--mep-surface-2);">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <input
                          type="text" maxlength="80"
                          bind:value={newCatName}
                          placeholder={$t('bud.namePlaceholder')}
                          class="input"
                          style="height:30px;width:220px;"
                          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                        />
                        <button type="button" class="btn btn-primary" style="height:30px;font-size:12.5px;"
                          onclick={addCategory}>{$t('bud.add')}</button>
                        <button type="button" class="btn btn-ghost" style="height:30px;font-size:12.5px;"
                          onclick={() => { showAddForm = false; newCatName = ''; }}>{$t('edit.cancel')}</button>
                      </div>
                    </td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan={7} style="padding:0;background:var(--mep-surface-2);">
                      <button type="button"
                        style="width:100%;text-align:left;padding:10px 12px;cursor:pointer;color:var(--mep-fg-3);font-size:12.5px;font-weight:500;background:transparent;border:none;font:inherit;display:flex;align-items:center;gap:6px;"
                        onclick={() => showAddForm = true}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
                          <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                        </svg>
                        {$t('bud.addCategory')}
                      </button>
                    </td>
                  </tr>
                {/if}
              {/if}
            </tbody>
            {#if totalLimit > 0}
              <tfoot>
                <tr>
                  <td style="font-weight:600;color:var(--mep-fg);font-size:13px;padding:12px;">{$t('bud.total')}</td>
                  <td class="num" style="font-weight:600;font-size:13px;">{fmtEur(totalLimit, $locale)}</td>
                  <td class="num" style="font-weight:600;font-size:13px;">{fmtEur(totalSpent, $locale)}</td>
                  <td class="num" style="font-weight:600;font-size:13px;color:var(--mep-fg-2);">{fmtEur(totalLimit - totalSpent, $locale)}</td>
                  <td colspan={2} class="num" style="font-weight:600;font-size:13px;color:{semColor(totalPct)};">
                    {totalPct.toFixed(1).replace('.',',')}%
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            {/if}
          </table>
          {#if !isPastMonth}
            <div style="padding:14px 16px;border-top:1px solid var(--mep-divider);">
              <button type="submit" class="btn btn-primary" style="height:36px;">{$t('bud.save')}</button>
            </div>
          {/if}
        </form>
      </div>
    </div>

  </div>
</div>

<div class="flex md:hidden" style="height:100%;flex-direction:column;overflow:hidden;">
  <form method="post" action="?/save" use:enhance style="display:contents;">
    <input type="hidden" name="_categories" value={JSON.stringify(allCategories)} />
    <input type="hidden" name="_month" value={data.selectedMonth} />

    <div style="flex:1;overflow-y:auto;padding:14px 16px 100px;display:flex;flex-direction:column;gap:12px;">

      <div class="card" style="padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div class="label">{$t('bud.atDay')} {today}</div>
          <PeriodPicker prevUrl={prevMonthUrl} nextUrl={nextMonthUrl} {canGoForward} label={monthLabel} compact />
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
          <div class="num" style="font-size:30px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.6px;line-height:1;">
            {fmtEur(totalSpent, $locale)}
          </div>
          <div style="font-size:12.5px;color:var(--mep-fg-3);">
            {$t('bud.of')} <span class="num" style="color:var(--mep-fg-2);font-weight:500;">{fmtEur(totalLimit, $locale)}</span>
          </div>
        </div>
        {#if totalLimit > 0}
          <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;display:flex;margin-bottom:10px;">
            {#each activeRows as r}
              {#if r.limit > 0}
                <span style="width:{(r.spent / totalLimit) * 100}%;height:100%;background:{r.color};border-right:1px solid var(--mep-bg);flex-shrink:0;"></span>
              {/if}
            {/each}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--mep-fg-3);">
            <span>
              <span class="num" style="color:{semColor(totalPct)};font-weight:600;">{totalPct.toFixed(1).replace('.',',')}%</span>
              · {$t('bud.projectionClose')} {(totalPct * 31 / today).toFixed(0)}% {$t('bud.atClose')}
            </span>
            <span class="num">{fmtEur(totalLimit - totalSpent, $locale)} {$t('bud.remaining')}</span>
          </div>
        {:else}
          <div style="font-size:13px;color:var(--mep-fg-3);">
            {$t('bud.emptyMobile')}
          </div>
        {/if}
      </div>

      <div style="padding:4px 2px 0;">
        <div class="subtitle" style="font-size:14px;">{$t('bud.tableTitle')}</div>
      </div>

      {#snippet budgetCard(r: (typeof rows)[number])}
        {@const projOver = r.limit > 0 && r.projected > 100}
        <div class="card" style="padding:14px;">

          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="width:8px;height:28px;border-radius:2px;background:{r.color};flex-shrink:0;"></span>
            <span style="flex:1;min-width:0;font-size:14px;font-weight:500;color:var(--mep-fg);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{$tcat(r.cat)}</span>
            {#if r.limit > 0}
              <span class="num" style="
                font-size:11px;font-weight:500;padding:2px 7px;border-radius:4px;min-width:0;
                background:{projOver ? 'var(--mep-neg-soft)' : 'var(--mep-pos-soft)'};
                color:{projOver ? 'var(--mep-neg)' : 'var(--mep-pos)'};
              ">{projOver ? '↑' : '✓'} {Math.round(r.projected)}% {$t('bud.closeShort')}</span>
            {/if}
          </div>

          {#if r.limit > 0}
            <div style="position:relative;height:7px;border-radius:4px;background:var(--mep-surface-2);overflow:visible;margin-bottom:10px;">
              <div style="width:{Math.min(r.pct, 100)}%;height:100%;border-radius:4px;background:{semColor(r.pct)};"></div>
              {#if r.pct > 100}
                <div style="position:absolute;left:100%;top:0;bottom:0;width:{Math.min(r.pct - 100, 40)}%;
                  background:repeating-linear-gradient(45deg,var(--mep-neg),var(--mep-neg) 4px,var(--mep-neg-soft) 4px,var(--mep-neg-soft) 8px);
                  border-radius:0 4px 4px 0;"></div>
              {/if}
              <div style="position:absolute;left:80%;top:-3px;bottom:-3px;width:1.5px;background:var(--mep-fg-3);opacity:0.4;"></div>
            </div>
          {/if}

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div>
              <span class="num" style="font-size:13.5px;font-weight:600;color:var(--mep-fg);">{fmtEur(r.spent, $locale)}</span>
              {#if r.limit > 0}
                <span style="font-size:11.5px;color:var(--mep-fg-3);"> · {fmtEur(r.limit, $locale)}</span>
              {/if}
            </div>
            <span class="num" style="font-size:13.5px;font-weight:600;color:{r.limit > 0 ? semColor(r.pct) : 'var(--mep-fg-3)'};">
              {r.limit > 0 ? Math.round(r.pct) + '%' : '—'}
            </span>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            <label for="budget-{r.cat}" style="font-size:11px;color:var(--mep-fg-3);font-weight:500;white-space:nowrap;">{$t('bud.colBudget')}</label>
            {#if isPastMonth}
              <div class="num" style="flex:1;height:34px;font-size:13px;text-align:right;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;background:var(--mep-surface-2);border-bottom:1px solid var(--mep-divider);color:var(--mep-fg-2);">
                {r.limit > 0 ? r.limit : $t('bud.noLimit')}
              </div>
            {:else}
              <input type="number" step="0.01" min="0"
                id="budget-{r.cat}"
                name={r.cat}
                value={r.limit > 0 ? r.limit : ''}
                placeholder={$t('bud.noLimit')}
                class="input"
                style="flex:1;height:34px;text-align:right;" />
            {/if}
          </div>
        </div>
      {/snippet}

      {#each activeRows as r (r.cat)}
        {@render budgetCard(r)}
      {/each}

      {#if inactiveRows.length > 0}
        <button type="button" class="card"
          style="padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;
            background:transparent;border:1px solid var(--mep-divider);
            color:var(--mep-fg-3);font-size:13px;font-weight:500;
            width:100%;cursor:pointer;font-family:inherit;"
          aria-expanded={showAllCats}
          onclick={() => showAllCats = !showAllCats}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"
            style="transform:rotate({showAllCats ? 180 : 0}deg);transition:transform 0.15s;">
            <path d="M2 4.5 L6 8.5 L10 4.5" />
          </svg>
          {showAllCats ? $t('bud.hideAllCategories') : $ti('bud.showAllCategories', { n: inactiveRows.length })}
        </button>
        <div style:display={showAllCats ? 'flex' : 'none'} style="flex-direction:column;gap:12px;">
          {#each inactiveRows as r (r.cat)}
            {@render budgetCard(r)}
          {/each}
        </div>
      {/if}

      {#if !isPastMonth}
      {#if showAddForm}
        <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:13px;font-weight:500;color:var(--mep-fg);">{$t('bud.newCategory')}</div>
          <input
            type="text" maxlength="80"
            bind:value={newCatName}
            placeholder={$t('bud.namePlaceholder')}
            class="input"
            style="height:40px;"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn btn-primary"
              style="flex:2;height:40px;justify-content:center;font-size:14px;"
              onclick={addCategory}>{$t('bud.add')}</button>
            <button type="button" class="btn btn-ghost"
              style="flex:1;height:40px;justify-content:center;font-size:14px;"
              onclick={() => { showAddForm = false; newCatName = ''; }}>{$t('edit.cancel')}</button>
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
          {$t('bud.addCategory')}
        </button>
      {/if}
      {/if}

    </div>

    {#if !isPastMonth}
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
    {/if}

  </form>
</div>

