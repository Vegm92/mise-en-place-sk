<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let query = $state('');
  let statusSel = $state('');
  const visibleAccounts = $derived(data.accounts.filter(a =>
    (!statusSel || a.access_status === statusSel) &&
    (!query || a.email.toLowerCase().includes(query.toLowerCase()))
  ));

  function day(v: string) { return new Date(v).toLocaleDateString('en-GB'); }
</script>

<AdminPageHead route="/admin/access" title={t('admin.access.title')} subtitle={t('admin.access.subtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <HudPanel title={data.accessOpen ? t('admin.access.stateOpen') : t('admin.access.stateClosed')}
    sub={data.accessOpen ? t('admin.access.stateOpenDesc') : t('admin.access.stateClosedDesc')}>
    <div style="padding:12px 14px;display:flex;justify-content:flex-end;">
      <form method="POST" action="?/toggleAccess" use:enhance>
        <input type="hidden" name="open" value={data.accessOpen ? 'false' : 'true'} />
        <button type="submit" class={data.accessOpen ? 'btn btn-secondary' : 'btn btn-primary'}
          style="height:34px;padding:0 16px;font-size:13px;">
          {data.accessOpen ? t('admin.access.close') : t('admin.access.open')}
        </button>
      </form>
    </div>
  </HudPanel>

  {#if !data.founderCoupon}
    <div style="background:#0a0c11;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;font:500 12px/1.4 ui-monospace, monospace;color:#5b6472;">
      {t('admin.access.noCoupon')}
    </div>
  {/if}

  {#if form?.error}
    <div style="background:#0a0c11;border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:12px 14px;font:500 12px/1.4 ui-monospace, monospace;color:#f87171;">
      {t('admin.access.actionFailed')}
    </div>
  {/if}

  <HudPanel title={t('admin.access.accounts')}>
    <div style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.08);">
      <input
        type="search"
        bind:value={query}
        placeholder={t('admin.access.searchPh')}
        class="input"
        style="flex:1;min-width:200px;height:30px;"
      />
      <select bind:value={statusSel} class="input" style="height:30px;">
        <option value="">{t('admin.all')}</option>
        <option value="approved">{t('admin.access.approved')}</option>
        <option value="pending">{t('admin.access.pending')}</option>
      </select>
      <span class="num text-xs text-fg-3">{visibleAccounts.length}/{data.accounts.length}</span>
    </div>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.access.colEmail')}</th>
            <th scope="col" class="l">{t('admin.access.colStatus')}</th>
            <th scope="col" class="r">{t('admin.access.colCreated')}</th>
            <th scope="col" class="r">{t('admin.access.colAction')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleAccounts as a}
            <tr>
              <td>
                {a.email}
                {#if a.founder}<span style="margin-left:6px;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#38bdf8;">{t('admin.access.founder')}</span>{/if}
                {#if !a.email_verified}<span style="margin-left:6px;font-size:10px;color:#5b6472;">{t('admin.access.unverified')}</span>{/if}
              </td>
              <td class:good={a.access_status === 'approved'} class:dim={a.access_status !== 'approved'}>
                {a.access_status === 'approved' ? t('admin.access.approved') : t('admin.access.pending')}
              </td>
              <td class="r dim nowrap">{day(a.created_at)}</td>
              <td class="r">
                <form method="POST" action={a.access_status === 'approved' ? '?/revoke' : '?/approve'} use:enhance style="display:inline;">
                  <input type="hidden" name="userId" value={a.id} />
                  <button type="submit" class="btn btn-secondary" style="height:26px;padding:0 10px;font-size:11.5px;">
                    {a.access_status === 'approved' ? t('admin.access.revoke') : t('admin.access.approve')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="4" class="empty">{t('admin.access.noAccounts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.access.waitlist')}>
    <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.08);">
      <form method="POST" action="?/addEmail" use:enhance style="display:flex;gap:6px;flex:1;min-width:240px;">
        <input type="email" name="email" required placeholder={t('admin.access.addEmailPh')}
          class="input" style="flex:1;min-width:180px;height:30px;" />
        <button type="submit" class="btn btn-secondary" style="height:30px;padding:0 12px;font-size:13px;">
          {t('admin.access.addEmail')}
        </button>
      </form>
      {#if data.promoCode}
        <form method="POST" action="?/sendPromoAll" use:enhance style="display:inline;">
          <button type="submit" class="btn btn-secondary" style="height:30px;padding:0 12px;font-size:13px;">
            {t('admin.access.sendPromoAll')}
          </button>
        </form>
      {/if}
    </div>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.access.colEmail')}</th>
            <th scope="col" class="r">{t('admin.access.colJoined')}</th>
            <th scope="col" class="r">{t('admin.access.colAction')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.pendingInvites as w}
            <tr>
              <td>{w.email}</td>
              <td class="r dim nowrap">{day(w.created_at)}</td>
              <td class="r">
                <div style="display:inline-flex;gap:6px;">
                  {#if data.promoCode}
                    <form method="POST" action="?/sendPromo" use:enhance style="display:inline;">
                      <input type="hidden" name="email" value={w.email} />
                      <button type="submit" class="btn btn-secondary" style="height:26px;padding:0 10px;font-size:11.5px;">
                        {t('admin.access.sendPromo')}
                      </button>
                    </form>
                  {/if}
                  <form method="POST" action="?/invite" use:enhance style="display:inline;">
                    <input type="hidden" name="email" value={w.email} />
                    <button type="submit" class="btn btn-secondary" style="height:26px;padding:0 10px;font-size:11.5px;">
                      {t('admin.access.invite')}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="3" class="empty">{t('admin.access.noWaitlist')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

</div>
