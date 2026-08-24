<script lang="ts">
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import X from '@lucide/svelte/icons/x';
  import Send from '@lucide/svelte/icons/send';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';

  type ChatAction = { label: string; href: string; variant: 'primary' | 'secondary' };

  let chatOpen  = $state(false);
  let chatInput = $state('');
  let chatLoading = $state(false);
  type Message = { role: 'user' | 'assistant'; text: string; actions?: ChatAction[] };
  let messages = $state<Message[]>([]);
  let sessionId = $state<number | null>(null);
  let messagesEl = $state<HTMLDivElement | null>(null);

  const STARTER_CHIPS = [
    'chat.chip.spend',
    'chat.chip.overdue',
    'chat.chip.budget',
    'chat.chip.price',
  ];

  async function sendMessage(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatLoading) return;
    chatInput = '';
    messages = [...messages, { role: 'user', text: msg }];
    chatLoading = true;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId }),
      });
      const data = await res.json();
      if (res.status === 402) {
        const text = data.error === 'plan_upgrade_required'
          ? $t('chat.err.upgradeRequired')
          : $t('chat.err.trialExpired');
        messages = [...messages, { role: 'assistant', text }];
        return;
      }
      if (data.sessionId) sessionId = data.sessionId;
      messages = [...messages, {
        role: 'assistant',
        text: data.reply ?? $t('chat.error'),
        actions: data.actions,
      }];
    } catch {
      messages = [...messages, { role: 'assistant', text: $t('chat.error') }];
    } finally {
      chatLoading = false;
      setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
    }
  }

  function handleAction(action: ChatAction) {
    chatOpen = false;
    goto(action.href);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }
</script>

<div style="position:relative;">

  <button
    onclick={() => chatOpen = !chatOpen}
    class="btn btn-ghost"
    style="width:34px;height:34px;padding:0;justify-content:center;{chatOpen ? 'background:var(--mep-acc-soft);color:var(--mep-acc);' : ''}"
    aria-label={$t('chat.title')}
    title={$t('chat.title')}
  >
    {#if chatOpen}<X size={16} />{:else}<MessageCircle size={16} />{/if}
  </button>

  {#if chatOpen}
    <div class="card flex flex-col overflow-hidden shadow-pop"
      style="position:absolute;top:calc(100% + 8px);right:0;width:360px;max-height:520px;z-index:200;">

      <div class="card-header bg-surface-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-acc flex items-center justify-center flex-shrink-0">
            <MessageCircle size={12} class="text-acc-fg" />
          </div>
          <span class="body-strong">{$t('chat.title')}</span>
        </div>
        <div class="flex items-center gap-1">
          <a
            href="/chat"
            class="btn btn-ghost"
            style="width:28px;height:28px;padding:0;justify-content:center;"
            title={$t('chat.openFull')}
            onclick={() => chatOpen = false}
          >
            <ExternalLink size={13} />
          </a>
          <button onclick={() => chatOpen = false} class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;">
            <X size={14} />
          </button>
        </div>
      </div>

      <div bind:this={messagesEl} class="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 min-h-[180px]">
        {#if messages.length === 0}
          <p class="body text-center text-sm" style="color:var(--mep-fg-3);margin-bottom:8px;">{$t('chat.empty')}</p>
          <div class="flex flex-wrap gap-1.5 justify-center">
            {#each STARTER_CHIPS as key}
              <button
                onclick={() => sendMessage($t(key))}
                class="btn btn-secondary"
                style="font-size:11px;height:28px;padding:0 10px;border-radius:99px;"
              >{$t(key)}</button>
            {/each}
          </div>
        {/if}
        {#each messages as msg (msg)}
          <div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'} gap-1">
            <div class="
              max-w-[82%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap
              {msg.role === 'user'
                ? 'bg-acc text-acc-fg rounded-br-sm'
                : 'bg-surface-2 text-fg rounded-bl-sm'}
            ">{msg.text}</div>
            {#if msg.actions && msg.actions.length > 0}
              <div class="flex gap-1.5 flex-wrap max-w-[82%]">
                {#each msg.actions as action}
                  <button
                    onclick={() => handleAction(action)}
                    class="btn {action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}"
                    style="font-size:11px;height:26px;padding:0 10px;border-radius:6px;"
                  >{action.label}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if chatLoading}
          <div class="flex justify-start">
            <div class="bg-surface-2 rounded-xl rounded-bl-sm px-3 py-2.5 flex gap-1 items-center">
              <span class="w-1.5 h-1.5 bg-fg-3 rounded-full animate-bounce"></span>
              <span class="w-1.5 h-1.5 bg-fg-3 rounded-full animate-bounce [animation-delay:150ms]"></span>
              <span class="w-1.5 h-1.5 bg-fg-3 rounded-full animate-bounce [animation-delay:300ms]"></span>
            </div>
          </div>
        {/if}
      </div>

      <p class="text-fg-4 text-center px-3 pt-1.5 pb-0 leading-tight" style="font-size:11px;">{$t('chat.privacy')}</p>

      <div class="flex items-center gap-2 p-3 border-t border-divider">
        <input
          type="text"
          bind:value={chatInput}
          onkeydown={onKeydown}
          placeholder={$t('chat.placeholder')}
          disabled={chatLoading}
          class="input flex-1"
          style="height:34px;"
        />
        <button
          onclick={() => sendMessage()}
          disabled={!chatInput.trim() || chatLoading}
          aria-label={$t('chat.send')}
          class="btn btn-primary flex-shrink-0"
          style="width:34px;height:34px;padding:0;justify-content:center;"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  {/if}

</div>
