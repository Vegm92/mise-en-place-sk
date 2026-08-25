<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    approved: 'var(--mep-pos)',
    pending:  'var(--mep-warn)',
    rejected: 'var(--mep-fg-3)',
  };
  const STATUS_BG: Record<string, string> = {
    approved: 'var(--mep-pos-soft)',
    pending:  'var(--mep-warn-soft)',
    rejected: 'var(--mep-hover)',
  };

  const META = 'font-size:11px;color:var(--mep-fg-3);';
</script>

<AdminPageHead route="/admin/users" title={$t('admin.users')} subtitle={$t('admin.usersSubtitle')}>
  {#snippet right()}
    <span class="num" style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.totalSuffix', { n: data.users.length.toLocaleString('en-US') })}</span>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:16px;">

  <form method="GET" action="/admin/users" style="display:flex;gap:8px;align-items:center;">
    <input
      name="q"
      value={data.q}
      placeholder={$t('admin.usersSearchPlaceholder')}
      class="input"
      style="flex:1;max-width:320px;"
    />
    <button type="submit" class="btn btn-secondary">{$t('admin.usersSearch')}</button>
  </form>

  <SectionCard title={$t('admin.users')}>
    {#each data.users as u}
      <a
        href="/admin/users/{u.id}"
        style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--mep-divider);text-decoration:none;"
      >
        <span style="min-width:0;flex:1 1 180px;">
          <span style="display:block;font-size:13px;font-weight:600;color:var(--mep-acc);">{u.name || u.email}</span>
          <span style="display:block;{META}overflow:hidden;text-overflow:ellipsis;">{u.name ? u.email : ''}{u.restaurants ? ` · ${u.restaurants}` : ''}</span>
        </span>

        <span style="display:flex;gap:16px;align-items:baseline;flex:0 0 auto;">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:{STATUS_BG[u.access_status] ?? 'var(--mep-hover)'};color:{STATUS_COLOR[u.access_status] ?? 'var(--mep-fg-3)'};">
            {u.access_status}
          </span>
          <span style="text-align:right;">
            <span class="num" style="display:block;font-size:13px;color:var(--mep-fg);">{$ti('admin.issueEvents', { n: u.event_count.toLocaleString('en-US') })}</span>
            <span style="display:block;{META}white-space:nowrap;">
              {u.last_event_at
                ? new Date(u.last_event_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                : $t('admin.never')}
            </span>
          </span>
        </span>
      </a>
    {:else}
      <p style="font-size:13px;color:var(--mep-fg-4);margin:0;">{$t('admin.noUsers')}</p>
    {/each}
  </SectionCard>

</div>
