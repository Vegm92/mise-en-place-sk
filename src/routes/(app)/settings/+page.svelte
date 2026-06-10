<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();

  let deleteConfirm = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'ELIMINAR') return;
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
        deleteError = body.message ?? 'Error al eliminar la cuenta.';
      }
    } catch {
      deleteError = 'Error de red. Inténtalo de nuevo.';
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

    <SectionCard title="Tour guiado">
      <p class="body text-fg-2" style="font-size:13px;margin:0 0 12px;">
        Repasa el tutorial de inicio en cualquier momento.
      </p>
      <form method="POST" action="?/resetTutorial">
        <button type="submit" class="btn btn-secondary" style="height:34px;font-size:13px;">
          Repetir tour →
        </button>
      </form>
    </SectionCard>

    <SectionCard title="Privacidad y datos">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <p class="body text-fg-2" style="font-size:13px;margin:0 0 8px;">
            Descarga una copia de todos tus datos en formato JSON portable (RGPD Art. 20).
          </p>
          <a href="/api/user/export" download class="btn btn-secondary" style="height:34px;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;">
            Exportar mis datos
          </a>
        </div>

        <hr style="border:none;border-top:1px solid var(--mep-divider);margin:4px 0;" />

        <div>
          <p class="body text-fg-2" style="font-size:13px;margin:0 0 4px;">
            Elimina permanentemente tu cuenta y todos tus datos.
          </p>
          <p class="body text-fg-3" style="font-size:12px;margin:0 0 10px;">
            Escribe <strong>ELIMINAR</strong> para confirmar. Esta acción no se puede deshacer.
          </p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input
              type="text"
              placeholder="ELIMINAR"
              bind:value={deleteConfirm}
              class="input"
              style="height:34px;font-size:13px;width:140px;"
            />
            <button
              type="button"
              onclick={handleDeleteAccount}
              disabled={deleteConfirm !== 'ELIMINAR' || deleting}
              class="btn"
              style="height:34px;font-size:13px;background:var(--mep-danger,#c0392b);color:#fff;border:none;opacity:{deleteConfirm !== 'ELIMINAR' || deleting ? 0.5 : 1};"
            >
              {deleting ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
          </div>
          {#if deleteError}
            <p style="font-size:12px;color:var(--mep-danger,#c0392b);margin:6px 0 0;">{deleteError}</p>
          {/if}
        </div>

        <div style="display:flex;gap:12px;margin-top:4px;">
          <a href="/privacy" style="font-size:12px;color:var(--mep-fg-3);">Política de Privacidad</a>
          <a href="/terms"   style="font-size:12px;color:var(--mep-fg-3);">Términos de Servicio</a>
        </div>
      </div>
    </SectionCard>

  </div>
</div>
