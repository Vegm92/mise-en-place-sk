<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';

  const tabs = $derived([
    { href: '/analytics/spend',  label: $t('nav.compras.resumen') },
    { href: '/suppliers',        label: $t('nav.compras.proveedores') },
    { href: '/products',         label: $t('nav.compras.productos') },
    { href: '/analytics/prices', label: $t('nav.compras.comparativa') },
    { href: '/budgets',          label: $t('nav.compras.presupuestos') },
  ]);

  const isActive = (href: string) => $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
</script>

<div style="display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--mep-divider);overflow-x:auto;">
  {#each tabs as tab}
    <a
      href={tab.href}
      style="
        padding:10px 14px;font-size:13px;white-space:nowrap;text-decoration:none;
        color:{isActive(tab.href) ? 'var(--mep-acc)' : 'var(--mep-fg-2)'};
        font-weight:{isActive(tab.href) ? 500 : 400};
        border-bottom:2px solid {isActive(tab.href) ? 'var(--mep-acc)' : 'transparent'};
        margin-bottom:-1px;
      "
    >{tab.label}</a>
  {/each}
</div>
