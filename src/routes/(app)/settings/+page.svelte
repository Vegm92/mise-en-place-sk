<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { get } from 'svelte/store';
  import { t, ti } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Profile forms (issue #293) each report into their own card; `section`
  // identifies which one the last submit came from.
  const feedback = (section: string) => (form?.section === section ? form : null);

  let deleteConfirm = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

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
</script>

<div class="p-6 flex justify-center">
  <div class="w-full max-w-[440px] flex flex-col gap-4">

    <div class="card p-4">
      <p class="body text-fg-2" style="font-size:13px;">{$t('set.currency')}</p>
    </div>

    <SectionCard title={$t('set.profile.title')}>
      <div style="display:flex;flex-direction:column;gap:16px;">

        <!-- Display name -->
        <form method="POST" action="?/saveName" class="flex flex-col gap-2">
          <label for="profile-name" class="body text-fg-2" style="font-size:12px;font-weight:500;">{$t('set.profile.name')}</label>
          <div class="flex items-center gap-3 flex-wrap">
            <input id="profile-name" name="name" type="text" maxlength="80" required
              value={data.profile.name} class="input" style="height:36px;font-size:13px;min-width:180px;flex:1;" />
            <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
          </div>
          {#if feedback('name')?.error}
            <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('name')!.error!)}</p>
          {:else if feedback('name')?.ok}
            <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('name')!.ok!)}</p>
          {/if}
        </form>

        <hr style="border:none;border-top:1px solid var(--mep-divider);margin:0;" />

        <!-- Email -->
        <form method="POST" action="?/saveEmail" class="flex flex-col gap-2">
          <label for="profile-email" class="body text-fg-2" style="font-size:12px;font-weight:500;">{$t('set.profile.email')}</label>
          <div class="flex items-center gap-3 flex-wrap">
            <input id="profile-email" name="email" type="email" required
              value={data.profile.email} class="input" style="height:36px;font-size:13px;min-width:180px;flex:1;" />
            <button type="submit" class="btn btn-secondary" style="height:36px;">{$t('set.profile.emailBtn')}</button>
          </div>
          <p class="body text-fg-3" style="font-size:12px;margin:0;">{$t('set.profile.emailDesc')}</p>
          {#if feedback('email')?.error}
            <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('email')!.error!)}</p>
          {:else if feedback('email')?.ok}
            <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('email')!.ok!)}</p>
          {/if}
        </form>

        {#if data.profile.hasPassword}
          <hr style="border:none;border-top:1px solid var(--mep-divider);margin:0;" />

          <!-- Password -->
          <form method="POST" action="?/changePassword" class="flex flex-col gap-2">
            <span class="body text-fg-2" style="font-size:12px;font-weight:500;">{$t('set.profile.password')}</span>
            <input name="current" type="password" required autocomplete="current-password"
              placeholder={$t('set.profile.currentPassword')} class="input" style="height:36px;font-size:13px;" />
            <input name="password" type="password" required minlength="8" autocomplete="new-password"
              placeholder={$t('set.profile.newPassword')} class="input" style="height:36px;font-size:13px;" />
            <input name="confirm" type="password" required minlength="8" autocomplete="new-password"
              placeholder={$t('set.profile.confirmPassword')} class="input" style="height:36px;font-size:13px;" />
            <div>
              <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.profile.passwordBtn')}</button>
            </div>
            {#if feedback('password')?.error}
              <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('password')!.error!)}</p>
            {:else if feedback('password')?.ok}
              <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('password')!.ok!)}</p>
            {/if}
          </form>
        {/if}

        {#if data.canRenameRestaurant}
          <hr style="border:none;border-top:1px solid var(--mep-divider);margin:0;" />

          <!-- Restaurant name -->
          <form method="POST" action="?/renameRestaurant" class="flex flex-col gap-2">
            <label for="restaurant-name" class="body text-fg-2" style="font-size:12px;font-weight:500;">{$t('set.profile.restaurant')}</label>
            <div class="flex items-center gap-3 flex-wrap">
              <input id="restaurant-name" name="name" type="text" maxlength="120" required
                value={data.restaurantName} class="input" style="height:36px;font-size:13px;min-width:180px;flex:1;" />
              <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
            </div>
            {#if feedback('restaurant')?.error}
              <p style="font-size:12px;color:var(--mep-neg);margin:0;">{$t(feedback('restaurant')!.error!)}</p>
            {:else if feedback('restaurant')?.ok}
              <p style="font-size:12px;color:var(--mep-pos);margin:0;">{$t(feedback('restaurant')!.ok!)}</p>
            {/if}
          </form>
        {/if}

      </div>
    </SectionCard>

    <SectionCard title={$t('set.thresholdTitle')}>
      <form method="post" action="?/saveThreshold" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <input type="number" name="value" min="1" max="99" value={data.threshold}
            class="input w-[90px]" style="height:36px;font-size:13px;" />
          <span class="body text-fg-2" style="font-size:13px;">%</span>
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
        </div>
        <p class="body text-fg-3" style="font-size:12px;">{$t('set.thresholdDesc')}</p>
      </form>
    </SectionCard>

    <SectionCard title={$t('set.priceThresholdTitle')}>
      <form method="post" action="?/savePriceThreshold" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <input type="number" name="value" min="1" max="99" value={data.priceThreshold}
            class="input w-[90px]" style="height:36px;font-size:13px;" />
          <span class="body text-fg-2" style="font-size:13px;">%</span>
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
        </div>
        <p class="body text-fg-3" style="font-size:12px;">{$t('set.priceThresholdDesc')}</p>
      </form>
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
                class="input" style="height:36px;font-size:13px;min-width:180px;flex:1;" />
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

        <div>
          <p class="body text-fg-2" style="font-size:13px;margin:0 0 4px;">
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
              style="height:34px;font-size:13px;width:140px;"
            />
            <button
              type="button"
              onclick={handleDeleteAccount}
              disabled={deleteConfirm !== $t('set.deleteConfirmWord') || deleting}
              class="btn"
              style="height:34px;font-size:13px;background:var(--mep-danger,#c0392b);color:#fff;border:none;opacity:{deleteConfirm !== $t('set.deleteConfirmWord') || deleting ? 0.5 : 1};"
            >
              {deleting ? $t('set.deletingBtn') : $t('set.deleteBtn')}
            </button>
          </div>
          {#if deleteError}
            <p style="font-size:12px;color:var(--mep-danger,#c0392b);margin:6px 0 0;">{deleteError}</p>
          {/if}
        </div>

        <div style="display:flex;gap:12px;margin-top:4px;">
          <a href="/privacy" style="font-size:12px;color:var(--mep-fg-3);">{$t('set.privacyLink')}</a>
          <a href="/terms"   style="font-size:12px;color:var(--mep-fg-3);">{$t('set.termsLink')}</a>
        </div>
      </div>
    </SectionCard>

  </div>
</div>
