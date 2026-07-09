<script lang="ts">
  import { fmtSize } from '$lib/formatters';
  import { goto } from '$app/navigation';
  import Upload from '@lucide/svelte/icons/upload';
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Camera from '@lucide/svelte/icons/camera';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import { t, ti, tp } from '$lib/i18n';

  interface Props {
    data: { saved: boolean; duplicate: boolean; error: string | null; hasCompletedOnboarding: boolean; upgradeUrl?: string | null };
    form: { error?: string; upgradeUrl?: string } | null;
  }

  const { data, form }: Props = $props();

  const errorMsg = $derived(form?.error ?? (data.error ? decodeURIComponent(data.error) : null));
  const upgradeUrl = $derived(form?.upgradeUrl ?? data.upgradeUrl ?? null);

  let files = $state<File[]>([]);
  let isDragging = $state(false);
  let uploading = $state(false);
  let fileInputEl = $state<HTMLInputElement>();
  let cameraInputEl = $state<HTMLInputElement>();
  const MAX_MB = 20;

  let previewUrl = $state<string | null>(null);
  let previewFile = $state<File | null>(null);

  let showCaptureTip = $state(false);
  const TIP_KEY = 'mise_capture_tip_seen';

  const OFFLINE_MAX = 3;
  let offlineBanner = $state<'saved' | 'retrying' | null>(null);
  let pendingOfflineCount = $state(0);

  let uploadProgress = $state(0);

  const STEPS = $derived([$t('steps.upload'), $t('steps.extract'), $t('steps.review')]);

  // ── IndexedDB helpers ───────────────────────────────────────────────────
  const DB_NAME = 'mise-offline-queue';
  const STORE_NAME = 'pending';

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getQueuedCount(): Promise<number> {
    try {
      const db = await openDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).count();
        req.onsuccess = () => { resolve(req.result); db.close(); };
        req.onerror = () => { resolve(0); db.close(); };
      });
    } catch { return 0; }
  }

  async function addToOfflineQueue(filesToQueue: File[]): Promise<void> {
    const db = await openDb();
    const items = await Promise.all(filesToQueue.map(async (f) => {
      const b64 = await fileToBase64(f);
      return { name: f.name, type: f.type, data: b64, timestamp: Date.now() };
    }));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of items) store.add(item);
      tx.oncomplete = () => { resolve(); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    });
  }

  async function getQueuedItems(): Promise<Array<{ id: number; name: string; type: string; data: string }>> {
    try {
      const db = await openDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => { resolve(req.result); db.close(); };
        req.onerror = () => { resolve([]); db.close(); };
      });
    } catch { return []; }
  }

  async function removeFromOfflineQueue(id: number): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => { resolve(); db.close(); };
      });
    } catch { /* ignore */ }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function base64ToFile(b64: string, name: string, type: string): File {
    const arr = b64.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new File([u8], name, { type });
  }

  // ── File helpers ────────────────────────────────────────────────────────
  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    for (const f of Array.from(newFiles)) {
      if (f.size > MAX_MB * 1024 * 1024) { alert($ti('upload.imageTooLarge', { mb: MAX_MB })); continue; }
      if (!files.some(e => e.name === f.name && e.size === f.size)) files = [...files, f];
    }
  }

  function removeFile(idx: number) { files = files.filter((_, i) => i !== idx); }
  function fileKind(name: string) { return name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'img'; }

  // ── Camera capture flow ─────────────────────────────────────────────────
  function openCamera() {
    const tipSeen = typeof localStorage !== 'undefined' && localStorage.getItem(TIP_KEY);
    if (!tipSeen) {
      showCaptureTip = true;
    } else {
      cameraInputEl?.click();
    }
  }

  function dismissTip() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TIP_KEY, '1');
    showCaptureTip = false;
    setTimeout(() => cameraInputEl?.click(), 80);
  }

  function onCameraCapture(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { alert($ti('upload.imageTooLarge', { mb: MAX_MB })); return; }
    previewUrl = URL.createObjectURL(f);
    previewFile = f;
  }

  function confirmPreview() {
    if (previewFile && !files.some(e => e.name === previewFile!.name && e.size === previewFile!.size)) {
      files = [...files, previewFile];
    }
    clearPreview();
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewFile = null;
  }

  function retakePhoto() {
    clearPreview();
    setTimeout(() => cameraInputEl?.click(), 80);
  }

  // ── Upload with progress and offline fallback ───────────────────────────
  function uploadWithProgress(fd: FormData): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/?/upload');
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) uploadProgress = Math.round((e.loaded / e.total) * 100);
      });
      xhr.addEventListener('load', () => {
        try {
          const result = JSON.parse(xhr.responseText) as { type: string; location?: string; data?: { error?: string } };
          if (result.type === 'redirect' && result.location) {
            resolve(result.location);
          } else {
            if (result.data?.error) alert(result.data.error);
            resolve(null);
          }
        } catch { reject(new Error('Invalid response')); }
      });
      xhr.addEventListener('error', () => reject(new Error('network error')));
      xhr.send(fd);
    });
  }

  async function handleOffline(filesToSave: File[]) {
    const count = await getQueuedCount();
    if (count >= OFFLINE_MAX) {
      alert($t('upload.offlineLimit'));
      return;
    }
    await addToOfflineQueue(filesToSave);
    pendingOfflineCount = await getQueuedCount();
    offlineBanner = 'saved';
    files = [];
  }

  async function retryOfflineUploads() {
    const items = await getQueuedItems();
    if (!items.length) { pendingOfflineCount = 0; offlineBanner = null; return; }
    offlineBanner = 'retrying';
    for (const item of items) {
      try {
        const f = base64ToFile(item.data, item.name, item.type);
        const fd = new FormData();
        fd.append('files', f);
        uploadProgress = 0;
        const loc = await uploadWithProgress(fd);
        if (loc) {
          await removeFromOfflineQueue(item.id);
          pendingOfflineCount = await getQueuedCount();
          await goto(loc, { invalidateAll: true });
          return;
        }
      } catch {
        offlineBanner = 'saved';
        return;
      }
    }
    offlineBanner = null;
    pendingOfflineCount = await getQueuedCount();
  }

  async function doUpload() {
    if (!files.length || uploading) return;
    uploading = true;
    uploadProgress = 0;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await handleOffline(files);
      uploading = false;
      return;
    }
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      const loc = await uploadWithProgress(fd);
      if (loc) {
        // Client-side navigation keeps the app shell (and the user's momentum)
        // intact — a hard reload here re-runs every layout query for nothing.
        await goto(loc, { invalidateAll: true });
      } else {
        uploading = false;
        uploadProgress = 0;
      }
    } catch (err) {
      uploading = false;
      uploadProgress = 0;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await handleOffline(files);
      } else {
        alert($ti('upload.uploadError', { msg: (err as Error).message }));
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    addFiles(e.dataTransfer?.files ?? null);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  $effect(() => {
    getQueuedCount().then((n) => {
      pendingOfflineCount = n;
      if (n > 0 && navigator.onLine) retryOfflineUploads();
    });
    const onOnline = () => retryOfflineUploads();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });
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
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;display:flex;flex-direction:column;gap:8px;">
          <span>{errorMsg}</span>
          {#if upgradeUrl}
            <a href={upgradeUrl} class="btn btn-primary" style="align-self:flex-start;height:32px;font-size:12.5px;text-decoration:none;">
              {$t('upload.upgradeCta')}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Offline banner -->
  {#if offlineBanner}
    <div style="padding:0 18px 8px;flex-shrink:0;">
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:10px 12px;border-radius:10px;
        background:#fff8e6;border:1px solid #f5a623;
        font-size:12.5px;color:#7a5200;
      ">
        {#if offlineBanner === 'retrying'}
          <svg width="14" height="14" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;flex-shrink:0;">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
            <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          {$t('upload.offlineRetrying')}
        {:else}
          <WifiOff size={14} style="flex-shrink:0;" />
          <span>{$t('upload.offlineSaved')}{pendingOfflineCount > 1 ? ` (${pendingOfflineCount})` : ''}</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Scrollable body -->
  <div style="flex:1;overflow-y:auto;padding:0 18px 0;display:flex;flex-direction:column;gap:12px;padding-bottom:12px;">

    <!-- Upload zone -->
    <div class="card" data-coach="upload-zone" style="padding:16px;">
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
          {data.hasCompletedOnboarding ? $t('upload.dropHeadline') : $t('dash.firstInvoice')}
        </div>
        <div style="font-size:12.5px;color:var(--mep-fg-2);margin-bottom:14px;text-align:center;">
          {#if data.hasCompletedOnboarding}
            <span style="color:var(--mep-acc);font-weight:500;">{$t('upload.dropBrowse')}</span> · {$t('upload.dropSub')}
          {:else}
            {$t('upload.onboardHintShort')}
          {/if}
        </div>

        <!-- Camera + Browse buttons -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          <button
            type="button"
            class="btn btn-primary"
            style="height:36px;padding:0 16px;pointer-events:auto;gap:6px;display:flex;align-items:center;"
            onclick={(e) => { e.stopPropagation(); openCamera(); }}
          >
            <Camera size={14} />
            {$t('upload.cameraBtn')}
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            style="height:36px;padding:0 14px;pointer-events:auto;"
            onclick={(e) => { e.stopPropagation(); fileInputEl?.click(); }}
          >
            {$t('upload.browseFiles')}
          </button>
        </div>

        <!-- Hidden file input -->
        <input
          bind:this={fileInputEl}
          type="file"
          class="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          multiple
          onchange={() => { addFiles(fileInputEl?.files ?? null); if (fileInputEl) fileInputEl.value = ''; }}
        />

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
    {#if uploading && uploadProgress > 0}
      <div style="margin-bottom:8px;border-radius:4px;overflow:hidden;background:var(--mep-surface-2);height:4px;">
        <div style="height:100%;background:var(--mep-acc);width:{uploadProgress}%;transition:width 200ms linear;border-radius:4px;"></div>
      </div>
    {/if}
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
        {uploadProgress > 0 ? `${$t('upload.uploading')} ${uploadProgress}%` : $t('upload.uploading')}
      {:else}
        <Sparkle size={14} />
        {$tp('upload.extractData', files.length)}
      {/if}
    </button>
  </div>
</div>

<!-- ── Desktop upload ─────────────────────────────────────────────────── -->
<div class="hidden md:flex flex-col" style="height:100%;overflow:hidden;">

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
        <div class="card p-3 bg-neg-soft border-neg text-neg" style="font-size:13px;display:flex;flex-direction:column;gap:8px;">
          <span>{errorMsg}</span>
          {#if upgradeUrl}
            <a href={upgradeUrl} class="btn btn-primary" style="align-self:flex-start;height:32px;font-size:12.5px;text-decoration:none;">
              {$t('upload.upgradeCta')}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Two-column grid -->
  <div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-columns:1.6fr 1fr;gap:16px;">

    <!-- Left: Drop zone -->
    <div class="card" data-coach="upload-zone" style="padding:20px;display:flex;flex-direction:column;">
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
        <div style="width:56px;height:56px;border-radius:28px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;margin-bottom:16px;flex-shrink:0;">
          <Upload size={24} />
        </div>

        <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;margin-bottom:6px;text-align:center;">
          {data.hasCompletedOnboarding ? $t('upload.dropHeadline') : $t('dash.firstInvoice')}
        </div>
        <div style="font-size:13px;color:var(--mep-fg-2);margin-bottom:16px;text-align:center;max-width:360px;">
          {#if data.hasCompletedOnboarding}
            O <span style="color:var(--mep-acc);font-weight:500;">{$t('upload.dropBrowse')}</span> · {$t('upload.dropSub')}
          {:else}
            {$t('upload.onboardHint')}
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
            {$tp('upload.extractData', files.length)}
          {/if}
        </button>
      </div>
    </div>

  </div>
</div>

<!-- Camera input — always in DOM, shared by both layouts -->
<input
  bind:this={cameraInputEl}
  type="file"
  class="hidden"
  accept="image/*"
  capture="environment"
  onchange={onCameraCapture}
/>

<!-- ── Mobile overlays ────────────────────────────────────────────────── -->

<!-- Capture tip bottom sheet (mobile only) -->
{#if showCaptureTip}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="md:hidden"
    style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={() => showCaptureTip = false}
    onkeydown={(e) => e.key === 'Escape' && (showCaptureTip = false)}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      style="width:100%;background:var(--mep-bg);border-radius:20px 20px 0 0;padding:20px 20px calc(28px + env(safe-area-inset-bottom,0px));"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div style="width:36px;height:4px;border-radius:2px;background:var(--mep-divider);margin:0 auto 18px;"></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:36px;height:36px;border-radius:18px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <Camera size={16} />
        </div>
        <span style="font-size:16px;font-weight:600;color:var(--mep-fg);">{$t('upload.captureTipTitle')}</span>
      </div>
      <p style="font-size:14px;color:var(--mep-fg-2);line-height:1.5;margin-bottom:20px;">
        {$t('upload.captureTip')}
      </p>
      <button
        type="button"
        class="btn btn-primary"
        style="width:100%;height:44px;justify-content:center;font-size:14px;font-weight:500;gap:6px;"
        onclick={dismissTip}
      >
        <Check size={15} />
        {$t('upload.captureTipDismiss')}
      </button>
    </div>
  </div>
{/if}

<!-- Image preview overlay (mobile only) -->
{#if previewUrl}
  <div
    class="md:hidden"
    style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-height:0;overflow:hidden;">
      <img
        src={previewUrl}
        alt="Vista previa de factura"
        style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;box-shadow:0 4px 32px rgba(0,0,0,0.5);"
      />
    </div>
    <div style="padding:16px 20px calc(28px + env(safe-area-inset-bottom,0px));background:var(--mep-bg);border-radius:20px 20px 0 0;display:flex;flex-direction:column;gap:10px;">
      {#if previewFile}
        <div style="font-size:12px;color:var(--mep-fg-3);text-align:center;">
          {previewFile.name} · {fmtSize(previewFile.size)}
        </div>
      {/if}
      <button
        type="button"
        class="btn btn-primary"
        style="width:100%;height:44px;justify-content:center;font-size:14px;font-weight:500;gap:6px;"
        onclick={confirmPreview}
      >
        <Check size={15} />
        {$t('upload.previewUse')}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        style="width:100%;height:40px;justify-content:center;font-size:13px;gap:6px;"
        onclick={retakePhoto}
      >
        <Camera size={14} />
        {$t('upload.previewRetake')}
      </button>
    </div>
  </div>
{/if}
