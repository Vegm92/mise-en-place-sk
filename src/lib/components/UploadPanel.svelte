<script lang="ts">
  import { fmtSize } from '$lib/formatters';
  import {
    UPLOAD_ACCEPT,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_TOTAL_BYTES,
    exceedsUploadTotal,
    isHeicUpload,
    uploadExtname,
    validateUploadFile,
    ZIP_UPLOAD_ACCEPT,
  } from '$lib/upload-formats';
  import { detectDirectoryPickerSupport } from '$lib/upload-capabilities';
  import {
    OFFLINE_QUEUE_MAX_ITEMS,
    createIndexedDbOfflineQueueStorage,
    enqueueFiles,
    queueCount,
    retryOfflineQueue,
    sweepExpiredEntries,
    type UploadOutcome,
  } from '$lib/offline-queue';
  import { goto } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import type { ActionResult } from '@sveltejs/kit';
  import Upload from '@lucide/svelte/icons/upload';
  import FolderUp from '@lucide/svelte/icons/folder-up';
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Camera from '@lucide/svelte/icons/camera';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import Lock from '@lucide/svelte/icons/lock';
  import { t, ti, tp } from '$lib/i18n';
  import FlowSteps from '$lib/components/mep/FlowSteps.svelte';
  import FileTypeBadge from '$lib/components/FileTypeBadge.svelte';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';

  type ErrorVars = Record<string, string | number>;
  type UploadFailure = { error?: string; errorVars?: ErrorVars };

  interface Props {
    data: {
      saved: boolean; duplicate: boolean; error: string | null;
      errorVars?: ErrorVars; hasCompletedOnboarding: boolean; upgradeUrl?: string | null;
      trialExpired?: boolean;
    };
    form: { error?: string; errorVars?: ErrorVars; upgradeUrl?: string } | null;
  }

  const { data, form }: Props = $props();

  let localError = $state<string | null>(null);
  let localErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function showError(message: string, transient = false) {
    if (localErrorTimer) clearTimeout(localErrorTimer);
    localError = message;
    localErrorTimer = transient
      ? setTimeout(() => { localError = null; localErrorTimer = null; }, 6000)
      : null;
  }

  function dismissError() {
    if (localErrorTimer) clearTimeout(localErrorTimer);
    localErrorTimer = null;
    localError = null;
  }

  const serverError = $derived.by(() => {
    const key = form?.error ?? (data.error ? decodeURIComponent(data.error) : null);
    if (!key) return null;
    const vars = form?.errorVars ?? data.errorVars;
    return vars ? $ti(key, vars) : $t(key);
  });

  function uploadFailureMessage(
    result: ActionResult<Record<string, never>, UploadFailure>,
  ): string {
    if (result.type === 'failure' && result.data?.error) {
      const { error, errorVars } = result.data;
      return errorVars ? $ti(error, errorVars) : $t(error);
    }
    return $t('upload.err.serverError');
  }

  const errorMsg = $derived(localError ?? serverError);
  const upgradeUrl = $derived(form?.upgradeUrl ?? data.upgradeUrl ?? null);
  const trialExpired = $derived(!!data.trialExpired);

  let files = $state<File[]>([]);
  let isDragging = $state(false);
  let uploading = $state(false);
  let fileInputEl = $state<HTMLInputElement>();
  let folderInputEl = $state<HTMLInputElement>();
  let zipInputEl = $state<HTMLInputElement>();
  let cameraInputEl = $state<HTMLInputElement>();
  let canPickFolder = $state(true);
  const MAX_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
  const MAX_TOTAL_MB = MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024);

  const SKIP_QUOTA_WARNING_KEY = 'mep-skip-quota-warning';
  let showQuotaConfirm = $state(false);
  let skipQuotaWarning = $state(false);

  let previewUrl = $state<string | null>(null);
  let previewFile = $state<File | null>(null);

  let offlineBanner = $state<'saved' | 'retrying' | null>(null);
  let pendingOfflineCount = $state(0);

  let uploadProgress = $state(0);

  const queueStorage = createIndexedDbOfflineQueueStorage();

  async function addFiles(newFiles: FileList | null) {
    if (!newFiles || trialExpired) return;
    for (const f of Array.from(newFiles)) {
      if (isHeicUpload(f)) { showError($ti('upload.reject.heic', { name: f.name })); continue; }
      const reason = await validateUploadFile(f);
      if (reason) {
        showError($ti(`upload.reject.${reason}`, { name: f.name, ext: uploadExtname(f.name) }));
        continue;
      }
      const relPath = f.webkitRelativePath || f.name;
      if (!files.some(e => e.name === f.name && e.size === f.size && (e.webkitRelativePath || e.name) === relPath)) {
        files = [...files, f];
      }
    }
  }

  function removeFile(idx: number) { files = files.filter((_, i) => i !== idx); }
  function fileKind(name: string): 'pdf' | 'zip' | 'img' {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'zip') return 'zip';
    return 'img';
  }

  function openFolderPicker() {
    if (trialExpired) return;
    if (canPickFolder) folderInputEl?.click();
    else zipInputEl?.click();
  }

  function openCamera() {
    if (trialExpired) return;
    cameraInputEl?.click();
  }

  function onCameraCapture(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { showError($ti('upload.imageTooLarge', { mb: MAX_MB }), true); return; }
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

  function uploadWithProgress(fd: FormData): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/?/upload');
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) uploadProgress = Math.round((e.loaded / e.total) * 100);
      });
      xhr.addEventListener('load', () => {
        let result: ActionResult<Record<string, never>, UploadFailure>;
        try {
          result = deserialize<Record<string, never>, UploadFailure>(xhr.responseText);
        } catch {
          reject(new Error($t('upload.err.badResponse')));
          return;
        }
        if (result.type === 'redirect') {
          resolve(result.location);
          return;
        }
        if (result.type === 'failure' || result.type === 'error') {
          showError(uploadFailureMessage(result));
        }
        resolve(null);
      });
      xhr.addEventListener('error', () => reject(new Error($t('upload.err.network'))));
      xhr.send(fd);
    });
  }

  async function handleOffline(filesToSave: File[]) {
    const count = await queueCount(queueStorage);
    if (count >= OFFLINE_QUEUE_MAX_ITEMS) {
      showError($t('upload.offlineLimit'), true);
      return;
    }
    await enqueueFiles(queueStorage, filesToSave);
    pendingOfflineCount = await queueCount(queueStorage);
    offlineBanner = 'saved';
    files = [];
  }

  async function uploadForRetry(file: File): Promise<UploadOutcome> {
    const fd = new FormData();
    fd.append('files', file);
    uploadProgress = 0;
    const loc = await uploadWithProgress(fd);
    return loc ? { status: 'success', location: loc } : { status: 'rejected' };
  }

  let retryInFlight = false;

  async function retryOfflineUploads() {
    if (retryInFlight) return;
    retryInFlight = true;
    try {
      const count = await queueCount(queueStorage);
      if (count === 0) { pendingOfflineCount = 0; offlineBanner = null; return; }
      offlineBanner = 'retrying';
      const result = await retryOfflineQueue(queueStorage, uploadForRetry);
      pendingOfflineCount = result.remaining;
      if (result.droppedFailed > 0) showError($tp('upload.offlineDropped', result.droppedFailed));
      if (result.location) {
        await goto(result.location, { invalidateAll: true });
        return;
      }
      offlineBanner = result.remaining > 0 ? 'saved' : null;
    } finally {
      retryInFlight = false;
    }
  }

  let quotaAcknowledged = false;

  function confirmUpload() {
    if (skipQuotaWarning && typeof localStorage !== 'undefined') {
      localStorage.setItem(SKIP_QUOTA_WARNING_KEY, '1');
    }
    quotaAcknowledged = true;
    doUpload();
  }

  async function doUpload() {
    if (!files.length || uploading || trialExpired) return;
    if (!quotaAcknowledged && !(typeof localStorage !== 'undefined' && localStorage.getItem(SKIP_QUOTA_WARNING_KEY))) {
      showQuotaConfirm = true;
      return;
    }
    quotaAcknowledged = false;
    dismissError();
    if (exceedsUploadTotal(files)) {
      showError($ti('upload.err.totalTooLarge', { mb: MAX_TOTAL_MB }));
      return;
    }
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
        showError($ti('upload.uploadError', { msg: (err as Error).message }));
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (trialExpired) return;
    addFiles(e.dataTransfer?.files ?? null);
  }

  $effect(() => {
    canPickFolder = detectDirectoryPickerSupport();
  });

  $effect(() => {
    sweepExpiredEntries(queueStorage).then((result) => {
      if (result.dropped > 0) showError($tp('upload.offlineExpired', result.dropped));
      pendingOfflineCount = result.remaining.length;
      if (result.remaining.length > 0 && navigator.onLine) retryOfflineUploads();
    });
    const onOnline = () => retryOfflineUploads();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });
</script>

<div class="md:hidden flex flex-col" style="height:100%;overflow:hidden;">

  <div style="padding:0 18px 10px;flex-shrink:0;">
    <FlowSteps active={0} size="sm" />
  </div>

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
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <span style="flex:1;">{errorMsg}</span>
            {#if localError}
              <button
                type="button"
                class="btn btn-ghost"
                style="width:22px;height:22px;padding:0;justify-content:center;flex-shrink:0;color:inherit;"
                aria-label={$t('action.cancel')}
                onclick={dismissError}
              >
                <X size={12} />
              </button>
            {/if}
          </div>
          {#if upgradeUrl}
            <a href={upgradeUrl} class="btn btn-primary" style="align-self:flex-start;font-size:12.5px;text-decoration:none;">
              {$t('upload.upgradeCta')}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if offlineBanner}
    <div style="padding:0 18px 8px;flex-shrink:0;">
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:10px 12px;border-radius:10px;
        background:var(--mep-warn-soft);border:1px solid var(--mep-warn);
        font-size:12.5px;color:var(--mep-warn);
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

  <div style="flex:1;overflow-y:auto;padding:0 18px 0;display:flex;flex-direction:column;gap:12px;padding-bottom:12px;">

    <div class="card" data-coach="upload-zone" style="padding:16px;">
      {#if trialExpired}
        <div style="
          border:1.5px dashed var(--mep-border-strong);
          border-radius:10px;
          display:flex;flex-direction:column;align-items:center;
          padding:24px 16px;
          background:var(--mep-surface-2);
          opacity:0.7;
        ">
          <div style="width:48px;height:48px;border-radius:var(--mep-r-pill);background:var(--mep-hover);color:var(--mep-fg-3);display:flex;align-items:center;justify-content:center;margin-bottom:12px;flex-shrink:0;">
            <Lock size={22} />
          </div>
          <div style="font-size:16px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;margin-bottom:4px;text-align:center;">
            {$t('upload.trialExpiredTitle')}
          </div>
          <div style="font-size:13px;color:var(--mep-fg-2);margin-bottom:14px;text-align:center;">
            {$t('billing.trialExpiredMsg')}
          </div>
          <a href="/billing?upgrade=trial" class="btn btn-primary" style="height:36px;padding:0 16px;text-decoration:none;">
            {$t('billing.subscribeNow')}
          </a>
        </div>
      {:else}
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
          <button
            type="button"
            class="btn btn-ghost"
            style="height:36px;padding:0 14px;pointer-events:auto;gap:6px;display:flex;align-items:center;"
            onclick={(e) => { e.stopPropagation(); openFolderPicker(); }}
          >
            <FolderUp size={14} />
            {canPickFolder ? $t('upload.browseFolder') : $t('upload.browseZip')}
          </button>
        </div>

        {#if !canPickFolder}
          <div style="font-size:11px;color:var(--mep-fg-3);margin-top:10px;text-align:center;max-width:300px;line-height:1.45;">
            {$t('upload.folderZipHint')}
          </div>
        {/if}

      </div>
      {/if}
    </div>

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
              <FileTypeBadge kind={kind === 'pdf' ? 'pdf' : 'other'} label={kind === 'pdf' ? 'PDF' : kind === 'zip' ? 'ZIP' : 'IMG'} size="sm" />
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
      disabled={files.length===0||uploading||trialExpired}
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

<div class="hidden md:flex flex-col" style="height:100%;overflow:hidden;">

  <div style="padding:20px 32px 0;flex-shrink:0;">
    <FlowSteps active={0} />
  </div>

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
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <span style="flex:1;">{errorMsg}</span>
            {#if localError}
              <button
                type="button"
                class="btn btn-ghost"
                style="width:22px;height:22px;padding:0;justify-content:center;flex-shrink:0;color:inherit;"
                aria-label={$t('action.cancel')}
                onclick={dismissError}
              >
                <X size={12} />
              </button>
            {/if}
          </div>
          {#if upgradeUrl}
            <a href={upgradeUrl} class="btn btn-primary" style="align-self:flex-start;font-size:12.5px;text-decoration:none;">
              {$t('upload.upgradeCta')}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-columns:1.6fr 1fr;grid-template-rows:minmax(0,1fr);gap:16px;">

    <div class="card" data-coach="upload-zone" style="padding:20px;display:flex;flex-direction:column;">
      {#if trialExpired}
        <div style="
          flex:1;border:1.5px dashed var(--mep-border-strong);
          border-radius:10px;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:32px 24px;
          background:var(--mep-surface-2);
          opacity:0.7;
        ">
          <div style="width:56px;height:56px;border-radius:var(--mep-r-pill);background:var(--mep-hover);color:var(--mep-fg-3);display:flex;align-items:center;justify-content:center;margin-bottom:16px;flex-shrink:0;">
            <Lock size={24} />
          </div>
          <div style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;margin-bottom:6px;text-align:center;">
            {$t('upload.trialExpiredTitle')}
          </div>
          <div style="font-size:13px;color:var(--mep-fg-2);margin-bottom:16px;text-align:center;max-width:360px;">
            {$t('billing.trialExpiredMsg')}
          </div>
          <a href="/billing?upgrade=trial" class="btn btn-primary" style="height:36px;padding:0 14px;text-decoration:none;">
            {$t('billing.subscribeNow')}
          </a>
        </div>
      {:else}
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

        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          <button
            type="button"
            class="btn btn-primary"
            style="height:36px;padding:0 14px;pointer-events:auto;"
            onclick={(e) => { e.stopPropagation(); fileInputEl?.click(); }}
          >
            {$t('upload.browseFiles')}
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            style="height:36px;padding:0 14px;pointer-events:auto;gap:6px;display:flex;align-items:center;"
            onclick={(e) => { e.stopPropagation(); openFolderPicker(); }}
          >
            <FolderUp size={14} />
            {canPickFolder ? $t('upload.browseFolder') : $t('upload.browseZip')}
          </button>
        </div>

        {#if !canPickFolder}
          <div style="font-size:11px;color:var(--mep-fg-3);margin-top:10px;text-align:center;max-width:300px;line-height:1.45;">
            {$t('upload.folderZipHint')}
          </div>
        {/if}

      </div>
      {/if}
    </div>

    <div class="card" style="padding:16px 16px 12px;display:flex;flex-direction:column;min-height:0;">
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
              <FileTypeBadge kind={kind === 'pdf' ? 'pdf' : 'other'} label={kind === 'pdf' ? 'PDF' : kind === 'zip' ? 'ZIP' : 'IMG'} size="lg" />
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

      <div style="padding-top:12px;border-top:1px solid var(--mep-divider);margin-top:12px;">
        <button
          type="button"
          class="btn btn-primary"
          style="width:100%;height:38px;justify-content:center;font-weight:500;gap:6px;"
          disabled={files.length === 0 || uploading || trialExpired}
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

<input
  bind:this={fileInputEl}
  type="file"
  class="hidden"
  accept={UPLOAD_ACCEPT}
  multiple
  onchange={() => { addFiles(fileInputEl?.files ?? null); if (fileInputEl) fileInputEl.value = ''; }}
/>

<input
  bind:this={folderInputEl}
  type="file"
  class="hidden"
  webkitdirectory
  multiple
  onchange={() => { addFiles(folderInputEl?.files ?? null); if (folderInputEl) folderInputEl.value = ''; }}
/>

<input
  bind:this={zipInputEl}
  type="file"
  class="hidden"
  accept={ZIP_UPLOAD_ACCEPT}
  onchange={() => { addFiles(zipInputEl?.files ?? null); if (zipInputEl) zipInputEl.value = ''; }}
/>

<input
  bind:this={cameraInputEl}
  type="file"
  class="hidden"
  accept="image/*"
  capture="environment"
  onchange={onCameraCapture}
/>

<ConfirmDialog
  bind:open={showQuotaConfirm}
  bind:checkboxChecked={skipQuotaWarning}
  message={$tp('upload.confirmExtract', files.length)}
  checkboxLabel={$t('upload.confirmExtract.dontAskAgain')}
  onconfirm={confirmUpload}
/>

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
        alt={$t('upload.previewAlt')}
        style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;box-shadow:0 4px 32px rgba(0,0,0,0.5);"
      />
    </div>
    <div style="padding:16px 20px calc(28px + env(safe-area-inset-bottom,0px));background:var(--mep-bg);border-radius:20px 20px 0 0;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--mep-fg-2);line-height:1.45;">
        <Camera size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-acc);" />
        <span>{$t('upload.captureTip')}</span>
      </div>
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
