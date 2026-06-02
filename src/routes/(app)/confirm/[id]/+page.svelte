<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { PageData } from './$types';
  import { Upload, Mail, Sparkle, X, Check, Clock } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  const { data }: { data: PageData } = $props();

  let addMoreOpen = $state(false);
  let extracting  = $state(false);

  const STEPS = $derived([$t('steps.upload'), $t('steps.extract'), $t('steps.review')]);

  // Step 2 animation — fake stages cycle while server extracts
  const STAGES = $derived([
    $t('confirm.stage.read'),
    $t('confirm.stage.supplier'),
    $t('confirm.stage.header'),
    $t('confirm.stage.lines'),
    $t('confirm.stage.verify'),
  ]);
  let stageIdx = $state(0);
  let stageInterval: ReturnType<typeof setInterval>;

  function startExtracting() {
    extracting = true;
    stageInterval = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, STAGES.length - 1);
    }, 900);
  }

  onMount(() => {
    const isMobile = navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent);
    const addCaptureRow  = document.getElementById('addCaptureRow') as HTMLElement | null;
    const addDropArea    = document.getElementById('addDropArea') as HTMLElement | null;
    const addFileInput   = document.getElementById('addFileInput') as HTMLInputElement | null;
    const addCameraInput = document.getElementById('addCameraInput') as HTMLInputElement | null;
    const addBrowseInput = document.getElementById('addBrowseInput') as HTMLInputElement | null;
    const addFileList    = document.getElementById('addFileList') as HTMLElement | null;
    const addSubmitBtn   = document.getElementById('addSubmitBtn') as HTMLButtonElement | null;

    if (isMobile && addCaptureRow && addDropArea) {
      addCaptureRow.classList.remove('hidden');
      addDropArea.classList.add('hidden');
    }

    let addFiles: File[] = [];

    function renderAdd() {
      if (!addFileList || !addSubmitBtn) return;
      addFileList.innerHTML = addFiles.map((f, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--mep-divider);background:var(--mep-surface);">
          <div style="width:28px;height:36px;border-radius:4px;flex-shrink:0;background:${f.name.toLowerCase().endsWith('.pdf') ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;">
            ${f.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
          </div>
          <span style="flex:1;font-size:12.5px;font-weight:500;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
          <button type="button" data-idx="${i}" style="background:transparent;border:none;cursor:pointer;color:var(--mep-fg-3);font-size:14px;padding:0 2px;" title="${get(t)('confirm.remove')}">✕</button>
        </div>`).join('');
      addFileList.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => { addFiles.splice(Number((btn as HTMLElement).dataset.idx), 1); renderAdd(); });
      });
      if (addSubmitBtn) {
        addSubmitBtn.disabled = addFiles.length === 0;
        addSubmitBtn.style.opacity = addFiles.length === 0 ? '0.5' : '1';
        const tr = get(t);
        addSubmitBtn.textContent = addFiles.length === 0 ? tr('confirm.addFile') : addFiles.length === 1 ? tr('confirm.addFile1') : tr('confirm.addFileN').replace('{n}', String(addFiles.length));
      }
    }

    function pushFiles(newFiles: FileList | null) {
      if (!newFiles) return;
      for (const f of Array.from(newFiles)) {
        if (!addFiles.some(e => e.name === f.name && e.size === f.size)) addFiles.push(f);
      }
      renderAdd();
    }

    (window as Window & { submitAddFiles?: () => Promise<void> }).submitAddFiles = async () => {
      if (addFiles.length === 0 || !addSubmitBtn) return;
      addSubmitBtn.disabled = true;
      addSubmitBtn.textContent = get(t)('confirm.adding');
      const fd = new FormData();
      for (const f of addFiles) fd.append('files', f);
      try {
        const resp = await fetch('?/add', { method: 'POST', body: fd });
        const result = await resp.json() as { type: string; location?: string };
        if (result.type === 'redirect' && result.location) location.replace(result.location);
        else { addSubmitBtn.disabled = false; renderAdd(); }
      } catch { addSubmitBtn.disabled = false; renderAdd(); }
    };

    addFileInput?.addEventListener('change', () => { pushFiles(addFileInput.files); addFileInput.value = ''; });
    addCameraInput?.addEventListener('change', () => { pushFiles(addCameraInput.files); addCameraInput.value = ''; });
    addBrowseInput?.addEventListener('change', () => { pushFiles(addBrowseInput.files); addBrowseInput.value = ''; });

    if (addDropArea) {
      addDropArea.addEventListener('dragover', e => { e.preventDefault(); addDropArea.classList.add('border-acc'); });
      addDropArea.addEventListener('dragleave', () => addDropArea.classList.remove('border-acc'));
      addDropArea.addEventListener('drop', e => {
        e.preventDefault();
        addDropArea.classList.remove('border-acc');
        pushFiles((e as DragEvent).dataTransfer?.files ?? null);
      });
    }

    // Auto-extract on mobile — skips the manual confirm step
    if (isMobile) {
      setTimeout(() => {
        startExtracting();
        (document.getElementById('mobileExtractForm') as HTMLFormElement)?.requestSubmit();
      }, 150);
    }

    return () => clearInterval(stageInterval);
  });
</script>

<!-- ── Extracting overlay — mobile ─────────────────────────────────────── -->
{#if extracting}
  <div class="md:hidden" style="position:fixed;inset:0;z-index:50;background:var(--mep-bg);display:flex;flex-direction:column;overflow:hidden;">
    <!-- Compact step indicator -->
    <div style="padding:18px 18px 12px;flex-shrink:0;display:flex;align-items:center;gap:6px;">
      {#each STEPS as step, i}
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="
            width:18px;height:18px;border-radius:9px;
            background:{i===0?'var(--mep-pos)':i===1?'var(--mep-acc)':'var(--mep-surface-2)'};
            color:{i<2?'#fff':'var(--mep-fg-3)'};
            font-size:10px;font-weight:600;
            display:inline-flex;align-items:center;justify-content:center;
            border:{i<2?'none':'1px solid var(--mep-divider)'};
            flex-shrink:0;
          ">
            {#if i===0}<Check size={10} />{:else}{i+1}{/if}
          </span>
          <span style="font-size:12px;font-weight:{i===1?600:400};color:{i===1?'var(--mep-fg)':i===0?'var(--mep-fg-2)':'var(--mep-fg-3)'};">{step}</span>
        </div>
        {#if i < STEPS.length - 1}
          <div style="width:14px;height:1px;background:var(--mep-divider);flex-shrink:0;"></div>
        {/if}
      {/each}
    </div>

    <!-- Centered extraction status -->
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 32px;gap:20px;">
      <!-- File thumbnail -->
      <div style="width:56px;height:70px;border-radius:8px;background:{data.files[0]?.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,0.12);">
        {data.files[0]?.type ?? 'IMG'}
      </div>

      <!-- Spinner -->
      <div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
        <svg width="52" height="52" viewBox="0 0 52 52" style="position:absolute;">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--mep-divider)" stroke-width="3"/>
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--mep-acc)" stroke-width="3" stroke-linecap="round"
            stroke-dasharray="138" stroke-dashoffset="{138 - (138 * (stageIdx + 1) / STAGES.length)}"
            style="transition:stroke-dashoffset 0.9s ease;transform:rotate(-90deg);transform-origin:26px 26px;"/>
        </svg>
        <div style="color:var(--mep-acc);">
          <svg width="18" height="18" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
            <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
      </div>

      <!-- Stage text -->
      <div style="text-align:center;">
        <div style="font-size:16px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;">{data.files[0]?.name ?? ''}</div>
        <div style="font-size:13px;color:var(--mep-acc);font-weight:500;">{STAGES[stageIdx]}</div>
      </div>

      <!-- Stage list -->
      <div style="width:100%;max-width:280px;display:flex;flex-direction:column;gap:2px;">
        {#each STAGES as stage, i}
          {@const sstate = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending'}
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;">
            <div style="width:16px;height:16px;flex-shrink:0;">
              {#if sstate === 'done'}
                <div style="width:16px;height:16px;border-radius:8px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;">
                  <Check size={10} />
                </div>
              {:else if sstate === 'active'}
                <div style="width:16px;height:16px;border-radius:8px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;">
                  <svg width="8" height="8" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
                    <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </div>
              {:else}
                <div style="width:16px;height:16px;border-radius:8px;border:1px dashed var(--mep-border);"></div>
              {/if}
            </div>
            <span style="font-size:12.5px;font-weight:{sstate==='active'?600:400};color:{sstate==='pending'?'var(--mep-fg-3)':'var(--mep-fg)'};">{stage}</span>
          </div>
        {/each}
      </div>

      <div style="font-size:12px;color:var(--mep-fg-3);text-align:center;">{$t('confirm.redirectingDesc')}</div>
    </div>
  </div>

  <!-- ── Extracting overlay — desktop ──────────────────────────────────── -->
  <div class="hidden md:flex" style="position:fixed;inset:0;z-index:50;background:var(--mep-bg);flex-direction:column;overflow:hidden;">
    <!-- 3-step: step 1 done, step 2 active -->
    <div style="padding:20px 32px 0;flex-shrink:0;display:flex;align-items:center;gap:12px;">
      {#each STEPS as step, i}
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="num" style="
            width:22px;height:22px;border-radius:11px;
            background:{i === 0 ? 'var(--mep-pos)' : i === 1 ? 'var(--mep-acc)' : 'var(--mep-surface-2)'};
            color:{i < 2 ? '#fff' : 'var(--mep-fg-3)'};
            font-size:11px;font-weight:600;
            display:inline-flex;align-items:center;justify-content:center;
            border:{i < 2 ? 'none' : '1px solid var(--mep-divider)'};
            flex-shrink:0;
          ">
            {#if i === 0}<Check size={12} />{:else}{i + 1}{/if}
          </span>
          <span style="font-size:13px;font-weight:{i === 1 ? 600 : 400};color:{i === 2 ? 'var(--mep-fg-3)' : 'var(--mep-fg)'};">{step}</span>
        </div>
        {#if i < STEPS.length - 1}
          <div style="width:28px;height:1px;background:var(--mep-divider);"></div>
        {/if}
      {/each}
    </div>

    <!-- Two-column: queue + active panel -->
    <div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-columns:1fr 1.4fr;gap:16px;">
      <!-- Queue with statuses -->
      <div class="card" style="padding:16px 0 12px;display:flex;flex-direction:column;">
        <div class="subtitle" style="padding:0 16px;margin-bottom:12px;">{data.files.length} {data.files.length === 1 ? $t('misc.invoice') : $t('misc.invoices')}</div>
        <div style="display:flex;flex-direction:column;">
          {#each data.files as file, i}
            {@const state = i < stageIdx / STAGES.length * data.files.length ? 'done' : i === Math.floor(stageIdx / STAGES.length * data.files.length) ? 'active' : 'pending'}
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--mep-divider);background:{state === 'active' ? 'var(--mep-acc-soft)' : 'transparent'};">
              <div style="width:32px;height:40px;border-radius:4px;flex-shrink:0;background:{file.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;">
                {file.type}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{file.name}</div>
                <div style="font-size:11.5px;color:var(--mep-fg-2);">
                  {state === 'done' ? $t('confirm.extractDone') : state === 'active' ? $t('confirm.extractActive') : $t('confirm.inQueue')}
                </div>
              </div>
              <div style="flex-shrink:0;">
                {#if state === 'done'}
                  <div style="width:22px;height:22px;border-radius:11px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;">
                    <Check size={13} />
                  </div>
                {:else if state === 'active'}
                  <svg width="22" height="22" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;color:var(--mep-acc);">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="2" />
                    <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                {:else}
                  <div style="width:22px;height:22px;border-radius:11px;border:1px dashed var(--mep-border);color:var(--mep-fg-3);display:flex;align-items:center;justify-content:center;">
                    <Clock size={12} />
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Active extraction stages panel -->
      <div class="card" style="padding:20px 20px 16px;display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:40px;height:50px;border-radius:4px;background:{data.files[0]?.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">
            {data.files[0]?.type ?? 'PDF'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;color:var(--mep-fg);">{data.files[0]?.name ?? ''}</div>
            <div class="num" style="font-size:12px;color:var(--mep-fg-3);">{data.files[0]?.size ?? ''}</div>
          </div>
          <span class="badge badge-pending" style="gap:4px;">
            <Sparkle size={11} />
            Procesando
          </span>
        </div>

        <!-- Extraction stages -->
        <div style="flex:1;">
          {#each STAGES as stage, i}
            {@const sstate = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending'}
            <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--mep-divider);">
              <div style="width:18px;height:18px;flex-shrink:0;">
                {#if sstate === 'done'}
                  <div style="width:18px;height:18px;border-radius:9px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;">
                    <Check size={11} />
                  </div>
                {:else if sstate === 'active'}
                  <div style="width:18px;height:18px;border-radius:9px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;">
                    <svg width="10" height="10" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
                      <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </div>
                {:else}
                  <div style="width:18px;height:18px;border-radius:9px;border:1px dashed var(--mep-border);"></div>
                {/if}
              </div>
              <div style="flex:1;font-size:13px;font-weight:500;color:{sstate === 'pending' ? 'var(--mep-fg-3)' : 'var(--mep-fg)'};">
                {stage}
              </div>
            </div>
          {/each}
        </div>

        <div style="margin-top:12px;padding:12px 14px;background:var(--mep-surface-2);border-radius:8px;border:1px solid var(--mep-divider);">
          <div class="label" style="margin-bottom:6px;">{$t('confirm.redirecting')}</div>
          <div class="body" style="font-size:12px;color:var(--mep-fg-3);">{$t('confirm.redirectingDesc')}</div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── Main page — mobile ─────────────────────────────────────────────── -->
<div class="md:hidden flex flex-col" style="height:100%;overflow:hidden;">

  <!-- Compact step indicator -->
  <div style="padding:0 18px 10px;flex-shrink:0;display:flex;align-items:center;gap:6px;">
    {#each STEPS as step, i}
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="
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

  <!-- Scrollable body -->
  <div style="flex:1;overflow-y:auto;padding:0 18px;display:flex;flex-direction:column;gap:12px;padding-bottom:12px;">

    <!-- Queue card -->
    <div class="card" style="padding:14px 14px 10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span class="subtitle">{$t('upload.queue')}</span>
        <span class="num" style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{data.totalInvoices}</span>
      </div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:10px;">
        {data.totalInvoices === 1 ? $t('confirm.readyToExtract') : $t('confirm.queueOf').replace('{i}', String(data.invoiceIndex)).replace('{n}', String(data.totalInvoices))}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        {#each data.files as file}
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--mep-divider);background:{file.queued ? 'var(--mep-surface-2)' : 'var(--mep-surface)'};">
            <div style="width:28px;height:36px;border-radius:4px;flex-shrink:0;background:{file.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;opacity:{file.queued ? 0.6 : 1};">
              {file.type}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;font-weight:500;color:{file.queued ? 'var(--mep-fg-2)' : 'var(--mep-fg)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{file.name}</div>
              <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{file.type} · {file.size}</div>
            </div>
            {#if file.queued}
              <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--mep-surface-2);color:var(--mep-fg-3);border:1px solid var(--mep-divider);flex-shrink:0;">
                {$t('confirm.inQueue')}
              </span>
            {:else}
              <form method="POST" action="?/remove" style="flex-shrink:0;">
                <input type="hidden" name="filename" value={file.name} />
                <button type="submit" class="btn btn-ghost" style="width:24px;height:24px;padding:0;justify-content:center;">
                  <X size={13} />
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Add more (collapsed by default) -->
    <div class="card" style="padding:14px;">
      <button
        type="button"
        class="btn btn-ghost"
        style="font-size:13px;color:var(--mep-acc);padding:0;width:100%;justify-content:flex-start;"
        onclick={() => addMoreOpen = !addMoreOpen}
      >
        {addMoreOpen ? $t('confirm.hideAdd') : $t('confirm.showAdd')}
      </button>

      {#if addMoreOpen}
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
          <div id="addCaptureRow" style="display:flex;gap:8px;">
            <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-divider);cursor:pointer;font-size:11.5px;font-weight:500;color:var(--mep-fg-3);">
              📷 Foto
              <input type="file" id="addCameraInput" class="hidden" accept="image/*" capture="environment" />
            </label>
            <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-divider);cursor:pointer;font-size:11.5px;font-weight:500;color:var(--mep-fg-3);">
              📁 Buscar
              <input type="file" id="addBrowseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
            </label>
          </div>
          <input type="file" id="addFileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic" multiple />
          <div id="addFileList" class="flex flex-col gap-2"></div>
          <button id="addSubmitBtn" disabled
            class="btn btn-primary opacity-50"
            style="height:38px;justify-content:center;"
            onclick={() => (window as Window & { submitAddFiles?: () => void }).submitAddFiles?.()}>
            {$t('confirm.addFile')}
          </button>
        </div>
      {/if}

      <!-- Email -->
      <div style="margin-top:{addMoreOpen?'14px':'12px'};padding-top:12px;border-top:1px solid var(--mep-divider);display:flex;align-items:center;gap:10px;">
        <div style="width:30px;height:30px;border-radius:15px;flex-shrink:0;background:var(--mep-surface-2);border:1px solid var(--mep-divider);color:var(--mep-fg-2);display:flex;align-items:center;justify-content:center;">
          <Mail size={13} />
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11.5px;font-weight:500;color:var(--mep-fg);">{$t('upload.emailForward')}</div>
          <div class="num" style="font-size:10px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">casa-lua-4f8a@inbox.miseenplace.es</div>
        </div>
      </div>
    </div>

  </div>

  <!-- Sticky extract + discard -->
  <div style="padding:12px 18px 24px;border-top:1px solid var(--mep-divider);background:var(--mep-bg);flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
    <form method="POST" action="?/extract" id="mobileExtractForm" onsubmit={() => startExtracting()}>
      <button type="submit" class="btn btn-primary" style="width:100%;height:44px;justify-content:center;font-weight:500;gap:6px;font-size:14px;">
        <Sparkle size={14} />
        {data.totalInvoices === 1 ? $t('confirm.extract') : $t('confirm.extractN').replace('{n}', String(data.totalInvoices))}
      </button>
    </form>
    <form method="POST" action="?/discard">
      <button type="submit" class="btn btn-secondary" style="width:100%;height:34px;justify-content:center;font-size:12.5px;">
        {$t('confirm.discard')}
      </button>
    </form>
  </div>
</div>

<!-- ── Main page — desktop ────────────────────────────────────────────── -->
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

  <!-- Two-column grid -->
  <div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-columns:1.6fr 1fr;gap:16px;">

    <!-- Left: Add more files -->
    <div class="card" style="padding:20px;display:flex;flex-direction:column;">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        id="addDropArea"
        style="flex:1;border:1.5px dashed var(--mep-border-strong);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:var(--mep-surface-2);cursor:pointer;transition:border-color 150ms,background 150ms;"
        role="button"
        tabindex="0"
        onclick={() => (document.getElementById('addFileInput') as HTMLInputElement)?.click()}
        onkeydown={(e) => e.key === 'Enter' && (document.getElementById('addFileInput') as HTMLInputElement)?.click()}
      >
        <div style="width:48px;height:48px;border-radius:24px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;margin-bottom:12px;flex-shrink:0;">
          <Upload size={20} />
        </div>
        <div style="font-size:15px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">{$t('confirm.addMoreTitle')}</div>
        <div style="font-size:12.5px;color:var(--mep-fg-3);text-align:center;">{$t('confirm.addMoreSub')}</div>

        <div id="addCaptureRow" class="hidden" style="margin-top:12px;gap:8px;width:100%;max-width:280px;">
          <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-divider);cursor:pointer;font-size:11.5px;font-weight:500;color:var(--mep-fg-3);">
            📷 Foto
            <input type="file" id="addCameraInput" class="hidden" accept="image/*" capture="environment" />
          </label>
          <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-divider);cursor:pointer;font-size:11.5px;font-weight:500;color:var(--mep-fg-3);">
            📁 Buscar
            <input type="file" id="addBrowseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
          </label>
        </div>

        <input type="file" id="addFileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic" multiple />
      </div>

      <div id="addFileList" class="flex flex-col gap-2 mt-3"></div>

      {#if addMoreOpen}
        <button id="addSubmitBtn" disabled
          class="btn btn-primary mt-3 opacity-50"
          style="height:38px;justify-content:center;"
          onclick={() => (window as Window & { submitAddFiles?: () => void }).submitAddFiles?.()}>
          Añadir archivos
        </button>
      {/if}

      <!-- Toggle add more -->
      <button type="button" class="btn btn-ghost mt-3" style="font-size:13px;color:var(--mep-acc);padding:0;"
        onclick={() => addMoreOpen = !addMoreOpen}>
        {addMoreOpen ? $t('confirm.hideAdd') : $t('confirm.showAdd')}
      </button>

      <!-- Email forwarding -->
      <div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--mep-divider);display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;border-radius:18px;flex-shrink:0;background:var(--mep-surface-2);border:1px solid var(--mep-divider);color:var(--mep-fg-2);display:flex;align-items:center;justify-content:center;">
          <Mail size={16} />
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{$t('upload.emailForward')}</div>
          <div class="num" style="font-size:11px;color:var(--mep-fg-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">casa-lua-4f8a@inbox.miseenplace.es</div>
        </div>
      </div>
    </div>

    <!-- Right: Queue with uploaded files -->
    <div class="card" style="padding:16px 16px 12px;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span class="subtitle">{$t('upload.queue')}</span>
        <span class="num" style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{data.totalInvoices}</span>
      </div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:12px;">
        {#if data.totalInvoices > 1}
          {$t('confirm.queueOf').replace('{i}', String(data.invoiceIndex)).replace('{n}', String(data.totalInvoices))}
        {:else}
          {$t('confirm.readyToExtract')}
        {/if}
      </div>

      <!-- File list -->
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;min-height:0;">
        {#each data.files as file}
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--mep-divider);background:{file.queued ? 'var(--mep-surface-2)' : 'var(--mep-surface)'};">
            <div style="width:32px;height:40px;border-radius:4px;flex-shrink:0;background:{file.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;opacity:{file.queued ? 0.6 : 1};">
              {file.type}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;font-weight:500;color:{file.queued ? 'var(--mep-fg-2)' : 'var(--mep-fg)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{file.name}</div>
              <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{file.type} · {file.size}</div>
            </div>
            {#if file.queued}
              <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--mep-surface-2);color:var(--mep-fg-3);border:1px solid var(--mep-divider);flex-shrink:0;">
                {$t('confirm.inQueue')}
              </span>
            {:else}
              <form method="POST" action="?/remove" style="flex-shrink:0;">
                <input type="hidden" name="filename" value={file.name} />
                <button type="submit" class="btn btn-ghost" style="width:24px;height:24px;padding:0;justify-content:center;">
                  <X size={13} />
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Extract + Discard -->
      <div style="padding-top:12px;border-top:1px solid var(--mep-divider);margin-top:12px;display:flex;flex-direction:column;gap:6px;">
        <form method="POST" action="?/extract" onsubmit={() => startExtracting()}>
          <button type="submit" class="btn btn-primary" style="width:100%;height:38px;justify-content:center;font-weight:500;gap:6px;">
            <Sparkle size={14} />
            {data.totalInvoices === 1 ? $t('confirm.extract') : $t('confirm.extractN').replace('{n}', String(data.totalInvoices))}
          </button>
        </form>
        <form method="POST" action="?/discard">
          <button type="submit" class="btn btn-secondary" style="width:100%;height:32px;justify-content:center;font-size:12.5px;">
            {$t('confirm.discard')}
          </button>
        </form>
      </div>
    </div>

  </div>
</div>
