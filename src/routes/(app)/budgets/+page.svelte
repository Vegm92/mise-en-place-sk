<script lang="ts">
  import { forecastFromRunRate, planToDate } from '$lib/dashboard-turno';
  import type { PageData } from './$types';
  import { categoryColor } from '$lib/colors';
  import { enhance } from '$app/forms';
  import { locale, t, tcat, ti } from '$lib/i18n';
  import { fmtEur, semColor } from '$lib/formatters';

  let { data }: { data: PageData } = $props();

  const today = $derived(data.pace.daysElapsed);

  let customCategories = $state<string[]>([]);
  let newCatName = $state('');
  let showAddForm = $state(false);

  const allCategories = $derived([...data.categories, ...customCategories]);

  const isPastMonth = $derived(data.selectedMonth < data.currentMonth);

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
    const plan = planToDate(limit, data.pace);
    const forecast = forecastFromRunRate(spent, data.pace);
    const projected  = limit > 0 ? (forecast / limit) * 100 : 0;
    const vsPlan = limit > 0 ? spent - plan : 0;
    const color = categoryColor(cat);
    return { cat, limit, spent, pct, remaining, plan, forecast, projected, vsPlan, color };
  }));

  let showAllCats = $state(false);
  const activeRows = $derived(rows.filter(r => r.limit > 0 || r.spent > 0 || customCategories.includes(r.cat)));
  const inactiveRows = $derived(rows.filter(r => !(r.limit > 0 || r.spent > 0 || customCategories.includes(r.cat))));

  const totalLimit = $derived(rows.reduce((s, r) => s + r.limit, 0));
  const totalSpent = $derived(rows.reduce((s, r) => s + r.spent, 0));
  const totalPct   = $derived(totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0);
  const totalPlan  = $derived(planToDate(totalLimit, data.pace));
  const totalProjectedPct = $derived(totalLimit > 0 ? (forecastFromRunRate(totalSpent, data.pace) / totalLimit) * 100 : 0);

  const monthLabel = $derived(new Date(data.selectedMonth + '-02').toLocaleString(locale.current, { month: 'long', year: 'numeric' }));
</script>

<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
  <div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">

    <div class="card" style="padding:18px 20px;flex-shrink:0;" data-coach="budgets-main">
      <div class="label" style="margin-bottom:6px;text-transform:capitalize;">{monthLabel} · {t('bud.atDay')} {today}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
        <div class="num text-[32px] font-semibold text-fg tracking-[-0.7px] leading-none">
          {fmtEur(totalSpent, locale.current)}
        </div>
        <div class="text-[13px] text-fg-3">
          {t('bud.of')} <span class="num text-fg-2 font-medium">{fmtEur(totalLimit, locale.current)}</span>
        </div>
        <span class="text-[11px] text-fg-4">{t('bud.exVat')}</span>
      </div>
      {#if totalLimit > 0}
        <div class="h-2 rounded bg-surface-2 overflow-hidden flex">
          {#each rows as r}
            {#if r.limit > 0}
              <span class="h-full shrink-0 border-r border-bg" style="width:{(r.spent / totalLimit) * 100}%;background:{r.color};"></span>
            {/if}
          {/each}
        </div>
        <div class="flex justify-between text-[11.5px] text-fg-3 mt-2">
          <span>
            <span class="num" style="color:{semColor(totalPct)};font-weight:600;">{totalPct.toFixed(1).replace('.',',')}%</span>
            {t('bud.used')} · {t('bud.projectionClose')} {totalProjectedPct.toFixed(0)}% {t('bud.atClose')} · {t('bud.colPlan')} <span class="num">{fmtEur(totalPlan, locale.current)}</span>
          </span>
          <span class="num">{fmtEur(totalLimit - totalSpent, locale.current)} {t('bud.remaining')}</span>
        </div>
      {:else}
        <div class="text-[13px] text-fg-3">{t('bud.emptyDesktop')}</div>
      {/if}
    </div>

    <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
      <div class="px-4 py-3 flex items-center justify-between border-b border-divider shrink-0">
        <div>
          <div class="subtitle">{t('bud.tableTitle')}</div>
          <div class="text-[12px] text-fg-3 mt-0.5">{t('bud.tableSub')}</div>
        </div>
      </div>

      <div style="overflow:auto;flex:1;">
        <form method="post" action="?/save" use:enhance>
          <input type="hidden" name="_categories" value={JSON.stringify(allCategories)} />
          <input type="hidden" name="_month" value={data.selectedMonth} />
          <table class="tbl" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:22%;">{t('bud.colCategory')}</th>
                <th class="num" style="width:160px;">{t('bud.colBudget')}</th>
                <th class="num" style="width:130px;">{t('bud.colSpent')}</th>
                <th class="num" style="width:130px;">{t('bud.colRemaining')}</th>
                <th style="min-width:120px;">{t('bud.colProgress')}</th>
                <th class="num" style="width:70px;">%</th>
                <th style="width:100px;">{t('bud.colProjection')}</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r}
                {@const projOver = r.limit > 0 && r.projected > 100}
                <tr class="row">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="width:14px;height:14px;border-radius:3px;background:{r.color};flex-shrink:0;"></span>
                      <span class="text-[13px] font-medium text-fg">{tcat(r.cat)}</span>
                    </div>
                  </td>
                  <td class="num">
                    {#if isPastMonth}
                      <div class="num h-[30px] text-[12.5px] w-[130px] text-right flex items-center justify-end px-2 bg-surface-2 border-b border-divider text-fg-2">
                        {r.limit > 0 ? r.limit : t('bud.noLimit')}
                      </div>
                    {:else}
                      <input type="number" step="0.01" min="0"
                        name={r.cat}
                        value={r.limit > 0 ? r.limit : ''}
                        placeholder={t('bud.noLimit')}
                        class="input"
                        style="height:30px;width:130px;text-align:right;" />
                    {/if}
                  </td>
                  <td class="num text-fg-2">{fmtEur(r.spent, locale.current)}</td>
                  <td class="num" class:text-neg={r.limit > 0 && r.remaining < 0} class:text-fg-2={!(r.limit > 0 && r.remaining < 0)} class:font-medium={r.limit > 0 && r.remaining < 0}>
                    {r.limit > 0 ? fmtEur(r.remaining, locale.current) : '—'}
                  </td>
                  <td>
                    {#if r.limit > 0}
                      <div class="relative h-2 rounded bg-surface-2 overflow-visible">
                        <div class="h-full rounded" style="width:{Math.min(r.pct, 100)}%;background:{semColor(r.pct)};"></div>
                        {#if r.pct > 100}
                          <div style="position:absolute;left:100%;top:0;bottom:0;width:{Math.min(r.pct - 100, 40)}%;
                            background:repeating-linear-gradient(45deg,var(--mep-neg),var(--mep-neg) 4px,var(--mep-neg-soft) 4px,var(--mep-neg-soft) 8px);
                            border-radius:0 4px 4px 0;"></div>
                        {/if}
                        <div class="absolute left-[80%] -top-[3px] -bottom-[3px] w-[1.5px] bg-fg-3 opacity-40"></div>
                      </div>
                    {:else}
                      <span class="text-[11.5px] text-fg-4">{t('bud.noBudget')}</span>
                    {/if}
                  </td>
                  <td class="num font-semibold" class:text-fg-3={r.limit <= 0} style="{r.limit > 0 ? `color:${semColor(r.pct)}` : ''}">
                    {r.limit > 0 ? Math.round(r.pct) + '%' : '—'}
                  </td>
                  <td>
                    {#if r.limit > 0}
                      <span class="num text-[11px] font-medium py-0.5 px-1.5 rounded inline-flex items-center gap-[3px]"
                        class:bg-neg-soft={projOver} class:text-neg={projOver}
                        class:bg-pos-soft={!projOver} class:text-pos={!projOver}
                      >{projOver ? '↑' : '✓'} {Math.round(r.projected)}%</span>
                    {:else}
                      <span class="text-fg-4 text-[11.5px]">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
              {#if !isPastMonth}
                {#if showAddForm}
                  <tr>
                    <td colspan={7} class="px-3 py-2 bg-surface-2">
                      <div class="flex items-center gap-2">
                        <input
                          type="text" maxlength="80"
                          bind:value={newCatName}
                          placeholder={t('bud.namePlaceholder')}
                          class="input"
                          style="height:30px;width:220px;"
                          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                        />
                        <button type="button" class="btn btn-primary" style="height:30px;font-size:12.5px;"
                          onclick={addCategory}>{t('bud.add')}</button>
                        <button type="button" class="btn btn-ghost" style="height:30px;font-size:12.5px;"
                          onclick={() => { showAddForm = false; newCatName = ''; }}>{t('edit.cancel')}</button>
                      </div>
                    </td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan={7} class="p-0 bg-surface-2">
                      <button type="button"
                        class="w-full text-left px-3 py-2.5 cursor-pointer text-fg-3 text-[12.5px] font-medium bg-transparent border-0 flex items-center gap-1.5 [font:inherit]"
                        onclick={() => showAddForm = true}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
                          <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                        </svg>
                        {t('bud.addCategory')}
                      </button>
                    </td>
                  </tr>
                {/if}
              {/if}
            </tbody>
            {#if totalLimit > 0}
              <tfoot>
                <tr>
                  <td class="font-semibold text-fg text-[13px] p-3">{t('bud.total')}</td>
                  <td class="num font-semibold text-[13px]">{fmtEur(totalLimit, locale.current)}</td>
                  <td class="num font-semibold text-[13px]">{fmtEur(totalSpent, locale.current)}</td>
                  <td class="num font-semibold text-[13px] text-fg-2">{fmtEur(totalLimit - totalSpent, locale.current)}</td>
                  <td colspan={2} class="num" style="font-weight:600;font-size:13px;color:{semColor(totalPct)};">
                    {totalPct.toFixed(1).replace('.',',')}%
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            {/if}
          </table>
          {#if !isPastMonth}
            <div class="px-4 py-3.5 border-t border-divider">
              <button type="submit" class="btn btn-primary" style="height:36px;">{t('bud.save')}</button>
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
          <div class="label">{t('bud.atDay')} {today}</div>
          </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <div class="num text-[30px] font-semibold text-fg tracking-[-0.6px] leading-none">
            {fmtEur(totalSpent, locale.current)}
          </div>
          <div class="text-[12.5px] text-fg-3">
            {t('bud.of')} <span class="num text-fg-2 font-medium">{fmtEur(totalLimit, locale.current)}</span>
          </div>
        </div>
        <div class="text-[11px] text-fg-4 mb-2">{t('bud.exVat')}</div>
        {#if totalLimit > 0}
          <div class="h-2 rounded bg-surface-2 overflow-hidden flex mb-2.5">
            {#each activeRows as r}
              {#if r.limit > 0}
                <span class="h-full shrink-0 border-r border-bg" style="width:{(r.spent / totalLimit) * 100}%;background:{r.color};"></span>
              {/if}
            {/each}
          </div>
          <div class="flex justify-between text-[11.5px] text-fg-3">
            <span>
              <span class="num" style="color:{semColor(totalPct)};font-weight:600;">{totalPct.toFixed(1).replace('.',',')}%</span>
              · {t('bud.projectionClose')} {totalProjectedPct.toFixed(0)}% {t('bud.atClose')} · {t('bud.colPlan')} <span class="num">{fmtEur(totalPlan, locale.current)}</span>
            </span>
            <span class="num">{fmtEur(totalLimit - totalSpent, locale.current)} {t('bud.remaining')}</span>
          </div>
        {:else}
          <div class="text-[13px] text-fg-3">
            {t('bud.emptyMobile')}
          </div>
        {/if}
      </div>

      <div style="padding:4px 2px 0;">
        <div class="subtitle" style="font-size:14px;">{t('bud.tableTitle')}</div>
      </div>

      {#snippet budgetCard(r: (typeof rows)[number])}
        {@const projOver = r.limit > 0 && r.projected > 100}
        <div class="card" style="padding:14px;">

          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="width:8px;height:28px;border-radius:2px;background:{r.color};flex-shrink:0;"></span>
            <span class="flex-1 min-w-0 text-[14px] font-medium text-fg overflow-hidden text-ellipsis whitespace-nowrap">{tcat(r.cat)}</span>
            {#if r.limit > 0}
              <span class="num text-[11px] font-medium py-0.5 px-[7px] rounded min-w-0"
                class:bg-neg-soft={projOver} class:text-neg={projOver}
                class:bg-pos-soft={!projOver} class:text-pos={!projOver}
              >{projOver ? '↑' : '✓'} {Math.round(r.projected)}% {t('bud.closeShort')}</span>
            {/if}
          </div>

          {#if r.limit > 0}
            <div class="relative h-[7px] rounded bg-surface-2 overflow-visible mb-2.5">
              <div class="h-full rounded" style="width:{Math.min(r.pct, 100)}%;background:{semColor(r.pct)};"></div>
              {#if r.pct > 100}
                <div style="position:absolute;left:100%;top:0;bottom:0;width:{Math.min(r.pct - 100, 40)}%;
                  background:repeating-linear-gradient(45deg,var(--mep-neg),var(--mep-neg) 4px,var(--mep-neg-soft) 4px,var(--mep-neg-soft) 8px);
                  border-radius:0 4px 4px 0;"></div>
              {/if}
              <div class="absolute left-[80%] -top-[3px] -bottom-[3px] w-[1.5px] bg-fg-3 opacity-40"></div>
            </div>
          {/if}

          <div class="flex items-center justify-between mb-2.5">
            <div>
              <span class="num text-[13.5px] font-semibold text-fg">{fmtEur(r.spent, locale.current)}</span>
              {#if r.limit > 0}
                <span class="text-[11.5px] text-fg-3"> · {fmtEur(r.limit, locale.current)}</span>
              {/if}
            </div>
            <span class="num text-[13.5px] font-semibold" class:text-fg-3={r.limit <= 0} style="{r.limit > 0 ? `color:${semColor(r.pct)}` : ''}">
              {r.limit > 0 ? Math.round(r.pct) + '%' : '—'}
            </span>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            <label for="budget-{r.cat}" class="text-[11px] text-fg-3 font-medium whitespace-nowrap">{t('bud.colBudget')}</label>
            {#if isPastMonth}
              <div class="num flex-1 h-[34px] text-[13px] text-right flex items-center justify-end px-2 bg-surface-2 border-b border-divider text-fg-2">
                {r.limit > 0 ? r.limit : t('bud.noLimit')}
              </div>
            {:else}
              <input type="number" step="0.01" min="0"
                id="budget-{r.cat}"
                name={r.cat}
                value={r.limit > 0 ? r.limit : ''}
                placeholder={t('bud.noLimit')}
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
        <button type="button" class="card p-3.5 flex items-center justify-center gap-2 bg-transparent border border-divider text-fg-3 text-[13px] font-medium w-full cursor-pointer font-[inherit]"
          aria-expanded={showAllCats}
          onclick={() => showAllCats = !showAllCats}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"
            style="transform:rotate({showAllCats ? 180 : 0}deg);transition:transform 0.15s;">
            <path d="M2 4.5 L6 8.5 L10 4.5" />
          </svg>
          {showAllCats ? t('bud.hideAllCategories') : ti('bud.showAllCategories', { n: inactiveRows.length })}
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
          <div class="text-[13px] font-medium text-fg">{t('bud.newCategory')}</div>
          <input
            type="text" maxlength="80"
            bind:value={newCatName}
            placeholder={t('bud.namePlaceholder')}
            class="input"
            style="height:40px;"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn btn-primary"
              style="flex:2;height:40px;justify-content:center;font-size:14px;"
              onclick={addCategory}>{t('bud.add')}</button>
            <button type="button" class="btn btn-ghost"
              style="flex:1;height:40px;justify-content:center;font-size:14px;"
              onclick={() => { showAddForm = false; newCatName = ''; }}>{t('edit.cancel')}</button>
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
          {t('bud.addCategory')}
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
        {t('bud.save')}
      </button>
    </div>
    {/if}

  </form>
</div>

