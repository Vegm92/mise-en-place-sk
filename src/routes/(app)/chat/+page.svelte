<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Send from '@lucide/svelte/icons/send';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import History from '@lucide/svelte/icons/history';
  import Lock from '@lucide/svelte/icons/lock';
  import { t } from '$lib/i18n';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';

  const { data } = $props();

  const locked = $derived(!!data.locked);

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
    if (!msg || chatLoading || locked) return;
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
        const text = d.error === 'plan_upgrade_required'
          ? t('chat.err.upgradeRequired')
          : t('chat.err.trialExpired');
        messages = [...messages, { role: 'assistant', text }];
        return;
      }
      if (!res.ok) {
        messages = [...messages, { role: 'assistant', text: t('chat.error') }];
        return;
      }
      if (d.sessionId && d.sessionId !== activeSessionId) {
        activeSessionId = d.sessionId;
        const url = new URL(page.url);
        url.searchParams.set('session', String(d.sessionId));
        goto(url.toString(), { replaceState: true, noScroll: true });
      }
      messages = [...messages, { role: 'assistant', text: d.reply ?? t('chat.error'), actions: d.actions }];
      invalidateAll();
    } catch {
      messages = [...messages, { role: 'assistant', text: t('chat.error') }];
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

  {#if mobileSidebarOpen}
    <div
      role="presentation"
      onclick={() => (mobileSidebarOpen = false)}
      onkeydown={() => (mobileSidebarOpen = false)}
      style="position:fixed;inset:0;top:56px;background:rgba(0,0,0,0.4);z-index:40;"
    ></div>
  {/if}

  <aside
    class="
      fixed top-[56px] bottom-0 left-0 z-50
      transition-transform duration-300 w-[260px] border-r border-divider flex flex-col bg-surface-2 overflow-hidden
      {mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    "
  >
    <div class="px-3 pt-4 pb-2 border-b border-divider">
      <button
        onclick={newChat}
        class="btn btn-primary"
        style="width:100%;height:36px;gap:6px;justify-content:center;"
      >
        <Plus size={14} />
        {t('chat.newChat')}
      </button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:8px 6px;">
      {#if data.sessions.length === 0}
        <p class="text-[12px] text-fg-3 text-center px-2 py-6">{t('chat.noHistory')}</p>
      {/if}
      {#each data.sessions as session}
        {@const isActive = session.id === activeSessionId}
        <div class="flex items-center gap-1.5 rounded-lg mb-0.5" class:bg-hover={isActive}>
          <a
            href="/chat?session={session.id}"
            onclick={() => (mobileSidebarOpen = false)}
            style="flex:1;min-width:0;padding:8px 10px;text-decoration:none;border-radius:8px;display:block;"
          >
            <p class="text-[12px] whitespace-nowrap overflow-hidden text-ellipsis m-0 mb-0.5"
              class:font-semibold={isActive}
              class:text-fg={isActive}
              class:text-fg-2={!isActive}
            >{session.title}</p>
            <p class="text-[11px] text-fg-3 m-0">{formatDate(session.updatedAt)}</p>
          </a>
          <form id="delete-session-{session.id}" method="POST" action="?/deleteSession" style="flex-shrink:0;margin-right:4px;">
            <input type="hidden" name="id" value={session.id} />
            <button
              type="button"
              class="btn btn-ghost"
              style="width:24px;height:24px;padding:0;justify-content:center;opacity:0.5;"
              title={t('action.irreversible')}
              onclick={() => { deleteSessionId = session.id; deleteSessionOpen = true; }}
            >
              <Trash2 size={11} />
            </button>
          </form>
        </div>
      {/each}
    </div>
  </aside>

  <div class="flex-1 min-w-0 flex flex-col bg-bg">

    <div class="h-11 flex items-center justify-between px-3 border-b border-divider bg-bg shrink-0">
      <button
        onclick={() => (mobileSidebarOpen = !mobileSidebarOpen)}
        class="btn btn-ghost"
        style="padding:0 10px;gap:6px;font-size:13px;font-weight:500;"
        aria-label={t('chat.historyAria')}
      >
        <History size={15} />
        {t('chat.history')}
      </button>
      <button
        onclick={newChat}
        class="btn btn-ghost"
        style="width:36px;height:36px;padding:0;justify-content:center;flex-shrink:0;"
        aria-label={t('chat.newChat')}
        title={t('chat.newChat')}
      >
        <Plus size={18} />
      </button>
    </div>

    <div
      bind:this={messagesEl}
      style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;max-width:800px;width:100%;margin:0 auto;"
    >
      {#if messages.length === 0}
        <div style="margin:auto;text-align:center;max-width:420px;">
          <div class="w-12 h-12 rounded-full bg-acc-soft flex items-center justify-center mx-auto mb-4">
            {#if locked}
              <Lock size={20} class="text-acc" />
            {:else}
              <MessageCircle size={22} class="text-acc" />
            {/if}
          </div>
          <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">{t('chat.title')}</h2>
          {#if locked}
            <p class="text-[13px] text-fg-3 m-0 mb-5">{t('chat.err.upgradeRequired')}</p>
            <a href="/billing?upgrade=assistant" class="btn btn-primary" style="text-decoration:none;">
              {t('sidebar.upgradeCta')}
            </a>
          {:else}
            <p class="text-[13px] text-fg-3 m-0 mb-5">{t('chat.empty')}</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
              {#each STARTER_CHIPS as key}
                <button
                  onclick={() => sendMessage(t(key))}
                  class="btn btn-secondary"
                  style="font-size:12px;padding:0 14px;border-radius:99px;"
                >{t(key)}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#each messages as msg, i (i)}
        <div style="display:flex;flex-direction:column;align-items:{msg.role === 'user' ? 'flex-end' : 'flex-start'};gap:6px;">
          {#if msg.role === 'assistant'}
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
              <div class="w-6 h-6 rounded-full bg-acc-soft flex items-center justify-center shrink-0">
                <MessageCircle size={12} class="text-acc" />
              </div>
              <span class="text-[11px] font-semibold text-fg-2">{t('chat.assistant')}</span>
            </div>
          {/if}
          <div class="max-w-[680px] px-4 py-3 rounded-2xl text-[13px] leading-[1.6] whitespace-pre-wrap"
            class:bg-acc={msg.role === 'user'}
            class:text-acc-fg={msg.role === 'user'}
            class:bg-surface-2={msg.role !== 'user'}
            class:text-fg={msg.role !== 'user'}
            style="{msg.role === 'user' ? 'border-bottom-right-radius:4px;' : 'border-bottom-left-radius:4px;'}"
          >{msg.text}</div>
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
          <div class="w-6 h-6 rounded-full bg-acc-soft flex items-center justify-center shrink-0">
            <MessageCircle size={12} class="text-acc" />
          </div>
          <div class="bg-surface-2 rounded-2xl rounded-bl-[4px] px-4 py-3 flex gap-1 items-center">
            <span class="w-1.5 h-1.5 bg-fg-3 rounded-full" style="animation:bounce 1s infinite;"></span>
            <span class="w-1.5 h-1.5 bg-fg-3 rounded-full" style="animation:bounce 1s infinite;animation-delay:150ms;"></span>
            <span class="w-1.5 h-1.5 bg-fg-3 rounded-full" style="animation:bounce 1s infinite;animation-delay:300ms;"></span>
          </div>
        </div>
      {/if}
    </div>

    <div class="border-t border-divider bg-bg px-6 pt-3 pb-4" data-coach="chat-main">
      <div style="max-width:800px;margin:0 auto;">
        {#if locked}
          <div class="flex items-center gap-2.5 flex-wrap justify-center bg-acc-soft border border-acc text-acc rounded-input px-[14px] py-2 text-[13px] mb-2.5">
            <Lock size={13} style="flex-shrink:0;" />
            <span>{t('chat.err.upgradeRequired')}</span>
            <a href="/billing?upgrade=assistant" class="btn btn-primary" style="height:28px;font-size:13px;padding:0 10px;text-decoration:none;">
              {t('sidebar.upgradeCta')}
            </a>
          </div>
        {:else}
          <p class="text-[11px] text-fg-4 text-center m-0 mb-2">{t('chat.privacy')}</p>
        {/if}
        <div style="display:flex;gap:10px;align-items:center;">
          <input
            type="text"
            bind:value={chatInput}
            onkeydown={onKeydown}
            placeholder={t('chat.placeholder')}
            disabled={chatLoading || locked}
            aria-disabled={locked}
            class="input flex-1"
            style="height:42px;"
          />
          <button
            onclick={() => sendMessage()}
            disabled={!chatInput.trim() || chatLoading || locked}
            aria-label={t('chat.send')}
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
  message={t('chat.confirmDelete')}
  danger={true}
  onconfirm={() => {
    if (deleteSessionId != null) {
      (document.getElementById(`delete-session-${deleteSessionId}`) as HTMLFormElement).submit();
      deleteSessionId = null;
    }
  }}
  oncancel={() => { deleteSessionId = null; }}
/>
