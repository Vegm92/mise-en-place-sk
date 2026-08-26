<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const TH = 'padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;';
  const TD = 'padding:9px 16px;color:var(--mep-fg-2);';

  function day(v: string) { return new Date(v).toLocaleDateString('en-GB'); }
</script>

<AdminPageHead route="/admin/access" title={$t('admin.access.title')} subtitle={$t('admin.access.subtitle')} />

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:14px;">

  <div class="card" style="padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:220px;">
      <div style="font-size:13.5px;font-weight:600;color:var(--mep-fg);margin-bottom:2px;">
        {data.accessOpen ? $t('admin.access.stateOpen') : $t('admin.access.stateClosed')}
      </div>
      <div style="font-size:12.5px;color:var(--mep-fg-3);">
        {data.accessOpen ? $t('admin.access.stateOpenDesc') : $t('admin.access.stateClosedDesc')}
      </div>
    </div>
    <form method="POST" action="?/toggleAccess" use:enhance>
      <input type="hidden" name="open" value={data.accessOpen ? 'false' : 'true'} />
      <button type="submit" class={data.accessOpen ? 'btn btn-secondary' : 'btn btn-primary'}
        style="height:34px;padding:0 16px;font-size:13px;">
        {data.accessOpen ? $t('admin.access.close') : $t('admin.access.open')}
      </button>
    </form>
  </div>

  {#if !data.founderCoupon}
    <div class="card" style="padding:12px 16px;font-size:12.5px;color:var(--mep-fg-3);">
      {$t('admin.access.noCoupon')}
    </div>
  {/if}

  {#if form?.error}
    <div class="card" style="padding:12px 16px;font-size:13px;color:var(--mep-neg);background:var(--mep-neg-soft);border-color:var(--mep-neg-soft);">
      {$t('admin.access.actionFailed')}
    </div>
  {/if}

  <SectionCard title={$t('admin.access.accounts')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th style={TH}>{$t('admin.access.colEmail')}</th>
            <th style={TH}>{$t('admin.access.colStatus')}</th>
            <th style={TH}>{$t('admin.access.colCreated')}</th>
            <th style="{TH}text-align:right;">{$t('admin.access.colAction')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.accounts as a}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="{TD}color:var(--mep-fg);font-weight:500;">
                {a.email}
                {#if a.founder}
                  <span style="margin-left:6px;font-size:11px;font-weight:600;letter-spacing:0.08em;
                               text-transform:uppercase;color:var(--mep-acc);">{$t('admin.access.founder')}</span>
                {/if}
                {#if !a.email_verified}
                  <span style="margin-left:6px;font-size:11px;color:var(--mep-fg-4);">{$t('admin.access.unverified')}</span>
                {/if}
              </td>
              <td style={TD}>
                <span style="color:{a.access_status === 'approved' ? 'var(--mep-pos)' : 'var(--mep-fg-3)'};">
                  {a.access_status === 'approved' ? $t('admin.access.approved') : $t('admin.access.pending')}
                </span>
              </td>
              <td style="{TD}font-size:12px;color:var(--mep-fg-3);">{day(a.created_at)}</td>
              <td style="{TD}text-align:right;">
                <form method="POST" action={a.access_status === 'approved' ? '?/revoke' : '?/approve'} use:enhance
                  style="display:inline;">
                  <input type="hidden" name="userId" value={a.id} />
                  <button type="submit" class="btn btn-secondary" style="height:28px;padding:0 12px;font-size:12px;">
                    {a.access_status === 'approved' ? $t('admin.access.revoke') : $t('admin.access.approve')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="4" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">
                {$t('admin.access.noAccounts')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.access.waitlist')} noPad>
    <div style="padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--mep-divider);">
      <form method="POST" action="?/addEmail" use:enhance style="display:flex;gap:6px;flex:1;min-width:240px;">
        <input type="email" name="email" required placeholder={$t('admin.access.addEmailPh')}
          style="flex:1;min-width:180px;height:30px;padding:0 10px;font-size:12px;border:1px solid var(--mep-divider);border-radius:6px;background:var(--mep-bg);color:var(--mep-fg);" />
        <button type="submit" class="btn btn-secondary" style="height:30px;padding:0 12px;font-size:12px;">
          {$t('admin.access.addEmail')}
        </button>
      </form>
      {#if data.promoCode}
        <form method="POST" action="?/sendPromoAll" use:enhance style="display:inline;">
          <button type="submit" class="btn btn-secondary" style="height:30px;padding:0 12px;font-size:12px;">
            {$t('admin.access.sendPromoAll')}
          </button>
        </form>
      {/if}
    </div>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th style={TH}>{$t('admin.access.colEmail')}</th>
            <th style={TH}>{$t('admin.access.colJoined')}</th>
            <th style="{TH}text-align:right;">{$t('admin.access.colAction')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.pendingInvites as w}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="{TD}color:var(--mep-fg);font-weight:500;">{w.email}</td>
              <td style="{TD}font-size:12px;color:var(--mep-fg-3);">{day(w.created_at)}</td>
              <td style="{TD}text-align:right;display:flex;gap:6px;justify-content:flex-end;">
                {#if data.promoCode}
                  <form method="POST" action="?/sendPromo" use:enhance style="display:inline;">
                    <input type="hidden" name="email" value={w.email} />
                    <button type="submit" class="btn btn-secondary" style="height:28px;padding:0 12px;font-size:12px;">
                      {$t('admin.access.sendPromo')}
                    </button>
                  </form>
                {/if}
                <form method="POST" action="?/invite" use:enhance style="display:inline;">
                  <input type="hidden" name="email" value={w.email} />
                  <button type="submit" class="btn btn-secondary" style="height:28px;padding:0 12px;font-size:12px;">
                    {$t('admin.access.invite')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">
                {$t('admin.access.noWaitlist')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

</div>
