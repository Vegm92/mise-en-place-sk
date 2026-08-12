<script lang="ts">
  import { enhance } from '$app/forms';

  type JoinFormResult = { success?: boolean; error?: string; alreadyRegistered?: boolean } | null | undefined;

  let {
    big,
    form,
    copy,
  }: {
    big: boolean;
    form: JoinFormResult;
    copy: {
      placeholder: string;
      submit: string;
      submitShort: string;
      success: string;
      successBody: string;
      alreadyReg: string;
      errRequired: string;
      errInvalid: string;
      errRateLimited: string;
      privacy: string;
    };
  } = $props();

  let emailError = $state('');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string): string {
    if (!value.trim()) return copy.errRequired;
    if (!EMAIL_RE.test(value.trim())) return copy.errInvalid;
    return '';
  }

  function serverError(): string {
    if (!form || form.success) return '';
    const err = form?.error;
    if (err === 'required') return copy.errRequired;
    if (err === 'invalid') return copy.errInvalid;
    if (err === 'rate_limited') return copy.errRateLimited;
    return '';
  }
</script>

{#if form?.success}
  <div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);border-radius:10px;
              padding:{big ? '18px 20px' : '14px 16px'};display:flex;align-items:flex-start;gap:12px;">
    <div style="width:26px;height:26px;border-radius:13px;flex-shrink:0;background:var(--mep-pos);
                color:#fff;display:flex;align-items:center;justify-content:center;">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
    </div>
    <div>
      <div style="font-size:15px;font-weight:600;color:var(--mep-pos);margin-bottom:3px;">{copy.success}</div>
      <div style="font-size:13.5px;color:var(--mep-fg-2);line-height:1.5;">
        {form?.alreadyRegistered ? copy.alreadyReg : copy.successBody}
      </div>
    </div>
  </div>
{:else}
  <form method="POST" action="?/join" use:enhance
    onsubmit={(e) => {
      const input = (e.currentTarget as HTMLFormElement).querySelector('input[name="email"]') as HTMLInputElement;
      const err = validateEmail(input.value);
      if (err) { emailError = err; e.preventDefault(); }
    }}
    style="display:flex;flex-direction:column;gap:8px;">
    <input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true"
      style="position:absolute;left:-9999px;opacity:0;height:0;width:0;" />
    <div style="display:flex;gap:8px;">
      <div style="position:relative;flex:1;">
        <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--mep-fg-3);pointer-events:none;display:flex;">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M3 6l7 5 7-5"/></svg>
        </span>
        <input type="email" name="email" placeholder={copy.placeholder} autocomplete="email"
          style="width:100%;height:{big ? 52 : 44}px;padding:0 14px 0 38px;font-family:inherit;
                 font-size:{big ? 16 : 14.5}px;border-radius:8px;background:var(--mep-surface);
                 color:var(--mep-fg);border:1px solid var(--mep-border-strong);outline:none;box-sizing:border-box;"
          oninput={() => { emailError = ''; }}
        />
      </div>
      <button type="submit" class="btn btn-primary"
        style="height:{big ? 52 : 44}px;padding:0 {big ? 22 : 18}px;font-size:{big ? 16 : 14.5}px;
               font-weight:600;flex-shrink:0;">
        {big ? copy.submit : copy.submitShort}
      </button>
    </div>
    {#if emailError || serverError()}
      <div style="font-size:12.5px;color:var(--mep-neg);padding-left:4px;">{emailError || serverError()}</div>
    {/if}
    <div style="font-size:12px;color:var(--mep-fg-3);padding-left:2px;">{copy.privacy}</div>
  </form>
{/if}
