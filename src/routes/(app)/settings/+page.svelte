<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { t, ti, tp } from '$lib/i18n';
  import { formatPhoneNumber } from '$lib/phone';
  import { HELP_FAQ } from '$lib/help-content';
  import { TOUR_PAGES } from '$lib/tour-gating';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import Slider from '$lib/components/mep/Slider.svelte';
  import Lock from '@lucide/svelte/icons/lock';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Truck from '@lucide/svelte/icons/truck';
  import Bell from '@lucide/svelte/icons/bell';
  import Eye from '@lucide/svelte/icons/eye';
  import Tag from '@lucide/svelte/icons/tag';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Mail from '@lucide/svelte/icons/mail';
  import Check from '@lucide/svelte/icons/check';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import Compass from '@lucide/svelte/icons/compass';
  import Download from '@lucide/svelte/icons/download';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const feedback = (section: string) => (form?.section === section ? form : null);
  const lockedLocations = $derived(data.locations.filter((loc) => loc.locked));
  const usableLocations = $derived(data.locations.filter((loc) => !loc.locked));
  const showLocations = $derived(data.multiLocation || lockedLocations.length > 0);

  let deleteConfirm = $state('');
  let deletePassword = $state('');
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
    const tFn = t;
    deleting = true;
    deleteError = '';
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          data.profile.hasPassword
            ? { password: deletePassword }
            : { confirm: 'DELETE_MY_ACCOUNT' },
        ),
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
    { id: 'cuenta', label: t('set.nav.account'), sub: t('set.sub.account'), icon: SettingsIcon },
    { id: 'negocio', label: t('set.nav.business'), sub: t('set.sub.business'), icon: Truck },
    { id: 'categorias', label: t('set.nav.categories'), sub: t('set.sub.categories'), icon: Tag },
    { id: 'campos', label: t('set.nav.fields'), sub: t('set.sub.fields'), icon: Eye },
    { id: 'alertas', label: t('set.nav.alerts'), sub: t('set.sub.alerts'), icon: Bell },
    ...(data.whatsappEnabled
      ? [{ id: 'whatsapp', label: t('set.nav.whatsapp'), sub: t('set.sub.whatsapp'), icon: MessageCircle }]
      : []),
    { id: 'ayuda', label: t('set.nav.help'), sub: t('set.sub.help'), icon: CircleHelp },
    { id: 'datos', label: t('set.nav.privacy'), sub: t('set.sub.privacy'), icon: ShieldCheck },
  ]);

  let activeSection = $state('cuenta');
  let mobileSection = $state<string | null>(null);
  let query = $state('');

  const sectionOf = (id: string) => sections.find((s) => s.id === id) ?? sections[0]!;

  const alertTypes = $derived(data.alertGroups.flatMap((g) => g.types));
  const savedPrefs = $derived(data.alertPreferences as Record<string, boolean>);

  const searchIndex = $derived([
    { key: 'set.profile.name', section: 'cuenta' },
    { key: 'set.profile.email', section: 'cuenta' },
    { key: 'set.profile.password', section: 'cuenta' },
    { key: 'billing.settings.link', section: 'cuenta' },
    { key: 'set.profile.restaurant', section: 'negocio' },
    { key: 'set.business.currencyLabel', section: 'negocio' },
    { key: 'set.fiscal.legalName', section: 'negocio' },
    { key: 'set.fiscal.tradeName', section: 'negocio' },
    { key: 'set.fiscal.cifNif', section: 'negocio' },
    { key: 'set.fiscal.address', section: 'negocio' },
    { key: 'set.fiscal.phone', section: 'negocio' },
    ...(showLocations ? [{ key: 'set.locations.title', section: 'negocio' }] : []),
    { key: 'set.categories.title', section: 'categorias' },
    ...data.categories.map((cat) => ({ key: cat.name, section: 'categorias' })),
    { key: 'set.fields.title', section: 'campos' },
    ...data.optionalFields.map((field) => ({ key: `set.fields.label.${field}`, section: 'campos' })),
    { key: 'set.thresholdTitle', section: 'alertas' },
    { key: 'set.priceThresholdTitle', section: 'alertas' },
    ...alertTypes.map((type) => ({ key: `set.alertPrefs.type.${type}`, section: 'alertas' })),
    ...(data.whatsappEnabled
      ? [
          { key: 'set.whatsapp.botTitle', section: 'whatsapp' },
          { key: 'set.whatsapp.contactsTitle', section: 'whatsapp' },
          { key: 'set.whatsapp.pairTitle', section: 'whatsapp' },
        ]
      : []),
    { key: 'set.tourTitle', section: 'ayuda' },
    { key: 'set.helpLink', section: 'ayuda' },
    { key: 'set.dataExportBtn', section: 'datos' },
    { key: 'set.deleteBtn', section: 'datos' },
    { key: 'set.privacyLink', section: 'datos' },
    { key: 'set.termsLink', section: 'datos' },
  ]);

  const results = $derived(
    query.trim().length === 0
      ? []
      : searchIndex.filter((entry) =>
          t(entry.key).toLowerCase().includes(query.trim().toLowerCase()),
        ),
  );

  function goToResult(section: string) {
    query = '';
    activeSection = section;
    mobileSection = section;
  }

  // svelte-ignore state_referenced_locally
  let profileName = $state(data.profile.name);
  // svelte-ignore state_referenced_locally
  let restaurantName = $state(data.restaurantName);
  // svelte-ignore state_referenced_locally
  let threshold = $state(data.threshold);
  // svelte-ignore state_referenced_locally
  let priceThreshold = $state(data.priceThreshold);
  // svelte-ignore state_referenced_locally
  let alertPrefs = $state<Record<string, boolean>>({ ...data.alertPreferences });
  // svelte-ignore state_referenced_locally
  let fieldVisPrefs = $state<Record<string, boolean>>({ ...data.fieldVisibility });

  const alertsOn = $derived(alertTypes.filter((type) => alertPrefs[type]).length);
  const groupOn = (types: readonly string[]) => types.filter((type) => alertPrefs[type]).length;
  const savedFieldVis = $derived(data.fieldVisibility as Record<string, boolean>);

  const pendingOf = (section: string | null) => {
    if (section === 'cuenta') return profileName !== data.profile.name ? 1 : 0;
    if (section === 'negocio') return restaurantName !== data.restaurantName ? 1 : 0;
    if (section === 'campos') return data.optionalFields.filter((field) => fieldVisPrefs[field] !== savedFieldVis[field]).length;
    if (section === 'alertas') {
      return (
        (threshold !== data.threshold ? 1 : 0) +
        (priceThreshold !== data.priceThreshold ? 1 : 0) +
        alertTypes.filter((type) => alertPrefs[type] !== savedPrefs[type]).length
      );
    }
    return 0;
  };

  function discard(section: string | null) {
    if (section === 'cuenta') profileName = data.profile.name;
    if (section === 'negocio') restaurantName = data.restaurantName;
    if (section === 'campos') fieldVisPrefs = { ...data.fieldVisibility };
    if (section === 'alertas') {
      threshold = data.threshold;
      priceThreshold = data.priceThreshold;
      alertPrefs = { ...data.alertPreferences };
    }
  }

  const savableForm = (section: string | null, idp: string) =>
    section === 'cuenta' || section === 'negocio' || section === 'campos' || section === 'alertas'
      ? `${idp}-form-${section}`
      : '';

  let pwOpen = $state(false);
  let dangerOpen = $state(false);

  let editingCategoryId = $state<number | null>(null);
  let editingCategoryName = $state('');
  function startEditCategory(cat: { id: number; name: string }) {
    editingCategoryId = cat.id;
    editingCategoryName = cat.name;
  }
</script>

{#snippet feedbackLine(section: string)}
  {#if feedback(section)?.error}
    <p class="set-msg set-msg-err">{t(feedback(section)!.error!)}</p>
  {:else if feedback(section)?.ok}
    <p class="set-msg set-msg-ok">{t(feedback(section)!.ok!)}</p>
  {/if}
{/snippet}

{#snippet sectionBody(section: string, idp: string)}
      {#if section === 'cuenta'}
        <SectionCard title={t('set.profile.title')} sub={t('set.access.sub')} noPad>
          <div class="set-row">
            <label for="{idp}-profile-name" class="set-lbl">
              <span class="set-lbl-name">{t('set.profile.name')}</span>
              <span class="set-lbl-hint">{t('set.profile.nameHint')}</span>
            </label>
            <div>
              <input id="{idp}-profile-name" name="name" type="text" maxlength="80" required
                form="{idp}-form-cuenta" bind:value={profileName} class="input set-input" />
              {@render feedbackLine('name')}
            </div>
          </div>

          <div class="set-row">
            <label for="{idp}-profile-email" class="set-lbl">
              <span class="set-lbl-name">{t('set.profile.email')}</span>
              <span class="set-lbl-hint">{t('set.profile.emailDesc')}</span>
            </label>
            <form method="POST" action="?/saveEmail" class="set-stack">
              <div class="set-inline">
                <Mail size={14} style="color:var(--mep-fg-3);" />
                <span class="set-value">{data.profile.email}</span>
                {#if data.profile.emailVerified}
                  <span class="badge badge-confirmed"><Check size={10} />{t('set.profile.emailVerified')}</span>
                {/if}
              </div>
              <div class="set-inline">
                <input id="{idp}-profile-email" name="email" type="email" required
                  value={data.profile.email} class="input set-input" />
                <button type="submit" class="btn btn-secondary">{t('set.profile.emailBtn')}</button>
              </div>
              {@render feedbackLine('email')}
            </form>
          </div>

          {#if data.profile.hasPassword}
            <div class="set-row set-row-top">
              <div class="set-lbl">
                <span class="set-lbl-name">{t('set.profile.password')}</span>
                <span class="set-lbl-hint">{t('set.profile.passwordHint')}</span>
              </div>
              <div>
                {#if pwOpen}
                  <form method="POST" action="?/changePassword" class="set-stack set-stack-narrow">
                    <input id="{idp}-pw-current" name="current" type="password" required autocomplete="current-password"
                      placeholder={t('set.profile.currentPassword')} class="input" />
                    <input name="password" type="password" required minlength="12" autocomplete="new-password"
                      placeholder={t('set.profile.newPassword')} class="input" />
                    <input name="confirm" type="password" required minlength="12" autocomplete="new-password"
                      placeholder={t('set.profile.confirmPassword')} class="input" />
                    <div class="set-inline">
                      <button type="submit" class="btn btn-primary">{t('set.profile.passwordBtn')}</button>
                      <button type="button" class="btn btn-ghost" onclick={() => (pwOpen = false)}>{t('set.cancel')}</button>
                    </div>
                    {@render feedbackLine('password')}
                  </form>
                {:else}
                  <div class="set-inline">
                    <span class="set-mask num">{t('set.profile.passwordMask')}</span>
                    <button type="button" class="btn btn-ghost set-btn-sm" onclick={() => (pwOpen = true)}>
                      {t('set.profile.passwordShow')} <ChevronDown size={12} />
                    </button>
                  </div>
                  {@render feedbackLine('password')}
                {/if}
              </div>
            </div>
          {/if}
        </SectionCard>

        <a href="/billing" class="card set-link">
          <span class="set-link-icon"><Wallet size={16} /></span>
          <span class="set-lbl">
            <span class="set-lbl-name">{t('billing.settings.link')}</span>
            <span class="set-lbl-hint">{t('billing.settings.linkBody')}</span>
          </span>
          <ChevronRight size={15} style="color:var(--mep-fg-3);flex-shrink:0;" />
        </a>
      {/if}

      {#if section === 'negocio'}
        <SectionCard title={t('set.business.title')} sub={t('set.business.sub')} noPad>
          <div class="set-row">
            {#if data.canRenameRestaurant}
              <label for="{idp}-restaurant-name" class="set-lbl">
                <span class="set-lbl-name">{t('set.profile.restaurant')}</span>
                <span class="set-lbl-hint">{t('set.business.nameHint')}</span>
              </label>
              <div>
                <input id="{idp}-restaurant-name" name="name" type="text" maxlength="120" required
                  form="{idp}-form-negocio" bind:value={restaurantName} class="input set-input" />
                {@render feedbackLine('restaurant')}
              </div>
            {:else}
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.profile.restaurant')}</span>
                <span class="set-lbl-hint">{t('set.business.nameHint')}</span>
              </span>
              <div>
                <span class="set-value">{data.restaurantName}</span>
                <p class="set-lbl-hint set-msg">{t('set.business.nameReadonlyHint')}</p>
                {@render feedbackLine('restaurant')}
              </div>
            {/if}
          </div>

          <div class="set-row">
            <span class="set-lbl">
              <span class="set-lbl-name">{t('set.business.currencyLabel')}</span>
              <span class="set-lbl-hint">{t('set.business.currencyHint')}</span>
            </span>
            <div class="set-readonly">
              <Wallet size={14} style="color:var(--mep-fg-3);" />
              {t('set.business.currencyValue')}
              <span class="set-spacer"></span>
              <span class="badge badge-neutral">{t('set.business.currencyFixed')}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('set.fiscal.title')} sub={t('set.fiscal.sub')} noPad>
          {#if data.canRenameRestaurant}
            <div class="set-row">
              <label for="{idp}-fiscal-legal-name" class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.legalName')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.legalNameHint')}</span>
              </label>
              <div>
                <input id="{idp}-fiscal-legal-name" name="legalName" type="text" maxlength="200"
                  form="{idp}-form-fiscal" value={data.fiscalIdentity.legalName} class="input set-input" />
              </div>
            </div>

            <div class="set-row">
              <label for="{idp}-fiscal-trade-name" class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.tradeName')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.tradeNameHint')}</span>
              </label>
              <div>
                <input id="{idp}-fiscal-trade-name" name="tradeName" type="text" maxlength="200"
                  form="{idp}-form-fiscal" value={data.fiscalIdentity.tradeName} class="input set-input" />
              </div>
            </div>

            <div class="set-row">
              <label for="{idp}-fiscal-cif" class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.cifNif')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.cifNifHint')}</span>
              </label>
              <div>
                <input id="{idp}-fiscal-cif" name="cifNif" type="text" maxlength="20" autocapitalize="characters"
                  form="{idp}-form-fiscal" value={data.fiscalIdentity.cifNif} class="input set-input" />
              </div>
            </div>

            <div class="set-row">
              <label for="{idp}-fiscal-address" class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.address')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.addressHint')}</span>
              </label>
              <div>
                <input id="{idp}-fiscal-address" name="fiscalAddress" type="text" maxlength="300"
                  form="{idp}-form-fiscal" value={data.fiscalIdentity.fiscalAddress} class="input set-input" />
              </div>
            </div>

            <div class="set-row">
              <label for="{idp}-fiscal-phone" class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.phone')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.phoneHint')}</span>
              </label>
              <div>
                <input id="{idp}-fiscal-phone" name="phone" type="text" maxlength="40"
                  form="{idp}-form-fiscal" value={data.fiscalIdentity.phone} class="input set-input" />
              </div>
            </div>

            <div class="set-row">
              <span class="set-lbl"></span>
              <div>
                <button type="submit" class="btn btn-primary" form="{idp}-form-fiscal">{t('set.fiscal.save')}</button>
                {@render feedbackLine('fiscal')}
              </div>
            </div>
          {:else}
            <div class="set-row">
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.legalName')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.legalNameHint')}</span>
              </span>
              <div>
                <span class="set-value">{data.fiscalIdentity.legalName || t('set.fiscal.empty')}</span>
                <p class="set-lbl-hint set-msg">{t('set.business.nameReadonlyHint')}</p>
              </div>
            </div>

            <div class="set-row">
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.tradeName')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.tradeNameHint')}</span>
              </span>
              <div><span class="set-value">{data.fiscalIdentity.tradeName || t('set.fiscal.empty')}</span></div>
            </div>

            <div class="set-row">
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.cifNif')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.cifNifHint')}</span>
              </span>
              <div><span class="set-value">{data.fiscalIdentity.cifNif || t('set.fiscal.empty')}</span></div>
            </div>

            <div class="set-row">
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.address')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.addressHint')}</span>
              </span>
              <div><span class="set-value">{data.fiscalIdentity.fiscalAddress || t('set.fiscal.empty')}</span></div>
            </div>

            <div class="set-row">
              <span class="set-lbl">
                <span class="set-lbl-name">{t('set.fiscal.phone')}</span>
                <span class="set-lbl-hint">{t('set.fiscal.phoneHint')}</span>
              </span>
              <div><span class="set-value">{data.fiscalIdentity.phone || t('set.fiscal.empty')}</span></div>
            </div>
          {/if}
        </SectionCard>

        {#if showLocations}
          <SectionCard title={t('set.locations.title')} noPad>
            {#snippet headerRight()}
              <span class="set-lbl-hint">
                {tp('set.locations.planIncludes', data.maxLocations)} {ti('set.locations.inUse', { used: usableLocations.length })}
              </span>
            {/snippet}
            {#each data.locations as loc}
              <div class="set-loc" class:locked={loc.locked}>
                <span class="set-loc-badge">{loc.name.slice(0, 1)}</span>
                <span class="set-loc-name">{loc.name}</span>
                {#if loc.id === data.activeRestaurantId}
                  <span class="badge set-badge-acc">{t('set.locations.current')}</span>
                {/if}
                {#if loc.locked}
                  <span class="badge badge-neutral"><Lock size={10} /> {t('set.locations.locked')}</span>
                {/if}
              </div>
            {/each}

            <div class="set-foot">
              {#if data.multiLocation && usableLocations.length < data.maxLocations}
                <form method="POST" action="?/addLocation" class="set-inline set-grow">
                  <input name="name" type="text" maxlength="120" required
                    placeholder={t('set.locations.newPlaceholder')} class="input set-grow" />
                  <button type="submit" class="btn btn-secondary">{t('set.locations.add')}</button>
                </form>
              {:else if data.multiLocation}
                <p class="set-lbl-hint">{t('set.locations.err.limitReached')}</p>
              {/if}
              {#if lockedLocations.length > 0}
                <p class="set-lbl-hint">
                  {tp('set.locations.lockedCount', lockedLocations.length)} · {t('set.locations.lockedHint')}
                </p>
              {/if}
              {@render feedbackLine('location')}
            </div>
          </SectionCard>
        {/if}
      {/if}

      {#if section === 'categorias'}
        <SectionCard title={t('set.categories.title')} sub={t('set.categories.sub')} noPad>
          {#each data.categories as cat (cat.id)}
            <div class="set-loc">
              <span class="set-loc-badge">{cat.name.slice(0, 1)}</span>
              {#if editingCategoryId === cat.id}
                <form method="POST" action="?/renameCategory" class="set-inline set-grow">
                  <input type="hidden" name="id" value={cat.id} />
                  <input name="name" type="text" maxlength="60" required
                    bind:value={editingCategoryName} class="input set-grow" />
                  <button type="submit" class="btn btn-secondary set-btn-sm">{t('set.categories.save')}</button>
                  <button type="button" class="btn btn-ghost set-btn-sm"
                    onclick={() => (editingCategoryId = null)}>{t('set.categories.cancel')}</button>
                </form>
              {:else}
                <span class="set-loc-name">{cat.name}</span>
                {#if cat.isDefault}<span class="badge badge-neutral">{t('set.categories.defaultBadge')}</span>{/if}
                {#if cat.hidden}<span class="badge badge-neutral">{t('set.categories.hiddenBadge')}</span>{/if}
                <span class="set-spacer"></span>
                {#if data.canManageCategories}
                  <button type="button" class="btn btn-ghost set-btn-sm"
                    onclick={() => startEditCategory(cat)}>{t('set.categories.rename')}</button>
                  <form method="POST" action="?/setCategoryHidden">
                    <input type="hidden" name="id" value={cat.id} />
                    <input type="hidden" name="hidden" value={cat.hidden ? '0' : '1'} />
                    <button type="submit" class="btn btn-ghost set-btn-sm">
                      {cat.hidden ? t('set.categories.show') : t('set.categories.hide')}
                    </button>
                  </form>
                {/if}
              {/if}
            </div>
          {/each}

          {#if data.canManageCategories}
            <form method="POST" action="?/addCategory" class="set-foot set-foot-fill set-inline">
              <input name="name" type="text" maxlength="60" required
                placeholder={t('set.categories.namePlaceholder')} class="input set-grow" />
              <button type="submit" class="btn btn-secondary">{t('set.categories.add')}</button>
            </form>
          {:else}
            <div class="set-foot"><p class="set-lbl-hint">{t('set.categories.err.notOwner')}</p></div>
          {/if}
          {@render feedbackLine('categorias')}
        </SectionCard>
      {/if}

      {#if section === 'campos'}
        <SectionCard title={t('set.fields.title')} sub={t('set.fields.sub')} noPad>
          {#each data.optionalFields as field}
            <label class="alert-toggle" for={`${idp}-field-vis-${field}`}>
              <span class="alert-toggle-copy">
                <span class="set-lbl-name">{t(`set.fields.label.${field}`)}</span>
                <span class="set-lbl-hint">{t(`set.fields.desc.${field}`)}</span>
              </span>
              <input
                id={`${idp}-field-vis-${field}`}
                class="alert-toggle-input"
                type="checkbox"
                form="{idp}-form-campos"
                name={`field_${field}`}
                checked={data.fieldVisibility[field]}
                onchange={(e) => (fieldVisPrefs[field] = e.currentTarget.checked)}
              />
              <span class="alert-toggle-track"><span class="alert-toggle-thumb"></span></span>
            </label>
          {/each}
          {@render feedbackLine('campos')}
        </SectionCard>
      {/if}

      {#if section === 'alertas'}
        <SectionCard title={t('set.thresholdsTitle')} noPad>
          <div class="set-row set-row-top">
            <span class="set-lbl">
              <span class="set-lbl-name">{t('set.threshold.label')}</span>
              <span class="set-lbl-hint">{t('set.thresholdDesc')}</span>
            </span>
            <div>
              <div class="set-slider">
                <div class="set-slider-track">
                  <Slider bind:value={threshold} min={50} max={100} name="threshold" form="{idp}-form-alertas" />
                  <div class="num set-slider-ends"><span>50%</span><span>100%</span></div>
                </div>
                <div class="set-inline">
                  <button type="button" class="btn btn-secondary set-step"
                    aria-label={t('set.thresholdTitle')}
                    onclick={() => (threshold = Math.max(50, threshold - 1))}>−</button>
                  <div class="num set-readout">
                    {threshold}<span class="set-readout-unit">%</span>
                  </div>
                  <button type="button" class="btn btn-secondary set-step"
                    aria-label={t('set.thresholdTitle')}
                    onclick={() => (threshold = Math.min(100, threshold + 1))}>+</button>
                </div>
              </div>
              <p class="set-lbl-hint set-msg">{ti('set.thresholdPreview', { value: threshold })}</p>
            </div>
          </div>

          <div class="set-row set-row-top">
            <span class="set-lbl">
              <span class="set-lbl-name">{t('set.priceThreshold.label')}</span>
              <span class="set-lbl-hint">{t('set.priceThresholdDesc')}</span>
            </span>
            <div>
              <div class="set-slider">
                <div class="set-slider-track">
                  <Slider bind:value={priceThreshold} min={1} max={50} name="priceThreshold" form="{idp}-form-alertas" />
                  <div class="num set-slider-ends"><span>1%</span><span>50%</span></div>
                </div>
                <div class="set-inline">
                  <button type="button" class="btn btn-secondary set-step"
                    aria-label={t('set.priceThresholdTitle')}
                    onclick={() => (priceThreshold = Math.max(1, priceThreshold - 1))}>−</button>
                  <div class="num set-readout">
                    {priceThreshold}<span class="set-readout-unit">%</span>
                  </div>
                  <button type="button" class="btn btn-secondary set-step"
                    aria-label={t('set.priceThresholdTitle')}
                    onclick={() => (priceThreshold = Math.min(50, priceThreshold + 1))}>+</button>
                </div>
              </div>
              <p class="set-lbl-hint set-msg">{ti('set.priceThresholdPreview', { value: priceThreshold })}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('set.alertPrefs.title')} sub={t('set.alertPrefs.sub')} noPad>
          {#snippet headerRight()}
            <span class="set-lbl-hint num">{ti('set.alertPrefs.count', { on: alertsOn, total: alertTypes.length })}</span>
          {/snippet}
          {#each data.alertGroups as group}
            <div class="set-group">
              <span class="label">{t(`set.alertPrefs.group.${group.id}`)}</span>
              <span class="set-spacer"></span>
              <span class="set-lbl-hint num">{ti('set.alertPrefs.groupCount', { on: groupOn(group.types), total: group.types.length })}</span>
            </div>
            {#each group.types as type}
              <label class="alert-toggle" for={`${idp}-alert-pref-${type}`}>
                <span class="alert-toggle-copy">
                  <span class="set-lbl-name">{t(`set.alertPrefs.type.${type}`)}</span>
                  <span class="set-lbl-hint">{t(`set.alertPrefs.desc.${type}`)}</span>
                </span>
                <input
                  id={`${idp}-alert-pref-${type}`}
                  class="alert-toggle-input"
                  type="checkbox"
                  form="{idp}-form-alertas"
                  name={`alert_${type}`}
                  checked={data.alertPreferences[type]}
                  onchange={(e) => (alertPrefs[type] = e.currentTarget.checked)}
                />
                <span class="alert-toggle-track"><span class="alert-toggle-thumb"></span></span>
              </label>
            {/each}
          {/each}
        </SectionCard>
      {/if}

      {#if section === 'whatsapp' && data.whatsappEnabled}
        <div class="set-wa">
          {#if data.whatsappBotNumber}
            <SectionCard title={t('set.whatsapp.botTitle')}>
              <div class="wa-number-block">
                <a
                  href={data.whatsappBotNumber.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="wa-number num"
                >{data.whatsappBotNumber.display}</a>
                {#if data.whatsappBotNumber.qrSvg}
                  <div class="wa-qr" aria-hidden="true">{@html data.whatsappBotNumber.qrSvg}</div>
                  <p class="set-lbl-hint wa-center">{t('set.whatsapp.qrHint')}</p>
                {/if}
                <button
                  type="button"
                  class="btn btn-secondary wa-no-print set-grow"
                  onclick={() => copyBotNumber(data.whatsappBotNumber!.link)}
                >{botNumberCopied ? t('set.whatsapp.copied') : t('set.whatsapp.copy')}</button>
              </div>
            </SectionCard>
          {/if}

          <div class="set-wa-col">
            <SectionCard title={t('set.whatsapp.contactsTitle')} noPad>
              <div class="set-foot set-foot-top">
                <p class="set-lbl-hint">{t('set.whatsapp.desc')}</p>
              </div>
              {#if data.whatsappContacts.length > 0}
                {#each data.whatsappContacts as contact (contact.id)}
                  <div class="set-loc">
                    <span class="set-loc-badge set-loc-badge-pos">{(contact.displayName ?? '#').slice(0, 1)}</span>
                    <span class="set-loc-name num">{formatPhoneNumber(contact.phoneNumber)}</span>
                    {#if contact.displayName}
                      <span class="set-lbl-hint">{contact.displayName}</span>
                    {/if}
                    <span class="set-spacer"></span>
                    {#if data.canManageWhatsapp}
                      <form method="POST" action="?/removeWhatsappContact">
                        <input type="hidden" name="id" value={contact.id} />
                        <button type="submit" class="btn btn-ghost set-btn-sm">{t('set.whatsapp.remove')}</button>
                      </form>
                    {/if}
                  </div>
                {/each}
              {:else}
                <div class="set-foot"><p class="set-lbl-hint">{t('set.whatsapp.empty')}</p></div>
              {/if}

              {#if data.canManageWhatsapp}
                <form method="POST" action="?/addWhatsappContact" class="set-foot set-foot-fill set-inline">
                  <input name="phone" type="tel" required
                    placeholder={t('set.whatsapp.phonePlaceholder')} class="input set-grow" />
                  <input name="name" type="text" maxlength="80"
                    placeholder={t('set.whatsapp.namePlaceholder')} class="input set-grow" />
                  <button type="submit" class="btn btn-secondary">{t('set.whatsapp.add')}</button>
                </form>
              {:else}
                <div class="set-foot"><p class="set-lbl-hint">{t('set.whatsapp.err.notOwner')}</p></div>
              {/if}
            </SectionCard>

            {#if data.canManageWhatsapp}
              <SectionCard title={t('set.whatsapp.pairTitle')}>
                <div class="set-pair">
                  <div class="set-pair-copy">
                    {#if data.whatsappPairingCode}
                      <p class="set-lbl-hint">
                        {#if data.whatsappPairingCode.phoneNumber}
                          {ti('set.whatsapp.pairActiveFor', { phone: formatPhoneNumber(data.whatsappPairingCode.phoneNumber) })}
                        {:else}
                          {t('set.whatsapp.pairActive')}
                        {/if}
                      </p>
                      <div class="set-inline">
                        <form method="POST" action="?/generateWhatsappPairingCode">
                          <button type="submit" class="btn btn-secondary set-btn-sm">{t('set.whatsapp.pairRegenerate')}</button>
                        </form>
                        <form method="POST" action="?/revokeWhatsappPairingCode">
                          <button type="submit" class="btn btn-ghost set-btn-sm">{t('set.whatsapp.pairRevoke')}</button>
                        </form>
                      </div>
                    {:else}
                      <p class="set-lbl-hint">{t('set.whatsapp.pairDesc')}</p>
                      <form method="POST" action="?/generateWhatsappPairingCode" class="set-inline">
                        <input name="name" type="text" maxlength="80"
                          placeholder={t('set.whatsapp.namePlaceholder')} class="input set-grow" />
                        <button type="submit" class="btn btn-secondary set-btn-sm">{t('set.whatsapp.pairGenerate')}</button>
                      </form>
                    {/if}
                  </div>
                  {#if data.whatsappPairingCode}
                    <div class="wa-pair-block">
                      <p class="wa-pair-code">{data.whatsappPairingCode.code}</p>
                      <p class="set-lbl-hint">
                        {ti('set.whatsapp.pairExpires', { time: formatTime(data.whatsappPairingCode.expiresAt) })}
                      </p>
                    </div>
                  {/if}
                </div>
                {@render feedbackLine('whatsapp')}
              </SectionCard>
            {/if}
          </div>
        </div>
      {/if}

      {#if section === 'ayuda'}
        <SectionCard title={t('set.tourTitle')}>
          <div class="set-tour">
            <span class="set-link-icon"><Compass size={18} /></span>
            <div class="set-stack">
              <p class="set-prose">{t('set.tourDesc')}</p>
              <div class="set-chips">
                {#each TOUR_PAGES as page (page.step)}
                  <span class="badge badge-neutral">{t(`help.tip.${page.tip}.title`)}</span>
                {/each}
              </div>
              <form method="POST" action="?/resetTutorial">
                <button type="submit" class="btn btn-secondary">{t('set.tourRepeat')}</button>
              </form>
            </div>
          </div>
        </SectionCard>

        <a href="/help" class="card set-link">
          <span class="set-link-icon"><CircleHelp size={16} /></span>
          <span class="set-lbl">
            <span class="set-lbl-name">{t('set.helpLink')}</span>
            <span class="set-lbl-hint">{t('set.helpLinkBody')}</span>
          </span>
          <ChevronRight size={15} style="color:var(--mep-fg-3);flex-shrink:0;" />
        </a>

        <SectionCard title={t('set.faqShort')} sub={t('set.faqShortSub')} noPad>
          {#each HELP_FAQ as item (item)}
            <a href="/help" class="set-faq-link">
              <span class="set-lbl-name">{t(`help.faq.${item}.q`)}</span>
              <ChevronRight size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
            </a>
          {/each}
        </SectionCard>
      {/if}

      {#if section === 'datos'}
        <SectionCard title={t('set.dataTitle')} noPad>
          <div class="set-row">
            <span class="set-lbl">
              <span class="set-lbl-name">{t('set.dataExportBtn')}</span>
              <span class="set-lbl-hint">{t('set.dataExportDesc')}</span>
            </span>
            <div>
              <a href="/api/user/export" download class="btn btn-secondary set-btn-link">
                <Download size={13} /> {t('set.download')}
              </a>
            </div>
          </div>
          <div class="set-row">
            <span class="set-lbl">
              <span class="set-lbl-name">{t('set.legalTitle')}</span>
              <span class="set-lbl-hint">{t('set.legalSub')}</span>
            </span>
            <div class="set-legal">
              <a href="/privacy" class="set-legal-link">{t('set.privacyLink')}</a>
              <a href="/terms" class="set-legal-link">{t('set.termsLink')}</a>
            </div>
          </div>
        </SectionCard>

        <div class="card set-danger-card">
          <div class="card-header set-danger-head">
            <span class="subtitle set-danger-title">{t('set.dangerTitle')}</span>
          </div>
          <div class="set-danger-body">
            {#if dangerOpen}
              <div style="border:1px solid var(--mep-neg);background:var(--mep-neg-soft);border-radius:var(--mep-r-card);padding:14px;display:flex;gap:10px;align-items:flex-start;">
                <AlertTriangle size={18} style="color:var(--mep-neg);flex-shrink:0;margin-top:2px;" />
                <div class="set-grow">
                  <p class="set-danger-lead">{t('set.deleteDesc')}</p>
                  {#if !data.profile.hasPassword}
                    <p class="set-lbl-hint set-danger-hint">
                      {t('set.deleteType')} <strong>{t('set.deleteConfirmWord')}</strong> {t('set.deleteHint')}
                    </p>
                    <div class="set-inline">
                      <input
                        type="text"
                        placeholder={t('set.deleteConfirmWord')}
                        bind:value={deleteConfirm}
                        class="input set-danger-input"
                      />
                      <button
                        type="button"
                        onclick={handleDeleteAccount}
                        disabled={deleteConfirm !== t('set.deleteConfirmWord') || deleting}
                        class="btn"
                        style="background:var(--mep-neg);color:var(--mep-neg-fg);border:none;opacity:{deleteConfirm !== t('set.deleteConfirmWord') || deleting ? 0.5 : 1};"
                      >
                        {deleting ? t('set.deletingBtn') : t('set.deleteBtn')}
                      </button>
                      <button type="button" class="btn btn-ghost" onclick={() => (dangerOpen = false)}>{t('set.cancel')}</button>
                    </div>
                  {:else}
                    <p class="set-lbl-hint set-danger-hint">{t('set.deletePasswordHint')}</p>
                    <div class="set-inline">
                      <input
                        type="password"
                        autocomplete="current-password"
                        placeholder={t('set.profile.currentPassword')}
                        bind:value={deletePassword}
                        class="input set-danger-input"
                      />
                      <button
                        type="button"
                        onclick={handleDeleteAccount}
                        disabled={deletePassword.length === 0 || deleting}
                        class="btn"
                        style="background:var(--mep-neg);color:var(--mep-neg-fg);border:none;opacity:{deletePassword.length === 0 || deleting ? 0.5 : 1};"
                      >
                        {deleting ? t('set.deletingBtn') : t('set.deleteBtn')}
                      </button>
                      <button type="button" class="btn btn-ghost" onclick={() => (dangerOpen = false)}>{t('set.cancel')}</button>
                    </div>
                  {/if}
                  {#if deleteError}
                    <p class="set-msg set-msg-err">{deleteError}</p>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="set-inline">
                <span class="set-lbl set-grow">
                  <span class="set-lbl-name">{t('set.deleteBtn')}</span>
                  <span class="set-lbl-hint">{t('set.deleteSub')}</span>
                </span>
                <button type="button" class="btn btn-secondary set-danger-open" onclick={() => (dangerOpen = true)}>
                  {t('set.deleteOpen')}
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
{/snippet}

{#snippet searchResults(idp: string)}
  <div class="card set-results">
    <div class="card-header">
      <span class="subtitle">{tp('set.searchCount', results.length)}</span>
    </div>
    {#each results as entry (idp + entry.key)}
      <button type="button" class="set-result" onclick={() => goToResult(entry.section)}>
        <span class="set-lbl-name">{t(entry.key)}</span>
        <span class="set-spacer"></span>
        <span class="badge badge-neutral">{sectionOf(entry.section).label}</span>
        <ChevronRight size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
      </button>
    {:else}
      <div class="set-foot"><p class="set-lbl-hint">{t('set.searchEmpty')}</p></div>
    {/each}
  </div>
{/snippet}

{#snippet searchBox(idp: string)}
  <div class="set-search">
    <Search size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
    <input type="text" bind:value={query} placeholder={t('set.search')} aria-label={t('set.search')} />
    {#if query.trim().length > 0}
      <button type="button" class="set-search-clear" aria-label={t('set.searchClear')} onclick={() => (query = '')}>
        <X size={13} />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet saveBar(section: string | null, idp: string)}
  {@const pending = pendingOf(section)}
  {#if pending > 0}
    <div class="set-savebar">
      <span class="set-savebar-dot"></span>
      <span class="set-savebar-text">{tp('set.dirty', pending)}</span>
      <span class="set-spacer"></span>
      <button type="button" class="btn btn-ghost" onclick={() => discard(section)}>{t('set.discard')}</button>
      <button type="submit" class="btn btn-primary" form={savableForm(section, idp)}>{t('set.saveChanges')}</button>
    </div>
  {/if}
{/snippet}

<form method="POST" action="?/saveName" id="d-form-cuenta"></form>
<form method="POST" action="?/renameRestaurant" id="d-form-negocio"></form>
<form method="POST" action="?/saveFiscalIdentity" id="d-form-fiscal"></form>
<form method="POST" action="?/saveFieldVisibility" id="d-form-campos"></form>
<form method="POST" action="?/saveAlertPreferences" id="d-form-alertas"></form>
<form method="POST" action="?/saveName" id="m-form-cuenta"></form>
<form method="POST" action="?/renameRestaurant" id="m-form-negocio"></form>
<form method="POST" action="?/saveFiscalIdentity" id="m-form-fiscal"></form>
<form method="POST" action="?/saveFieldVisibility" id="m-form-campos"></form>
<form method="POST" action="?/saveAlertPreferences" id="m-form-alertas"></form>

<div class="hidden md:flex set-shell">
  <nav class="settings-rail">
    {@render searchBox('d')}
    {#each sections as s}
      <button
        type="button"
        class="settings-rail-item"
        class:active={activeSection === s.id && query.trim().length === 0}
        onclick={() => { query = ''; activeSection = s.id; }}
      >
        <s.icon size={15} /><span>{s.label}</span>
      </button>
    {/each}
  </nav>

  <div class="settings-content">
    <div class="set-content" data-coach="settings-main">
      {#if query.trim().length > 0}
        {@render searchResults('d')}
      {:else}
        <div class="set-head">
          <div class="set-head-copy">
            <h2 class="title set-head-title">{sectionOf(activeSection).label}</h2>
            <p class="body set-head-sub">{sectionOf(activeSection).sub}</p>
          </div>
          {#if data.canRenameRestaurant}
            <span class="badge badge-neutral set-head-badge">{t('set.owner')}</span>
          {/if}
        </div>
        {@render sectionBody(activeSection, 'd')}
      {/if}
      {@render saveBar(query.trim().length > 0 ? null : activeSection, 'd')}
    </div>
  </div>
</div>

<div class="md:hidden set-mob" data-coach="settings-main">
  <div class="set-mob-scroll">
    {#if mobileSection === null}
      {@render searchBox('m')}
      {#if query.trim().length > 0}
        {@render searchResults('m')}
      {:else}
        <div class="card set-mob-list">
          {#each sections as s (s.id)}
            <button type="button" class="set-mob-item" onclick={() => (mobileSection = s.id)}>
              <span class="set-mob-icon"><s.icon size={16} /></span>
              <span class="set-lbl set-grow">
                <span class="set-mob-name">{s.label}</span>
                <span class="set-lbl-hint">{s.sub}</span>
              </span>
              <ChevronRight size={16} style="color:var(--mep-fg-3);flex-shrink:0;" />
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <button type="button" class="set-mob-back" onclick={() => (mobileSection = null)}>
        <ChevronLeft size={16} /> {t('set.back')}
      </button>
      <h2 class="title set-head-title">{sectionOf(mobileSection).label}</h2>
      <p class="body set-head-sub set-mob-sub">{sectionOf(mobileSection).sub}</p>
      {@render sectionBody(mobileSection, 'm')}
    {/if}
    {@render saveBar(mobileSection, 'm')}
  </div>
</div>

<style>
  .set-shell { flex: 1; min-height: 0; }
  .settings-rail {
    width: 224px;
    flex-shrink: 0;
    padding: 18px 12px;
    border-right: 1px solid var(--mep-divider);
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }
  .settings-rail-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    height: 34px;
    border-radius: var(--mep-r-input);
    border: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    background: transparent;
    color: var(--mep-fg-2);
    font-size: 13px;
    font-weight: 400;
    transition: background 150ms ease-out, color 150ms ease-out;
  }
  .settings-rail-item:hover { background: var(--mep-hover); color: var(--mep-fg); }
  .settings-rail-item.active {
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    font-weight: 500;
  }
  .settings-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .set-content {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    padding: 24px clamp(16px, 3vw, 30px) 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .set-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .set-head-copy { min-width: 0; }
  .set-head-title { margin: 0 0 3px; }
  .set-head-sub { margin: 0; max-width: 62ch; }
  .set-head-badge { flex-shrink: 0; margin-top: 3px; }

  .set-row {
    display: grid;
    grid-template-columns: minmax(0, 232px) minmax(0, 1fr);
    gap: 20px;
    padding: 13px 18px;
    border-bottom: 1px solid var(--mep-divider);
    align-items: center;
  }
  .set-row:last-child { border-bottom: none; }
  .set-row-top { align-items: start; }
  .set-lbl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .set-lbl-name { font-size: 13px; font-weight: 500; color: var(--mep-fg); }
  .set-lbl-hint { font-size: 11.5px; color: var(--mep-fg-3); line-height: 1.45; }
  .set-value { font-size: 13px; color: var(--mep-fg); }
  .set-mask { font-size: 15px; color: var(--mep-fg-3); letter-spacing: 0.14em; }
  .set-input { height: 34px; width: 100%; max-width: 300px; }
  .set-stack { display: flex; flex-direction: column; gap: 8px; }
  .set-stack-narrow { max-width: 300px; }
  .set-inline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .set-grow { flex: 1; min-width: 0; }
  .set-spacer { flex: 1; }
  .set-btn-sm { height: 28px; font-size: 12.5px; }
  .set-btn-link { height: 34px; text-decoration: none; }
  .set-msg { margin: 6px 0 0; font-size: 12px; }
  .set-msg-err { color: var(--mep-neg); }
  .set-msg-ok { color: var(--mep-pos); }
  .set-prose { font-size: 13px; color: var(--mep-fg-2); line-height: 1.55; margin: 0; max-width: 62ch; }

  .set-readonly {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    border-radius: var(--mep-r-input);
    border: 1px solid var(--mep-border);
    background: var(--mep-surface-2);
    color: var(--mep-fg-2);
    font-size: 13px;
    width: 100%;
    max-width: 300px;
  }

  .set-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    text-decoration: none;
  }
  .set-link:hover { background: var(--mep-hover); }
  .set-link-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .set-loc {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 8px 18px;
    border-bottom: 1px solid var(--mep-divider);
  }
  .set-loc-badge {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    text-transform: uppercase;
  }
  .set-loc-badge-pos { background: var(--mep-pos-soft); color: var(--mep-pos); }
  .set-loc-name { font-size: 13px; font-weight: 500; color: var(--mep-fg); }
  .set-loc.locked .set-loc-name { color: var(--mep-fg-4); }
  .set-loc.locked .set-loc-badge { background: var(--mep-hover); color: var(--mep-fg-4); }
  .set-badge-acc { background: var(--mep-acc-soft); color: var(--mep-acc); }

  .set-foot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--mep-divider);
  }
  .set-foot-top { border-top: none; padding-bottom: 4px; }
  .set-foot-fill { background: var(--mep-surface-2); }

  .set-slider { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .set-slider-track { flex: 1 1 200px; max-width: 260px; min-width: 160px; }
  .set-slider-ends {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--mep-fg-4);
    margin-top: 4px;
  }
  .set-step { width: 26px; height: 26px; padding: 0; justify-content: center; }
  .set-readout {
    min-width: 58px;
    height: 30px;
    border-radius: var(--mep-r-input);
    border: 1px solid var(--mep-border-strong);
    background: var(--mep-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--mep-fg);
  }
  .set-readout-unit { font-size: 11px; color: var(--mep-fg-3); font-weight: 400; }

  .set-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px 6px;
    background: var(--mep-surface-2);
    border-top: 1px solid var(--mep-divider);
  }
  .alert-toggle {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 44px;
    padding: 9px 18px;
    border-top: 1px solid var(--mep-divider);
    cursor: pointer;
  }
  .alert-toggle:hover { background: var(--mep-hover); }
  .alert-toggle-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  .alert-toggle-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .alert-toggle-track {
    flex: 0 0 auto;
    width: 34px;
    height: 20px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-border-strong);
    transition: background 0.15s ease;
  }
  .alert-toggle-thumb {
    display: block;
    width: 16px;
    height: 16px;
    margin: 2px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-surface);
    transition: transform 0.15s ease;
  }
  .alert-toggle-input:checked + .alert-toggle-track { background: var(--mep-acc); }
  .alert-toggle-input:checked + .alert-toggle-track .alert-toggle-thumb { transform: translateX(14px); }
  .alert-toggle-input:focus-visible + .alert-toggle-track {
    outline: 2px solid var(--mep-acc);
    outline-offset: 2px;
  }

  .set-wa { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .set-wa :global(> .card) { flex: 0 0 268px; }
  .set-wa-col { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .wa-number-block { display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .wa-number { font-size: 17px; font-weight: 600; color: var(--mep-fg); }
  .wa-center { text-align: center; }
  .wa-qr { width: 148px; max-width: 100%; }
  .wa-qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    background: #fff;
    padding: 6px;
    border-radius: var(--mep-r-tag);
  }
  .set-pair { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
  .set-pair-copy { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .wa-pair-block {
    flex-shrink: 0;
    padding: 10px 18px;
    border: 1px dashed var(--mep-border-strong);
    border-radius: 8px;
    text-align: center;
  }
  .wa-pair-code {
    margin: 0;
    font-family: var(--mep-fs-mono);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--mep-fg);
  }

  .set-tour { display: flex; gap: 14px; align-items: flex-start; }
  .set-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .set-faq-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 11px 18px;
    border-bottom: 1px solid var(--mep-divider);
    text-decoration: none;
  }
  .set-faq-link:last-child { border-bottom: none; }
  .set-faq-link:hover { background: var(--mep-hover); }
  .set-legal { display: flex; gap: 16px; flex-wrap: wrap; }
  .set-legal-link { font-size: 13px; color: var(--mep-fg-3); }

  .set-danger-card { border-color: color-mix(in srgb, var(--mep-neg) 35%, transparent); overflow: hidden; }
  .set-danger-head { border-bottom-color: color-mix(in srgb, var(--mep-neg) 20%, transparent); }
  .set-danger-title { color: var(--mep-neg); }
  .set-danger-body { padding: 14px 18px; }
  .set-danger-lead { font-size: 13px; margin: 0 0 4px; color: var(--mep-neg); font-weight: 500; }
  .set-danger-hint { margin: 0 0 10px; }
  .set-danger-input { height: 34px; width: 150px; }
  .set-danger-open { border-color: color-mix(in srgb, var(--mep-neg) 40%, transparent); color: var(--mep-neg); }

  .set-search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 9px;
    border-radius: var(--mep-r-input);
    border: 1px solid var(--mep-border-strong);
    background: var(--mep-surface);
    margin-bottom: 12px;
  }
  .set-search input {
    border: 0;
    outline: 0;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--mep-fg);
    background: transparent;
    width: 100%;
    min-width: 0;
  }
  .set-search input::placeholder { color: var(--mep-fg-4); }
  .set-search-clear {
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    display: flex;
    color: var(--mep-fg-3);
  }
  .set-results { overflow: hidden; }
  .set-result {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 11px 18px;
    border: 0;
    border-bottom: 1px solid var(--mep-divider);
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .set-result:last-child { border-bottom: none; }
  .set-result:hover { background: var(--mep-hover); }

  .set-savebar {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 60px;
    flex-shrink: 0;
    background: var(--mep-surface);
    border: 1px solid var(--mep-border);
    border-radius: var(--mep-r-card);
    box-shadow: var(--mep-shadow-pop);
    animation: set-savebar-in 180ms ease-out;
  }
  @keyframes set-savebar-in {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  .set-savebar-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-acc);
    flex-shrink: 0;
  }
  .set-savebar-text { font-size: 13px; font-weight: 500; color: var(--mep-fg); }

  .set-mob { flex: 1; min-height: 0; }
  .set-mob-scroll {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    padding: 14px 14px 28px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .set-mob-list { overflow: hidden; }
  .set-mob-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 8px 16px;
    border: 0;
    border-bottom: 1px solid var(--mep-divider);
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .set-mob-item:last-child { border-bottom: none; }
  .set-mob-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--mep-hover);
    color: var(--mep-fg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .set-mob-name { font-size: 14px; font-weight: 500; color: var(--mep-fg); }
  .set-mob-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    min-height: 44px;
    padding: 0 6px 0 0;
    border: 0;
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    color: var(--mep-fg-2);
    cursor: pointer;
  }
  .set-mob-sub { margin: 0; }

  @container (max-width: 620px) {
    .set-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      align-items: stretch !important;
    }
    .set-input, .set-readonly { max-width: 100%; }
  }

  @media (max-width: 767px) {
    .set-mob { display: flex; flex-direction: column; }
    .set-legal-link, .set-faq-link { min-height: 44px; display: flex; align-items: center; }
    .set-mob-scroll :global(.mep-slider-input) {
      height: 44px;
      top: 50%;
      transform: translateY(-50%);
    }
    .set-mob-scroll :global(.btn) { min-height: 40px; }
    .set-step { width: 40px; height: 40px; }
  }

  @media print {
    .wa-no-print { display: none; }
    .wa-qr { width: 45mm; }
    .wa-qr :global(svg) { background: #fff; }
  }
</style>
