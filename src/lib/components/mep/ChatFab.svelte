<script lang="ts">
  import { MessageCircle, X, Send } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  let chatOpen  = $state(false);
  let chatInput = $state('');
  let chatLoading = $state(false);
  type Message = { role: 'user' | 'assistant'; text: string };
  let messages = $state<Message[]>([]);

  async function sendMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    chatInput = '';
    messages = [...messages, { role: 'user', text }];
    chatLoading = true;
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      messages = [...messages, { role: 'assistant', text: json.reply ?? $t('chat.error') }];
    } catch {
      messages = [...messages, { role: 'assistant', text: $t('chat.error') }];
    } finally {
      chatLoading = false;
    }
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
      style="position:absolute;top:calc(100% + 8px);right:0;width:340px;max-height:480px;z-index:200;">

      <div class="card-header bg-surface-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-acc flex items-center justify-center flex-shrink-0">
            <MessageCircle size={12} class="text-acc-fg" />
          </div>
          <span class="body-strong">{$t('chat.title')}</span>
        </div>
        <button onclick={() => chatOpen = false} class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;">
          <X size={14} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 min-h-[180px]">
        {#if messages.length === 0}
          <p class="body text-center m-auto text-sm">{$t('chat.empty')}</p>
        {/if}
        {#each messages as msg (msg)}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div class="
              max-w-[82%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap
              {msg.role === 'user'
                ? 'bg-acc text-acc-fg rounded-br-sm'
                : 'bg-surface-2 text-fg rounded-bl-sm'}
            ">{msg.text}</div>
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

      <p class="text-fg-4 text-center px-3 pt-1.5 pb-0 leading-tight" style="font-size:10px;">{$t('chat.privacy')}</p>

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
          onclick={sendMessage}
          disabled={!chatInput.trim() || chatLoading}
          class="btn btn-primary flex-shrink-0"
          style="width:34px;height:34px;padding:0;justify-content:center;"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  {/if}

</div>
