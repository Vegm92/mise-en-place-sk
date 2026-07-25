<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Send from '@lucide/svelte/icons/send';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import History from '@lucide/svelte/icons/history';
  import { t } from '$lib/i18n';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';

  const { data } = $props();

  type ChatAction = { label: string; href: string; variant: 'primary' | 'secondary' };
  type Msg = { role: string; text: string; actions?: ChatAction[] };

  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let messages = $state<Msg[]>(data.messages as Msg[]);
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let activeSessionId = $state<number | null>(data.activeSessionId);
  let chatInput = $state('');
  let chatLoading = $state(false);
  let messagesEl = $state<HTMLDivElement | null>(null);
  let mobileSidebarOpen = $state(false);
  let deleteSessionOpen = $state(false);
  let deleteSessionId = $state<number | null>(null);

  const STARTER_CHIPS = [
    'chat.chip.spend',
    'chat.chip.overdue',
    'chat.chip.budget',
    'chat.chip.price',
  ];

  $effect(() => {
    messages = data.messages as Msg[];
    activeSessionId = data.activeSessionId;
  });

  function scrollToBottom() {
    setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
  }

  $effect(() => {
    if (messages.length) scrollToBottom();
  });

  async function sendMessage(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatLoading) return;
    chatInput = '';
    messages = [...messages, { role: 'user', text: msg }];
    chatLoading = true;
    scrollToBottom();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId: activeSessionId }),
      });
      const d = await res.json();
      if (res.status === 402) {
        // Trial lapsed — paid capacity is off, but the data is still there.
        messages = [...messages, { role: 'assistant', text: $t('chat.err.trialExpired') }];
        return;
      }
      if (!res.ok) {
        // Nothing new was persisted on the assistant side — invalidateAll()
        // would rerun `load`, and the $effect below resyncs `messages` from
        // that (unchanged) server data, silently wiping this error bubble
        // before the user ever sees it (issue #306). Show it and stop.
        messages = [...messages, { role: 'assistant', text: $t('chat.error') }];
        return;
      }
      if (d.sessionId && d.sessionId !== activeSessionId) {
        activeSessionId = d.sessionId;
        const url = new URL($page.url);
        url.searchParams.set('session', String(d.sessionId));
        goto(url.toString(), { replaceState: true, noScroll: true });
      }
      messages = [...messages, { role: 'assistant', text: d.reply ?? $t('chat.error'), actions: d.actions }];
      invalidateAll();
    } catch {
      messages = [...messages, { role: 'assistant', text: $t('chat.error') }];
    } finally {
      chatLoading = false;
      scrollToBottom();
    }
  }

  function handleAction(action: ChatAction) {
    goto(action.href);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function newChat() {
    goto('/chat', { invalidateAll: true });
    messages = [];
    activeSessionId = null;
    chatInput = '';
    mobileSidebarOpen = false;
  }

  function formatDate(iso: Date | string | null | undefined) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<div style="display:flex;height:calc(100vh - 56px);height:calc(100dvh - 56px);overflow:hidden;position:relative;">

  <!-- Backdrop (tap outside to close sidebar) -->
  {#if mobileSidebarOpen}
    <div
      role="presentation"
      onclick={() => (mobileSidebarOpen = false)}
      onkeydown={() => (mobileSidebarOpen = false)}
      style="position:fixed;inset:0;top:56px;background:rgba(0,0,0,0.4);z-index:40;"
    ></div>
  {/if}

  <!-- Sidebar: always a fixed slide-over from the left, toggled by Historial button -->
  <aside
    class="
      fixed top-[56px] bottom-0 left-0 z-50
      transition-transform duration-300
      {mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    "
    style="width:260px;border-right:1px solid var(--mep-divider);display:flex;flex-direction:column;background:var(--mep-surface-2);overflow:hidden;"
  >
    <div style="padding:16px 12px 8px;border-bottom:1px solid var(--mep-divider);">
      <button
        onclick={newChat}
        class="btn btn-primary"
        style="width:100%;height:36px;gap:6px;justify-content:center;"
      >
        <Plus size={14} />
        {$t('chat.newChat')}
      </button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:8px 6px;">
      {#if data.sessions.length === 0}
        <p style="font-size:12px;color:var(--mep-fg-3);text-align:center;padding:24px 8px;">{$t('chat.noHistory')}</p>
      {/if}
      {#each data.sessions as session}
        {@const isActive = session.id === activeSessionId}
        <div
          style="
            display:flex;align-items:center;gap:6px;border-radius:8px;margin-bottom:2px;
            background:{isActive ? 'var(--mep-hover)' : 'transparent'};
          "
        >
          <a
            href="/chat?session={session.id}"
            onclick={() => (mobileSidebarOpen = false)}
            style="
              flex:1;min-width:0;padding:8px 10px;text-decoration:none;border-radius:8px;
              display:block;
            "
          >
            <p style="
              font-size:12px;font-weight:{isActive ? 600 : 400};
              color:{isActive ? 'var(--mep-fg)' : 'var(--mep-fg-2)'};
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 2px;
            ">{session.title}</p>
            <p style="font-size:10px;color:var(--mep-fg-3);margin:0;">{formatDate(session.updatedAt)}</p>
          </a>
          <form id="delete-session-{session.id}" method="POST" action="?/deleteSession" style="flex-shrink:0;margin-right:4px;">
            <input type="hidden" name="id" value={session.id} />
            <button
              type="button"
              class="btn btn-ghost"
              style="width:24px;height:24px;padding:0;justify-content:center;opacity:0.5;"
              title={$t('action.irreversible')}
              onclick={() => { deleteSessionId = session.id; deleteSessionOpen = true; }}
            >
              <Trash2 size={11} />
            </button>
          </form>
        </div>
      {/each}
    </div>
  </aside>

  <!-- Main chat area -->
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--mep-bg);">

    <!-- Top bar: historial button + new chat button (all screen sizes) -->
    <div
      style="height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--mep-divider);background:var(--mep-bg);flex-shrink:0;"
    >
      <button
        onclick={() => (mobileSidebarOpen = !mobileSidebarOpen)}
        class="btn btn-ghost"
        style="height:32px;padding:0 10px;gap:6px;font-size:13px;font-weight:500;"
        aria-label={$t('chat.historyAria')}
      >
        <History size={15} />
        {$t('chat.history')}
      </button>
      <button
        onclick={newChat}
        class="btn btn-ghost"
        style="width:36px;height:36px;padding:0;justify-content:center;flex-shrink:0;"
        aria-label={$t('chat.newChat')}
        title={$t('chat.newChat')}
      >
        <Plus size={18} />
      </button>
    </div>

    <!-- Messages -->
    <div
      bind:this={messagesEl}
      style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;max-width:800px;width:100%;margin:0 auto;"
    >
      {#if messages.length === 0}
        <div style="margin:auto;text-align:center;max-width:420px;">
          <div style="
            width:48px;height:48px;border-radius:50%;background:var(--mep-acc-soft);
            display:flex;align-items:center;justify-content:center;margin:0 auto 16px;
          ">
            <MessageCircle size={22} style="color:var(--mep-acc);" />
          </div>
          <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">{$t('chat.title')}</h2>
          <p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">{$t('chat.empty')}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
            {#each STARTER_CHIPS as key}
              <button
                onclick={() => sendMessage($t(key))}
                class="btn btn-secondary"
                style="font-size:12px;height:32px;padding:0 14px;border-radius:99px;"
              >{$t(key)}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#each messages as msg, i (i)}
        <div style="display:flex;flex-direction:column;align-items:{msg.role === 'user' ? 'flex-end' : 'flex-start'};gap:6px;">
          {#if msg.role === 'assistant'}
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
              <div style="
                width:24px;height:24px;border-radius:50%;background:var(--mep-acc-soft);
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
              ">
                <MessageCircle size={12} style="color:var(--mep-acc);" />
              </div>
              <span style="font-size:11px;font-weight:600;color:var(--mep-fg-2);">{$t('chat.assistant')}</span>
            </div>
          {/if}
          <div style="
            max-width:680px;padding:12px 16px;border-radius:16px;
            font-size:13px;line-height:1.6;white-space:pre-wrap;
            {msg.role === 'user'
              ? 'background:var(--mep-acc);color:var(--mep-acc-fg);border-bottom-right-radius:4px;'
              : 'background:var(--mep-surface-2);color:var(--mep-fg);border-bottom-left-radius:4px;'}
          ">{msg.text}</div>
          {#if msg.actions && msg.actions.length > 0}
            <div style="display:flex;gap:8px;flex-wrap:wrap;max-width:680px;">
              {#each msg.actions as action}
                <button
                  onclick={() => handleAction(action)}
                  class="btn {action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}"
                  style="font-size:12px;height:30px;padding:0 14px;border-radius:8px;"
                >{action.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      {#if chatLoading}
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="
            width:24px;height:24px;border-radius:50%;background:var(--mep-acc-soft);
            display:flex;align-items:center;justify-content:center;flex-shrink:0;
          ">
            <MessageCircle size={12} style="color:var(--mep-acc);" />
          </div>
          <div style="background:var(--mep-surface-2);border-radius:16px;border-bottom-left-radius:4px;padding:12px 16px;display:flex;gap:4px;align-items:center;">
            <span style="width:6px;height:6px;background:var(--mep-fg-3);border-radius:50%;animation:bounce 1s infinite;"></span>
            <span style="width:6px;height:6px;background:var(--mep-fg-3);border-radius:50%;animation:bounce 1s infinite;animation-delay:150ms;"></span>
            <span style="width:6px;height:6px;background:var(--mep-fg-3);border-radius:50%;animation:bounce 1s infinite;animation-delay:300ms;"></span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Privacy note + Input -->
    <div style="border-top:1px solid var(--mep-divider);background:var(--mep-bg);padding:12px 24px 16px;">
      <div style="max-width:800px;margin:0 auto;">
        <p style="font-size:10px;color:var(--mep-fg-4);text-align:center;margin:0 0 8px;">{$t('chat.privacy')}</p>
        <div style="display:flex;gap:10px;align-items:center;">
          <input
            type="text"
            bind:value={chatInput}
            onkeydown={onKeydown}
            placeholder={$t('chat.placeholder')}
            disabled={chatLoading}
            class="input flex-1"
            style="height:42px;font-size:13px;"
          />
          <button
            onclick={() => sendMessage()}
            disabled={!chatInput.trim() || chatLoading}
            aria-label={$t('chat.send')}
            class="btn btn-primary flex-shrink-0"
            style="width:42px;height:42px;padding:0;justify-content:center;"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>

  </div>
</div>

<ConfirmDialog
  bind:open={deleteSessionOpen}
  message={$t('chat.confirmDelete')}
  danger={true}
  onconfirm={() => {
    if (deleteSessionId != null) {
      (document.getElementById(`delete-session-${deleteSessionId}`) as HTMLFormElement).submit();
      deleteSessionId = null;
    }
  }}
  oncancel={() => { deleteSessionId = null; }}
/>
