<script lang="ts">
  import type { WorkItem } from '$lib/dashboard-turno';
  import { WORK_ICON, WORK_TONE, localiseWorkDates } from '$lib/components/turno/work-item-ui';
  import { locale, t, ti, tiv } from '$lib/i18n';
  import { fmtEurCompact } from '$lib/formatters';

  let { item, primary = false }: { item: WorkItem; primary?: boolean } = $props();

  const titleVars = $derived(localiseWorkDates(item.titleVars, locale.current));
  const whyVars = $derived(localiseWorkDates(item.whyVars, locale.current));
  const Icon = $derived(WORK_ICON[item.kind]);
  const color = $derived(WORK_TONE[item.severity][0]);
  const soft = $derived(WORK_TONE[item.severity][1]);
</script>

<div
  class="card"
  style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;
         border-color:{primary ? color : 'var(--mep-border)'};
         box-shadow:{primary ? `inset 3px 0 0 ${color}, var(--mep-shadow-card)` : 'var(--mep-shadow-card)'};"
>
  <div style="display:flex;align-items:flex-start;gap:11px;">
    <div style="width:34px;height:34px;border-radius:var(--mep-r-input);background:{soft};color:{color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <Icon size={17} />
    </div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
        <span class="label">{t(`turno.kind.${item.kind}`)}</span>
        <span style="font-size:11px;color:var(--mep-fg-4);">·</span>
        <span style="font-size:11px;color:var(--mep-fg-3);">{ti(item.urgencyKey, item.urgencyVars)}</span>
      </div>
      <div class="subtitle" style="line-height:1.3;text-wrap:pretty;">{tiv(item.titleKey, titleVars)}</div>
    </div>
    {#if item.eur > 0}
      <div style="text-align:right;flex-shrink:0;">
        <div class="num" style="font-size:20px;font-weight:600;letter-spacing:-0.02em;line-height:1.1;color:var(--mep-fg);">
          {fmtEurCompact(item.eur, locale.current)}
        </div>
        <div class="label">{t('turno.atStakeUnit')}</div>
      </div>
    {/if}
  </div>
  <div style="display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--mep-divider);">
    <span class="body" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
      {tiv(item.whyKey, whyVars)}
    </span>
    <a
      href={item.href}
      class="btn {primary ? 'btn-primary' : 'btn-secondary'}"
      style="flex-shrink:0;text-decoration:none;"
    >{t(item.actionKey)}</a>
  </div>
</div>
