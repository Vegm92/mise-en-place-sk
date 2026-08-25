<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  let { data }: { data: PageData } = $props();

  function clock(iso: string) {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function day(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function minutes(from: string, to: string) {
    return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  }
  function pretty(payload: string | null) {
    if (!payload) return '';
    try {
      return Object.entries(JSON.parse(payload) as Record<string, unknown>)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('  ');
    } catch {
      return payload;
    }
  }
</script>

<AdminPageHead
  route="/admin/users/{data.user.id}"
  title={data.user.name || data.user.email}
  subtitle={data.user.restaurants ?? data.user.email}
>
  {#snippet right()}
    <a href="/admin/users" class="btn btn-secondary" style="text-decoration:none;">{$t('admin.backToUsers')}</a>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:16px;">

  <SectionCard title={$t('admin.userProfile')}>
    <div style="display:flex;flex-wrap:wrap;gap:20px 32px;font-size:13px;">
      <div>
        <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colEmail')}</div>
        <div style="color:var(--mep-fg);">{data.user.email}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colStatus')}</div>
        <div style="color:var(--mep-fg);">{data.user.accessStatus}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colEvents')}</div>
        <div class="num" style="color:var(--mep-fg);">{data.eventCount.toLocaleString('en-US')}{data.truncated ? '+' : ''}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.userId')}</div>
        <code style="font-size:11px;background:var(--mep-surface-2);padding:2px 6px;border-radius:3px;color:var(--mep-fg-2);">{data.user.id}</code>
      </div>
    </div>

    {#if data.sentryConfigured}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
        {#if data.sentryReplaysUrl}
          <a href={data.sentryReplaysUrl} target="_blank" rel="noreferrer" class="btn btn-secondary" style="text-decoration:none;">{$t('admin.watchReplays')}</a>
        {/if}
        {#if data.sentryIssuesUrl}
          <a href={data.sentryIssuesUrl} target="_blank" rel="noreferrer" class="btn btn-secondary" style="text-decoration:none;">{$t('admin.openInSentry')}</a>
        {/if}
      </div>
    {:else}
      <p style="margin-top:16px;font-size:12px;color:var(--mep-fg-3);">{$t('admin.sentryNotConfigured')}</p>
    {/if}
  </SectionCard>

  <SectionCard title={$t('admin.sentryIssues')}>
    {#each data.issues as issue}
      <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--mep-divider);">
        <div style="min-width:0;">
          <a href={issue.permalink} target="_blank" rel="noreferrer" style="color:var(--mep-acc);text-decoration:none;font-size:13px;font-weight:600;">{issue.title}</a>
          <div style="font-size:11px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{issue.culprit ?? issue.shortId}</div>
        </div>
        <div style="text-align:right;white-space:nowrap;">
          <div class="num" style="font-size:12px;color:var(--mep-fg-2);">{$ti('admin.issueEvents', { n: issue.count })}</div>
          <div style="font-size:11px;color:var(--mep-fg-3);">{day(issue.lastSeen)}</div>
        </div>
      </div>
    {:else}
      <p style="font-size:13px;color:var(--mep-fg-4);margin:0;">{$t('admin.noSentryIssues')}</p>
    {/each}
  </SectionCard>

  <SectionCard title={$t('admin.userSessions')}>
    {#each data.sessions as session, i}
      <details open={i === 0} style="border-bottom:1px solid var(--mep-divider);padding:8px 0;">
        <summary style="cursor:pointer;font-size:13px;color:var(--mep-fg);">
          <strong>{day(session.startedAt)}</strong>
          <span style="color:var(--mep-fg-3);font-size:12px;margin-left:8px;">
            {$ti('admin.sessionSummary', { n: session.events.length, min: minutes(session.startedAt, session.endedAt) })}
          </span>
        </summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
          {#each session.events as ev}
            <div style="display:flex;gap:10px;align-items:baseline;font-size:12px;">
              <span class="num" style="color:var(--mep-fg-3);white-space:nowrap;">{clock(ev.created_at)}</span>
              <code style="font-size:11px;background:var(--mep-surface-2);padding:2px 6px;border-radius:3px;color:var(--mep-fg-2);white-space:nowrap;">{ev.notification_type}</code>
              <span style="color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;">{pretty(ev.payload)}</span>
            </div>
          {/each}
        </div>
      </details>
    {:else}
      <p style="font-size:13px;color:var(--mep-fg-4);margin:0;">{$t('admin.noEvents')}</p>
    {/each}
  </SectionCard>

</div>
