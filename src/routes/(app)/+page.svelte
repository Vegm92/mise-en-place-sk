<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { fmtSize } from '$lib/formatters';
  import { Upload, Mail, Sparkle, X, Check } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  const { data, form }: { data: PageData; form: ActionData } = $props();

  const errorMsg = $derived(form?.error ?? (data.error ? decodeURIComponent(data.error) : null));

  let files = $state<File[]>([]);
  let isDragging = $state(false);
  let uploading = $state(false);
  let fileInputEl = $state<HTMLInputElement>();
  const MAX_MB = 20;

  const STEPS = $derived([$t('steps.upload'), $t('steps.extract'), $t('steps.review')]);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    for (const f of Array.from(newFiles)) {
      if (f.size > MAX_MB * 1024 * 1024) { alert(`'${f.name}' supera el límite de ${MAX_MB} MB`); continue; }
      if (!files.some(e => e.name === f.name && e.size === f.size)) files = [...files, f];
    }
  }

  function removeFile(idx: number) { files = files.filter((_, i) => i !== idx); }
  function fileKind(name: string) { return name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'img'; }

  async function doUpload() {
    if (!files.length || uploading) return;
    uploading = true;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      const resp = await fetch('/?/upload', { method: 'POST', body: fd, redirect: 'follow' });
      const result = await resp.json() as { type: string; location?: string; data?: { error?: string } };
      if (result.type === 'redirect' && result.location) {
        location.replace(result.location);
      } else {
        uploading = false;
        if (result.data?.error) alert(result.data.error);
      }
    } catch (err) {
      uploading = false;
      alert('Error al subir: ' + (err as Error).message);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    addFiles(e.dataTransfer?.files ?? null);
  }

  function copyEmail() {
    navigator.clipboard?.writeText('casa-lua-4f8a@inbox.miseenplace.es').catch(() => {});
  }
</script>

<!-- ── Mobile upload ──────────────────────────────────────────────────── -->
<div class="md:hidden flex flex-col" style="height:100%;overflow:hidden;">
  <!-- Compact step indicator -->
  <div style="padding:0 18px 10px;flex-shrink:0;display:flex;align-items:center;gap:6px;">
    {#each STEPS as step, i}
      <div style="display:flex;align-items:center;gap:5px;">
        <span class="num" style="
          width:18px;height:18px;border-radius:9px;
          background:{i===0?'var(--mep-acc)':'var(--mep-surface-2)'};
          color:{i===0?'var(--mep-acc-fg)':'var(--mep-fg-3)'};
          font-size:10px;font-weight:600;
          display:inline-flex;align-items:center;justify-content:center;
          border:{i===0?'none':'1px solid var(--mep-divider)'};
          flex-shrink:0;
        ">{i+1}</span>
        <span style="font-size:12px;font-weight:{i===0?600:400};color:{i===0?'var(--mep-fg)':'var(--mep-fg-3)'};">{step}</span>
      </div>
      {#if i < STEPS.length - 1}
        <div style="width:14px;height:1px;background:var(--mep-divider);flex-shrink:0;"></div>
      {/if}
    {/each}
  </div>

  <!-- Alerts -->
  {#if data.saved || data.duplicate || errorMsg}
    <div style="padding:0 18px 8px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
      {#if data.saved}
        <div class="card p-3 bg-pos-soft border-pos text-pos" style="font-size:13px;">{$t('upload.saved')}</div>
      {/if}
      {#if data.duplicate}
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;">{$t('upload.duplicate')}</div>
      {/if}
      {#if errorMsg}
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;">{errorMsg}</div>
      {/if}
    </div>
  {/if}

  <!-- Scrollable body -->
  <div style="flex:1;overflow-y:auto;padding:0 18px 0;display:flex;flex-direction:column;gap:12px;padding-bottom:12px;">

    <!-- Upload zone -->
    <div class="card" style="padding:16px;">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        style="
          border:1.5px dashed {isDragging?'var(--mep-acc)':'var(--mep-border-strong)'};
          border-radius:10px;
          display:flex;flex-direction:column;align-items:center;
          padding:24px 16px;
          background:{isDragging?'var(--mep-acc-soft)':'var(--mep-surface-2)'};
          cursor:pointer;
          transition:border-color 150ms,background 150ms;
        "
        role="button"
        tabindex="0"
        onclick={() => fileInputEl?.click()}
        onkeydown={(e) => e.key==='Enter' && fileInputEl?.click()}
        ondragover={(e) => { e.preventDefault(); isDragging=true; }}
        ondragleave={() => isDragging=false}
        ondrop={onDrop}
      >
        <div style="width:48px;height:48px;border-radius:24px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;margin-bottom:12px;flex-shrink:0;">
          <Upload size={22} />
        </div>
        <div style="font-size:16px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;margin-bottom:4px;text-align:center;">
          {data.hasCompletedOnboarding ? $t('upload.dropHeadline') : 'Procesa tu primera factura'}
        </div>
        <div style="font-size:12.5px;color:var(--mep-fg-2);margin-bottom:14px;text-align:center;">
          {#if data.hasCompletedOnboarding}
            <span style="color:var(--mep-acc);font-weight:500;">{$t('upload.dropBrowse')}</span> · {$t('upload.dropSub')}
          {:else}
            PDF, foto o escaneo — la IA extrae los datos.
          {/if}
        </div>
        <button
          type="button"
          class="btn btn-primary"
          style="height:36px;padding:0 18px;pointer-events:auto;"
          onclick={(e) => { e.stopPropagation(); fileInputEl?.click(); }}
        >
          {$t('upload.browseFiles')}
        </button>

        <!-- Email forwarding -->
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--mep-divider);width:100%;display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:16px;flex-shrink:0;background:var(--mep-surface);border:1px solid var(--mep-divider);color:var(--mep-fg-2);display:flex;align-items:center;justify-content:center;">
            <Mail size={14} />
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:500;color:var(--mep-fg);">{$t('upload.emailForward')}</div>
            <div class="num" style="font-size:10.5px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              casa-lua-4f8a@inbox.miseenplace.es
            </div>
          </div>
          <button type="button" class="btn btn-ghost" style="height:28px;font-size:11px;padding:0 8px;flex-shrink:0;" onclick={(e) => { e.stopPropagation(); copyEmail(); }}>
            {$t('upload.copy')}
          </button>
        </div>
      </div>
    </div>

    <!-- File queue -->
    <div class="card" style="padding:14px 14px 10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span class="subtitle">{$t('upload.queue')}</span>
        {#if files.length > 0}
          <span class="num" style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{files.length}</span>
        {/if}
      </div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:10px;">
        {files.length===0 ? $t('upload.queueEmpty') : $t('upload.queueNotStarted')}
      </div>

      {#if files.length > 0}
        <div style="display:flex;flex-direction:column;gap:6px;">
          {#each files as f, i}
            {@const kind = fileKind(f.name)}
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--mep-divider);background:var(--mep-surface);">
              <div style="width:28px;height:36px;border-radius:4px;flex-shrink:0;background:{kind==='pdf'?'#c14a4a':'#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;letter-spacing:0.04em;">
                {kind==='pdf'?'PDF':'IMG'}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.name}</div>
                <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{fmtSize(f.size)}</div>
              </div>
              <button type="button" class="btn btn-ghost" style="width:24px;height:24px;padding:0;justify-content:center;" onclick={() => removeFile(i)}>
                <X size={13} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div style="display:flex;align-items:center;justify-content:center;padding:16px 0;">
          <span class="body" style="font-size:12px;color:var(--mep-fg-4);">{$t('upload.noFiles')}</span>
        </div>
      {/if}
    </div>

  </div>

  <!-- Sticky extract button -->
  <div style="padding:12px 18px 24px;border-top:1px solid var(--mep-divider);background:var(--mep-bg);flex-shrink:0;">
    <button
      type="button"
      class="btn btn-primary"
      style="width:100%;height:44px;justify-content:center;font-weight:500;gap:6px;font-size:14px;"
      disabled={files.length===0||uploading}
      onclick={doUpload}
    >
      {#if uploading}
        <svg width="14" height="14" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;flex-shrink:0;">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
          <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        {$t('upload.uploading')}
      {:else}
        <Sparkle size={14} />
        {files.length===0 ? $t('upload.extractData') : files.length===1 ? $t('upload.extractData1') : $t('upload.extractDataN').replace('{n}', String(files.length))}
      {/if}
    </button>
  </div>
</div>

<!-- ── Desktop upload ─────────────────────────────────────────────────── -->
<div class="max-md:hidden flex flex-col" style="height:100%;overflow:hidden;">

  <!-- 3-step indicator -->
  <div style="padding:20px 32px 0;flex-shrink:0;display:flex;align-items:center;gap:12px;">
    {#each STEPS as step, i}
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="num" style="
          width:22px;height:22px;border-radius:11px;
          background:{i === 0 ? 'var(--mep-acc)' : 'var(--mep-surface-2)'};
          color:{i === 0 ? 'var(--mep-acc-fg)' : 'var(--mep-fg-3)'};
          font-size:11px;font-weight:600;
          display:inline-flex;align-items:center;justify-content:center;
          border:{i === 0 ? 'none' : '1px solid var(--mep-divider)'};
          flex-shrink:0;
        ">{i + 1}</span>
        <span style="font-size:13px;font-weight:{i === 0 ? 600 : 400};color:{i === 0 ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};">{step}</span>
      </div>
      {#if i < STEPS.length - 1}
        <div style="width:28px;height:1px;background:var(--mep-divider);"></div>
      {/if}
    {/each}
  </div>

  <!-- Alerts -->
  {#if data.saved || data.duplicate || errorMsg}
    <div style="padding:12px 32px 0;flex-shrink:0;display:flex;flex-direction:column;gap:8px;">
      {#if data.saved}
        <div class="card p-3 bg-pos-soft border-pos text-pos" style="font-size:13px;">{$t('upload.saved')}</div>
      {/if}
      {#if data.duplicate}
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;">{$t('upload.duplicate')}</div>
      {/if}
      {#if errorMsg}
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;">{errorMsg}</div>
      {/if}
    </div>
  {/if}

  <!-- Two-column grid -->
  <div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-columns:1.6fr 1fr;gap:16px;">

    <!-- Left: Drop zone -->
    <div class="card" style="padding:20px;display:flex;flex-direction:column;">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        style="
          flex:1;border:1.5px dashed {isDragging ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};
          border-radius:10px;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:32px 24px;
          background:{isDragging ? 'var(--mep-acc-soft)' : 'var(--mep-surface-2)'};
          cursor:pointer;
          transition:border-color 150ms,background 150ms;
          position:relative;
        "
        role="button"
        tabindex="0"
        onclick={() => fileInputEl?.click()}
        onkeydown={(e) => e.key === 'Enter' && fileInputEl?.click()}
        ondragover={(e) => { e.preventDefault(); isDragging = true; }}
        ondragleave={() => isDragging = false}
        ondrop={onDrop}
      >
        <!-- Upload icon circle -->
        <div style="width:56px;height:56px;border-radius:28px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;margin-bottom:16px;flex-shrink:0;">
          <Upload size={24} />
        </div>

        <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;margin-bottom:6px;text-align:center;">
          {data.hasCompletedOnboarding ? $t('upload.dropHeadline') : 'Procesa tu primera factura'}
        </div>
        <div style="font-size:13px;color:var(--mep-fg-2);margin-bottom:16px;text-align:center;max-width:360px;">
          {#if data.hasCompletedOnboarding}
            O <span style="color:var(--mep-acc);font-weight:500;">{$t('upload.dropBrowse')}</span> · {$t('upload.dropSub')}
          {:else}
            Sube cualquier factura de proveedor — PDF, foto o escaneo. La IA extraerá todos los datos automáticamente.
          {/if}
        </div>

        <input
          bind:this={fileInputEl}
          type="file"
          class="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          multiple
          onchange={() => { addFiles(fileInputEl?.files ?? null); if (fileInputEl) fileInputEl.value = ''; }}
        />

        <button
          type="button"
          class="btn btn-primary"
          style="height:36px;padding:0 14px;pointer-events:auto;"
          onclick={(e) => { e.stopPropagation(); fileInputEl?.click(); }}
        >
          {$t('upload.browseFiles')}
        </button>

        <!-- Email forwarding -->
        <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--mep-divider);width:100%;max-width:440px;display:flex;align-items:center;gap:12px;">
          <div style="width:36px;height:36px;border-radius:18px;flex-shrink:0;background:var(--mep-surface);border:1px solid var(--mep-divider);color:var(--mep-fg-2);display:flex;align-items:center;justify-content:center;">
            <Mail size={16} />
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{$t('upload.emailForward')}</div>
            <div class="num" style="font-size:11.5px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              casa-lua-4f8a@inbox.miseenplace.es
            </div>
          </div>
          <button type="button" class="btn btn-ghost" style="height:28px;font-size:11.5px;padding:0 8px;" onclick={(e) => { e.stopPropagation(); copyEmail(); }}>
            {$t('upload.copy')}
          </button>
        </div>
      </div>
    </div>

    <!-- Right: Queue -->
    <div class="card" style="padding:16px 16px 12px;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span class="subtitle">{$t('upload.queue')}</span>
        {#if files.length > 0}
          <span class="num" style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{files.length}</span>
        {/if}
      </div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:12px;">
        {files.length === 0 ? $t('upload.queueEmpty') : $t('upload.queueNotStarted')}
      </div>

      <!-- File list -->
      {#if files.length > 0}
        <div style="display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;min-height:0;">
          {#each files as f, i}
            {@const kind = fileKind(f.name)}
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--mep-divider);background:var(--mep-surface);">
              <div style="width:32px;height:40px;border-radius:4px;flex-shrink:0;background:{kind === 'pdf' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;letter-spacing:0.04em;">
                {kind === 'pdf' ? 'PDF' : 'IMG'}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.name}</div>
                <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{fmtSize(f.size)}</div>
              </div>
              <button type="button" class="btn btn-ghost" style="width:24px;height:24px;padding:0;justify-content:center;" onclick={() => removeFile(i)}>
                <X size={13} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div style="flex:1;display:flex;align-items:center;justify-content:center;">
          <div style="text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;opacity:0.3;">📂</div>
            <span class="body" style="font-size:12px;color:var(--mep-fg-4);">{$t('upload.noFiles')}</span>
          </div>
        </div>
      {/if}

      <!-- Extract button -->
      <div style="padding-top:12px;border-top:1px solid var(--mep-divider);margin-top:12px;">
        <button
          type="button"
          class="btn btn-primary"
          style="width:100%;height:38px;justify-content:center;font-weight:500;gap:6px;"
          disabled={files.length === 0 || uploading}
          onclick={doUpload}
        >
          {#if uploading}
            <svg width="14" height="14" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;flex-shrink:0;">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
              <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            {$t('upload.uploading')}
          {:else}
            <Sparkle size={14} />
            {files.length === 0 ? $t('upload.extractData') : files.length === 1 ? $t('upload.extractData1') : $t('upload.extractDataN').replace('{n}', String(files.length))}
          {/if}
        </button>
      </div>
    </div>

  </div>
</div>

