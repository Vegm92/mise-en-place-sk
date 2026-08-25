<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { get } from 'svelte/store';
  import { t, ti } from '$lib/i18n';
  import { formatPhoneNumber } from '$lib/phone';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import Slider from '$lib/components/mep/Slider.svelte';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Truck from '@lucide/svelte/icons/truck';
  import Bell from '@lucide/svelte/icons/bell';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Mail from '@lucide/svelte/icons/mail';
  import Check from '@lucide/svelte/icons/check';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const feedback = (section: string) => (form?.section === section ? form : null);

  let deleteConfirm = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  const formatTime = (at: Date | string) =>
    new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  let botNumberCopied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyBotNumber(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      botNumberCopied = true;
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (botNumberCopied = false), 2000);
    } catch {
    }
  }

  async function handleDeleteAccount() {
    const tFn = get(t);
    if (deleteConfirm !== tFn('set.deleteConfirmWord')) return;
    deleting = true;
    deleteError = '';
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
      });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        const body = await res.json().catch(() => ({}));
        deleteError = body.message ?? tFn('set.deleteErrorGeneric');
      }
    } catch {
      deleteError = tFn('set.deleteErrorNetwork');
    } finally {
      deleting = false;
    }
  }

  const sections = $derived([
    { id: 'cuenta', label: $t('set.nav.account'), icon: SettingsIcon },
    { id: 'negocio', label: $t('set.nav.business'), icon: Truck },
    { id: 'alertas', label: $t('set.nav.alerts'), icon: Bell },
    ...(data.whatsappEnabled ? [{ id: 'whatsapp', label: $t('set.nav.whatsapp'), icon: MessageCircle }] : []),
    { id: 'ayuda', label: $t('set.nav.help'), icon: CircleHelp },
    { id: 'datos', label: $t('set.nav.privacy'), icon: ShieldCheck },
  ]);

  let activeSection = $state('cuenta');
  let openSection = $state<string | null>('cuenta');
  const toggleSection = (id: string) => {
    openSection = openSection === id ? null : id;
  };

  // svelte-ignore state_referenced_locally — intentional: seed once from server-loaded data
  let threshold = $state(data.threshold);
  // svelte-ignore state_referenced_locally — intentional: seed once from server-loaded data
  let priceThreshold = $state(data.priceThreshold);
</script>

{#snippet sectionBody(section: string, idp: string)}
      {#if section === 'cuenta'}
        <SectionCard title={$t('set.profile.title')} sub={$t('set.profile.sub')} noPad>
          <form method="POST" action="?/saveName" class="set-row">
            <label for="{idp}-profile-name" class="body-strong" style="font-size:13px;">{$t('set.profile.name')}</label>
            <div>
              <div class="flex items-center gap-3 flex-wrap">
                <input id="{idp}-profile-name" name="name" type="text" maxlength="80" required
                  value={data.profile.name} class="input" style="height:34px;width:100%;max-width:300px;" />
                <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.save')}</button>
              </div>
              {#if feedback('name')?.error}
                <p style="font-size:12px;color:var(--mep-neg);margin:6px 0 0;">{$t(feedback('name')!.error!)}</p>
              {:else if feedback('name')?.ok}
                <p style="font-size:12px;color:var(--mep-pos);margin:6px 0 0;">{$t(feedback('name')!.ok!)}</p>
              {/if}
            </div>
          </form>
        </SectionCard>

        <SectionCard title={$t('set.access.title')} sub={$t('set.access.sub')} noPad>
          <form method="POST" action="?/saveEmail" class="set-row">
            <label for="{idp}-profile-email" class="body-strong" style="font-size:13px;">{$t('set.profile.email')}</label>
            <div>
              <div class="flex items-center gap-3 flex-wrap" style="margin-bottom:4px;">
                <Mail size={14} style="color:var(--mep-fg-3);" />
                <span style="font-size:13px;color:var(--mep-fg);">{data.profile.email}</span>
                {#if data.profile.emailVerified}
                  <span class="badge badge-confirmed"><Check size={10} />{$t('set.profile.emailVerified')}</span>
                {/if}
              </div>
              <div class="flex items-center gap-3 flex-wrap">
                <input id="{idp}-profile-email" name="email" type="email" required
                  value={data.profile.email} class="input" style="height:34px;width:100%;max-width:300px;" />
                <button type="submit" class="btn btn-secondary" style="height:34px;">{$t('set.profile.emailBtn')}</button>
              </div>
              <p class="body text-fg-3" style="font-size:11.5px;margin:6px 0 0;">{$t('set.profile.emailDesc')}</p>
              {#if feedback('email')?.error}
                <p style="font-size:12px;color:var(--mep-neg);margin:6px 0 0;">{$t(feedback('email')!.error!)}</p>
              {:else if feedback('email')?.ok}
                <p style="font-size:12px;color:var(--mep-pos);margin:6px 0 0;">{$t(feedback('email')!.ok!)}</p>
              {/if}
            </div>
          </form>

          {#if data.profile.hasPassword}
            <div class="set-row">
              <label for="{idp}-pw-current" class="body-strong" style="font-size:13px;">{$t('set.profile.password')}</label>
              <form method="POST" action="?/changePassword" class="flex flex-col gap-2" style="max-width:300px;">
                <input id="{idp}-pw-current" name="current" type="password" required autocomplete="current-password"
                  placeholder={$t('set.profile.currentPassword')} class="input" style="height:34px;" />
                <input name="password" type="password" required minlength="12" autocomplete="new-password"
                  placeholder={$t('set.profile.newPassword')} class="input" style="height:34px;" />
                <input name="confirm" type="password" required minlength="12" autocomplete="new-password"
                  placeholder={$t('set.profile.confirmPassword')} class="input" style="height:34px;" />
                <div>
                  <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.profile.passwordBtn')}</button>
                </div>
                {#if feedback('password')?.error}
                  <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('password')!.error!)}</p>
                {:else if feedback('password')?.ok}
                  <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('password')!.ok!)}</p>
                {/if}
              </form>
            </div>
          {/if}
        </SectionCard>

        <a href="/billing" class="card p-4" style="display:flex;align-items:center;justify-content:space-between;gap:12px;text-decoration:none;margin-bottom:20px;">
          <div>
            <div class="body-strong" style="font-size:13px;">{$t('billing.settings.link')}</div>
            <div class="body text-fg-3" style="font-size:12px;margin-top:2px;">{$t('billing.settings.linkBody')}</div>
          </div>
          <span class="body text-fg-3" style="font-size:13px;">&rsaquo;</span>
        </a>
      {/if}

      {#if section === 'negocio'}
        <SectionCard title={$t('set.business.title')} sub={$t('set.business.sub')} noPad>
          <div class="set-row">
            <label for="{idp}-restaurant-name" class="body-strong" style="font-size:13px;">{$t('set.profile.restaurant')}</label>
            {#if data.canRenameRestaurant}
              <form method="POST" action="?/renameRestaurant">
                <div class="flex items-center gap-3 flex-wrap">
                  <input id="{idp}-restaurant-name" name="name" type="text" maxlength="120" required
                    value={data.restaurantName} class="input" style="height:34px;width:100%;max-width:300px;" />
                  <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.save')}</button>
                </div>
                {#if feedback('restaurant')?.error}
                  <p style="font-size:12px;color:var(--mep-neg);margin:6px 0 0;">{$t(feedback('restaurant')!.error!)}</p>
                {:else if feedback('restaurant')?.ok}
                  <p style="font-size:12px;color:var(--mep-pos);margin:6px 0 0;">{$t(feedback('restaurant')!.ok!)}</p>
                {/if}
              </form>
            {:else}
              <div>
                <span class="body-strong" style="font-size:13px;">{data.restaurantName}</span>
                <p class="body text-fg-3" style="font-size:11.5px;margin:4px 0 0;">{$t('set.business.nameReadonlyHint')}</p>
              </div>
            {/if}
          </div>

          <div class="set-row">
            <span class="body-strong" style="font-size:13px;">{$t('set.business.currencyLabel')}</span>
            <div style="display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:6px;border:1px solid var(--mep-border);background:var(--mep-surface-2);color:var(--mep-fg-2);font-size:13px;width:100%;max-width:300px;">
              <Wallet size={14} style="color:var(--mep-fg-3);" />
              {$t('set.business.currencyValue')}
              <div style="flex:1;"></div>
              <span class="badge badge-neutral">{$t('set.business.currencyFixed')}</span>
            </div>
          </div>
        </SectionCard>

        {#if data.multiLocation}
          <SectionCard title={$t('set.locations.title')}>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <p class="body text-fg-3" style="font-size:12px;margin:0;">
                {$ti('set.locations.desc', { used: data.locations.length, max: data.maxLocations })}
              </p>

              <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
                {#each data.locations as loc}
                  <li style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mep-fg-2);">
                    <span>{loc.name}</span>
                    {#if loc.id === data.activeRestaurantId}
                      <span style="font-size:11px;color:var(--mep-acc);border:1px solid var(--mep-acc);border-radius:99px;padding:1px 7px;">
                        {$t('set.locations.current')}
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>

              {#if data.locations.length < data.maxLocations}
                <form method="POST" action="?/addLocation" class="flex items-center gap-3 flex-wrap">
                  <input name="name" type="text" maxlength="120" required
                    placeholder={$t('set.locations.newPlaceholder')}
                    class="input" style="height:36px;min-width:180px;flex:1;" />
                  <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.locations.add')}</button>
                </form>
              {:else}
                <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.locations.err.limitReached')}</p>
              {/if}

              {#if feedback('location')?.error}
                <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('location')!.error!)}</p>
              {/if}
            </div>
          </SectionCard>
        {/if}
      {/if}

      {#if section === 'alertas'}
        <SectionCard title={$t('set.thresholdTitle')} sub={$t('set.thresholdDesc')} noPad>
          <form method="post" action="?/saveThreshold" class="set-row" style="align-items:start;">
            <span class="body-strong" style="font-size:13px;padding-top:6px;">{$t('set.nav.alerts')}</span>
            <div style="max-width:440px;">
              <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
                <div style="flex:1 1 200px;max-width:240px;min-width:160px;">
                  <Slider bind:value={threshold} min={50} max={100} name="value" />
                  <div class="num" style="display:flex;justify-content:space-between;font-size:11px;color:var(--mep-fg-4);margin-top:6px;">
                    <span>50%</span><span>100%</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="btn btn-secondary" style="width:26px;height:26px;padding:0;justify-content:center;"
                    onclick={() => (threshold = Math.max(50, threshold - 1))}>−</button>
                  <div class="num" style="min-width:54px;height:30px;border-radius:6px;border:1px solid var(--mep-border-strong);background:var(--mep-surface);display:flex;align-items:center;justify-content:center;gap:1px;font-size:13.5px;font-weight:600;color:var(--mep-fg);">
                    {threshold}<span style="font-size:11px;color:var(--mep-fg-3);font-weight:400;">%</span>
                  </div>
                  <button type="button" class="btn btn-secondary" style="width:26px;height:26px;padding:0;justify-content:center;"
                    onclick={() => (threshold = Math.min(100, threshold + 1))}>+</button>
                </div>
                <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.save')}</button>
              </div>
              <p class="body text-fg-3" style="font-size:11.5px;margin:8px 0 0;">{$ti('set.thresholdPreview', { value: threshold })}</p>
            </div>
          </form>
        </SectionCard>

        <SectionCard title={$t('set.priceThresholdTitle')} sub={$t('set.priceThresholdDesc')} noPad>
          <form method="post" action="?/savePriceThreshold" class="set-row" style="align-items:start;">
            <span class="body-strong" style="font-size:13px;padding-top:6px;">{$t('set.priceThresholdTitle')}</span>
            <div style="max-width:440px;">
              <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
                <div style="flex:1 1 200px;max-width:240px;min-width:160px;">
                  <Slider bind:value={priceThreshold} min={1} max={50} name="value" />
                  <div class="num" style="display:flex;justify-content:space-between;font-size:11px;color:var(--mep-fg-4);margin-top:6px;">
                    <span>1%</span><span>50%</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="btn btn-secondary" style="width:26px;height:26px;padding:0;justify-content:center;"
                    onclick={() => (priceThreshold = Math.max(1, priceThreshold - 1))}>−</button>
                  <div class="num" style="min-width:54px;height:30px;border-radius:6px;border:1px solid var(--mep-border-strong);background:var(--mep-surface);display:flex;align-items:center;justify-content:center;gap:1px;font-size:13.5px;font-weight:600;color:var(--mep-fg);">
                    {priceThreshold}<span style="font-size:11px;color:var(--mep-fg-3);font-weight:400;">%</span>
                  </div>
                  <button type="button" class="btn btn-secondary" style="width:26px;height:26px;padding:0;justify-content:center;"
                    onclick={() => (priceThreshold = Math.min(50, priceThreshold + 1))}>+</button>
                </div>
                <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.save')}</button>
              </div>
              <p class="body text-fg-3" style="font-size:11.5px;margin:8px 0 0;">{$ti('set.priceThresholdPreview', { value: priceThreshold })}</p>
            </div>
          </form>
        </SectionCard>

        <SectionCard title={$t('set.alertPrefs.title')} sub={$t('set.alertPrefs.sub')} noPad>
          <form method="post" action="?/saveAlertPreferences">
            {#each data.alertGroups as group}
              <div class="set-row" style="align-items:start;">
                <span class="body-strong" style="font-size:13px;padding-top:4px;">{$t(`set.alertPrefs.group.${group.id}`)}</span>
                <div class="alert-toggle-list">
                  {#each group.types as type}
                    <label class="alert-toggle" for={`${idp}-alert-pref-${type}`}>
                      <input
                        id={`${idp}-alert-pref-${type}`}
                        class="alert-toggle-input"
                        type="checkbox"
                        name={`alert_${type}`}
                        checked={data.alertPreferences[type]}
                      />
                      <span class="alert-toggle-track"><span class="alert-toggle-thumb"></span></span>
                      <span class="alert-toggle-copy">
                        <span class="body-strong" style="font-size:13px;">{$t(`set.alertPrefs.type.${type}`)}</span>
                        <span class="body text-fg-3" style="font-size:11.5px;">{$t(`set.alertPrefs.desc.${type}`)}</span>
                      </span>
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
            <div class="alert-toggle-actions">
              <button type="submit" class="btn btn-primary" style="height:34px;">{$t('set.save')}</button>
            </div>
          </form>
        </SectionCard>
      {/if}

      {#if section === 'whatsapp' && data.whatsappEnabled}
        <SectionCard title={$t('set.whatsapp.title')}>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.desc')}</p>

            {#if data.whatsappBotNumber}
              <div class="wa-number-block">
                <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.numberLabel')}</p>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <a
                    href={data.whatsappBotNumber.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style="font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--mep-fg);"
                  >{data.whatsappBotNumber.display}</a>
                  <button
                    type="button"
                    class="btn btn-secondary wa-no-print"
                    style="height:28px;font-size:12px;"
                    onclick={() => copyBotNumber(data.whatsappBotNumber!.link)}
                  >{botNumberCopied ? $t('set.whatsapp.copied') : $t('set.whatsapp.copy')}</button>
                </div>

                {#if data.whatsappBotNumber.qrSvg}
                  <div class="wa-qr" aria-hidden="true">{@html data.whatsappBotNumber.qrSvg}</div>
                  <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.qrHint')}</p>
                {/if}
              </div>
            {/if}

            {#if data.whatsappContacts.length > 0}
              <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
                {#each data.whatsappContacts as contact (contact.id)}
                  <li style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mep-fg-2);">
                    <span style="font-variant-numeric:tabular-nums;">{formatPhoneNumber(contact.phoneNumber)}</span>
                    {#if contact.displayName}
                      <span class="text-fg-3" style="font-size:12px;">{contact.displayName}</span>
                    {/if}
                    {#if data.canManageWhatsapp}
                      <form method="POST" action="?/removeWhatsappContact" style="margin-left:auto;">
                        <input type="hidden" name="id" value={contact.id} />
                        <button type="submit" class="btn btn-secondary" style="height:28px;font-size:12px;">
                          {$t('set.whatsapp.remove')}
                        </button>
                      </form>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.empty')}</p>
            {/if}

            {#if data.canManageWhatsapp}
              <div class="wa-pair-block">
                {#if data.whatsappPairingCode}
                  <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.pairActive')}</p>
                  <p class="wa-pair-code">{data.whatsappPairingCode.code}</p>
                  <p class="body text-fg-3" style="font-size:12px;margin:0;">
                    {$ti('set.whatsapp.pairExpires', { time: formatTime(data.whatsappPairingCode.expiresAt) })}
                  </p>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <form method="POST" action="?/generateWhatsappPairingCode">
                      <button type="submit" class="btn btn-secondary" style="height:28px;font-size:12px;">
                        {$t('set.whatsapp.pairRegenerate')}
                      </button>
                    </form>
                    <form method="POST" action="?/revokeWhatsappPairingCode">
                      <button type="submit" class="btn btn-secondary" style="height:28px;font-size:12px;">
                        {$t('set.whatsapp.pairRevoke')}
                      </button>
                    </form>
                  </div>
                {:else}
                  <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.pairDesc')}</p>
                  <form method="POST" action="?/generateWhatsappPairingCode" class="flex items-center gap-3 flex-wrap">
                    <input name="name" type="text" maxlength="80"
                      placeholder={$t('set.whatsapp.namePlaceholder')}
                      class="input" style="min-width:120px;flex:1;" />
                    <button type="submit" class="btn btn-secondary" style="font-size:12px;">
                      {$t('set.whatsapp.pairGenerate')}
                    </button>
                  </form>
                {/if}
              </div>

              <form method="POST" action="?/addWhatsappContact" class="flex items-center gap-3 flex-wrap">
                <input name="phone" type="tel" required
                  placeholder={$t('set.whatsapp.phonePlaceholder')}
                  class="input" style="height:36px;min-width:150px;flex:1;" />
                <input name="name" type="text" maxlength="80"
                  placeholder={$t('set.whatsapp.namePlaceholder')}
                  class="input" style="height:36px;min-width:120px;flex:1;" />
                <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.whatsapp.add')}</button>
              </form>
            {:else}
              <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.whatsapp.err.notOwner')}</p>
            {/if}

            {#if feedback('whatsapp')?.error}
              <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('whatsapp')!.error!)}</p>
            {:else if feedback('whatsapp')?.ok}
              <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('whatsapp')!.ok!)}</p>
            {/if}
          </div>
        </SectionCard>
      {/if}

      {#if section === 'ayuda'}
        <div data-coach="settings-main">
          <SectionCard title={$t('set.tourTitle')}>
            <p class="body text-fg-2" style="font-size:13px;margin:0 0 12px;">
              {$t('set.tourDesc')}
            </p>
            <form method="POST" action="?/resetTutorial">
              <button type="submit" class="btn btn-secondary" style="height:34px;font-size:13px;">
                {$t('set.tourRepeat')}
              </button>
            </form>
          </SectionCard>
        </div>
      {/if}

      {#if section === 'datos'}
        <SectionCard title={$t('set.privacyTitle')}>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <p class="body text-fg-2" style="font-size:13px;margin:0 0 8px;">
                {$t('set.dataExportDesc')}
              </p>
              <a href="/api/user/export" download class="btn btn-secondary" style="height:34px;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('set.dataExportBtn')}
              </a>
            </div>

            <hr style="border:none;border-top:1px solid var(--mep-divider);margin:4px 0;" />

            <div style="border:1px solid var(--mep-neg);background:var(--mep-neg-soft);border-radius:var(--mep-r-card);padding:14px;display:flex;gap:10px;align-items:flex-start;">
              <AlertTriangle size={18} style="color:var(--mep-neg);flex-shrink:0;margin-top:2px;" />
              <div style="flex:1;min-width:0;">
                <p class="body" style="font-size:13px;margin:0 0 4px;color:var(--mep-neg);font-weight:500;">
                  {$t('set.deleteDesc')}
                </p>
                <p class="body text-fg-3" style="font-size:12px;margin:0 0 10px;">
                  {$t('set.deleteType')} <strong>{$t('set.deleteConfirmWord')}</strong> {$t('set.deleteHint')}
                </p>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <input
                    type="text"
                    placeholder={$t('set.deleteConfirmWord')}
                    bind:value={deleteConfirm}
                    class="input"
                    style="height:34px;width:140px;"
                  />
                  <button
                    type="button"
                    onclick={handleDeleteAccount}
                    disabled={deleteConfirm !== $t('set.deleteConfirmWord') || deleting}
                    class="btn"
                    style="height:34px;font-size:13px;background:var(--mep-neg);color:var(--mep-neg-fg);border:none;opacity:{deleteConfirm !== $t('set.deleteConfirmWord') || deleting ? 0.5 : 1};"
                  >
                    {deleting ? $t('set.deletingBtn') : $t('set.deleteBtn')}
                  </button>
                </div>
                {#if deleteError}
                  <p style="font-size:12px;color:var(--mep-neg);margin:6px 0 0;">{deleteError}</p>
                {/if}
              </div>
            </div>

            <div style="display:flex;gap:12px;margin-top:4px;">
              <a href="/privacy" class="set-legal-link" style="font-size:12px;color:var(--mep-fg-3);">{$t('set.privacyLink')}</a>
              <a href="/terms" class="set-legal-link" style="font-size:12px;color:var(--mep-fg-3);">{$t('set.termsLink')}</a>
            </div>
          </div>
        </SectionCard>
      {/if}
{/snippet}

<div class="hidden md:flex" style="flex:1;min-height:0;overflow:hidden;">
  <nav class="settings-rail">
    <div class="label" style="padding:0 10px 10px;">{$t('nav.settings')}</div>
    {#each sections as s}
      <button
        type="button"
        class="settings-rail-item"
        class:active={activeSection === s.id}
        onclick={() => (activeSection = s.id)}
      >
        <s.icon size={15} /><span>{s.label}</span>
      </button>
    {/each}
  </nav>

  <div class="settings-content">
    <div class="set-content">
      {@render sectionBody(activeSection, 'd')}
    </div>
  </div>
</div>

<div class="md:hidden set-acc">
  <div class="label" style="padding:0 2px 10px;">{$t('nav.settings')}</div>
  {#each sections as s (s.id)}
    <div class="set-acc-item">
      <button
        type="button"
        class="set-acc-head"
        aria-expanded={openSection === s.id}
        aria-controls="set-acc-panel-{s.id}"
        onclick={() => toggleSection(s.id)}
      >
        <s.icon size={16} />
        <span class="set-acc-label">{s.label}</span>
        <span class="set-acc-chevron" class:open={openSection === s.id}><ChevronDown size={16} /></span>
      </button>
      {#if openSection === s.id}
        <div class="set-acc-body" id="set-acc-panel-{s.id}">
          {@render sectionBody(s.id, 'm')}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .settings-rail {
    width: 186px;
    flex-shrink: 0;
    padding: 24px 12px;
    border-right: 1px solid var(--mep-divider);
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
  }
  .settings-rail-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    height: 32px;
    border-radius: 6px;
    border: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    background: transparent;
    color: var(--mep-fg-2);
    font-size: 13px;
    font-weight: 400;
  }
  .settings-rail-item.active {
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    font-weight: 500;
  }
  .settings-content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
  .set-content {
    container-type: inline-size;
    max-width: 760px;
    margin: 0 auto;
    padding: 28px clamp(16px, 3vw, 32px) 60px;
  }
  .set-row {
    display: grid;
    grid-template-columns: minmax(120px, 190px) minmax(0, 1fr);
    gap: 20px;
    padding: 15px 20px;
    border-bottom: 1px solid var(--mep-divider);
    align-items: center;
  }
  .set-row:last-child {
    border-bottom: none;
  }
  @container (max-width: 600px) {
    .set-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      align-items: stretch !important;
    }
  }

  .set-acc {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 14px 40px;
  }
  .set-acc-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .set-acc-item + .set-acc-item {
    margin-top: 10px;
  }
  .set-acc-head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 0 14px;
    background: var(--mep-surface);
    border: 1px solid var(--mep-border);
    border-radius: var(--mep-r-card);
    box-shadow: var(--mep-shadow-card);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--mep-fg-2);
  }
  .set-acc-head[aria-expanded='true'] {
    color: var(--mep-acc);
    background: var(--mep-acc-soft);
    border-color: var(--mep-acc);
  }
  .set-acc-label {
    flex: 1;
    min-width: 0;
  }
  .set-acc-chevron {
    display: inline-flex;
    color: var(--mep-fg-3);
    transition: transform 0.15s ease;
  }
  .set-acc-head[aria-expanded='true'] .set-acc-chevron {
    color: inherit;
  }
  .set-acc-chevron.open {
    transform: rotate(180deg);
  }
  .set-acc-body {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .set-acc-body :global(.card) {
    width: 100%;
    max-width: 100%;
  }
  @media (max-width: 767px) {
    .set-legal-link {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
    .set-acc-body :global(.mep-slider-input) {
      height: 44px;
      top: 50%;
      transform: translateY(-50%);
    }
  }

  .alert-toggle-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .alert-toggle {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }
  .alert-toggle-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  .alert-toggle-track {
    flex: 0 0 auto;
    width: 34px;
    height: 20px;
    margin-top: 1px;
    border-radius: 999px;
    background: var(--mep-border-strong);
    transition: background 0.15s ease;
  }
  .alert-toggle-thumb {
    display: block;
    width: 16px;
    height: 16px;
    margin: 2px;
    border-radius: 999px;
    background: var(--mep-surface);
    transition: transform 0.15s ease;
  }
  .alert-toggle-input:checked + .alert-toggle-track {
    background: var(--mep-acc);
  }
  .alert-toggle-input:checked + .alert-toggle-track .alert-toggle-thumb {
    transform: translateX(14px);
  }
  .alert-toggle-input:focus-visible + .alert-toggle-track {
    outline: 2px solid var(--mep-acc);
    outline-offset: 2px;
  }
  .alert-toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .alert-toggle-actions {
    display: flex;
    justify-content: flex-end;
    padding: 15px 20px;
  }

  .wa-number-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--mep-border, #e5e5e5);
    border-radius: 8px;
  }

  .wa-pair-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px dashed var(--mep-border, #e5e5e5);
    border-radius: 8px;
  }

  .wa-pair-code {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--mep-fg);
  }

  .wa-qr {
    width: 160px;
    max-width: 100%;
  }

  .wa-qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    background: #fff;
    padding: 6px;
    border-radius: 4px;
  }

  @media print {
    .wa-no-print { display: none; }
    .wa-qr { width: 45mm; }
    .wa-qr :global(svg) { background: #fff; }
  }
</style>
