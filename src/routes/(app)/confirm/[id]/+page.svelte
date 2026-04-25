<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  let addMoreOpen = $state(false);

  onMount(() => {
    const isMobile = navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent);
    const addCaptureRow = document.getElementById('addCaptureRow') as HTMLElement | null;
    const addDropArea   = document.getElementById('addDropArea') as HTMLElement | null;
    const addFileInput  = document.getElementById('addFileInput') as HTMLInputElement | null;
    const addCameraInput = document.getElementById('addCameraInput') as HTMLInputElement | null;
    const addBrowseInput = document.getElementById('addBrowseInput') as HTMLInputElement | null;
    const addFileList   = document.getElementById('addFileList') as HTMLElement | null;
    const addSubmitBtn  = document.getElementById('addSubmitBtn') as HTMLButtonElement | null;

    if (isMobile && addCaptureRow && addDropArea) {
      addCaptureRow.classList.remove('hidden');
      addDropArea.classList.add('hidden');
    }

    let addFiles: File[] = [];

    function renderAdd() {
      if (!addFileList || !addSubmitBtn) return;
      addFileList.innerHTML = addFiles.map((f, i) => `
        <div class="flex items-center gap-2 text-[13px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] px-3 py-2">
          <span>${f.name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
          <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#1A1A1A]">${f.name}</span>
          <button type="button" class="bg-transparent border-none cursor-pointer text-[#888888] hover:text-[#E05555] transition-colors" data-idx="${i}">✕</button>
        </div>`).join('');
      addFileList.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => { addFiles.splice(Number((btn as HTMLElement).dataset.idx), 1); renderAdd(); });
      });
      addSubmitBtn.disabled = addFiles.length === 0;
      addSubmitBtn.style.opacity = addFiles.length === 0 ? '0.5' : '1';
      addSubmitBtn.textContent = addFiles.length === 0 ? 'Add to invoice' : addFiles.length === 1 ? 'Add 1 file' : `Add ${addFiles.length} files`;
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
      addSubmitBtn.textContent = 'Adding…';
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
      addDropArea.addEventListener('dragover', e => { e.preventDefault(); addDropArea.classList.add('border-[#4A9FD8]', 'bg-[#EFF8FF]'); });
      addDropArea.addEventListener('dragleave', () => addDropArea.classList.remove('border-[#4A9FD8]', 'bg-[#EFF8FF]'));
      addDropArea.addEventListener('drop', e => {
        e.preventDefault();
        addDropArea.classList.remove('border-[#4A9FD8]', 'bg-[#EFF8FF]');
        pushFiles((e as DragEvent).dataTransfer?.files ?? null);
      });
    }
  });
</script>

<!-- Overlay -->
<div id="overlay" class="hidden fixed inset-0 bg-white/85 z-10 flex-col items-center justify-center gap-4">
  <div class="w-9 h-9 border-[3px] border-[#E5E7EB] border-t-[#4A9FD8] rounded-full animate-spin"></div>
  <p class="text-[14px] text-[#666666]">Extracting invoice data…</p>
</div>

<div class="flex items-start justify-center pt-4">
  <div class="w-full max-w-[480px] bg-white rounded-[12px] border border-[#E5E7EB]">

    <div class="px-6 pt-6 pb-4 border-b border-[#F3F4F6]">
      <h1 class="text-[16px] font-semibold text-[#1A1A1A]">Review Files</h1>
      <p class="text-[13px] text-[#888888] mt-[2px]">{data.files.length} file{data.files.length !== 1 ? 's' : ''} uploaded.</p>
    </div>

    <div class="px-6 py-5 flex flex-col gap-4">

      <div class="flex flex-col gap-2">
        {#each data.files as file}
          <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-3 py-3">
            <span class="text-xl">{file.type === 'PDF' ? '📄' : '🖼️'}</span>
            <div class="min-w-0">
              <p class="font-medium text-[13px] text-[#1A1A1A] overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</p>
              <p class="text-[11px] text-[#888888] mt-[2px]">{file.type} · {file.size}</p>
            </div>
            <form method="POST" action="?/remove">
              <input type="hidden" name="filename" value={file.name} />
              <button type="submit" class="bg-transparent border-none cursor-pointer text-[#888888] hover:text-[#E05555] text-[16px] p-0 leading-none transition-colors">✕</button>
            </form>
          </div>
        {/each}
      </div>

      <div class="flex gap-3">
        <form method="POST" action="?/extract" class="flex-1"
              onsubmit={() => { const o = document.getElementById('overlay'); if(o) { o.classList.remove('hidden'); o.classList.add('flex'); } }}>
          <button type="submit"
                  class="w-full h-10 bg-[#4A9FD8] text-white rounded-[8px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
            {data.files.length === 1 ? 'Extract Invoice' : `Extract ${data.files.length} invoices`}
          </button>
        </form>
        <form method="POST" action="?/discard" class="flex-1">
          <button type="submit"
                  class="w-full h-10 border border-[#E5E7EB] bg-white text-[#1A1A1A] rounded-[8px] text-[13px] font-semibold cursor-pointer hover:bg-[#F9FAFB] transition-colors">
            Discard All
          </button>
        </form>
      </div>

      <div>
        <button type="button"
                class="text-[13px] font-semibold text-[#4A9FD8] bg-transparent border-none cursor-pointer p-0 font-[inherit] hover:underline"
                onclick={() => addMoreOpen = !addMoreOpen}>
          {addMoreOpen ? '− Add more files' : '+ Add more files'}
        </button>

        {#if addMoreOpen}
          <div class="mt-3 bg-[#F9FAFB] rounded-[10px] p-4 border border-[#E5E7EB]">
            <div id="addCaptureRow" class="hidden gap-3 mb-3">
              <label class="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-[8px] border-2 border-dashed border-[#E5E7EB] bg-white cursor-pointer text-[#888888] text-[12px] font-semibold hover:border-[#4A9FD8] hover:bg-[#EFF8FF] hover:text-[#4A9FD8] transition-colors">
                <span class="text-xl">📷</span> Take Photo
                <input type="file" id="addCameraInput" class="hidden" accept="image/*" capture="environment" />
              </label>
              <label class="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-[8px] border-2 border-dashed border-[#E5E7EB] bg-white cursor-pointer text-[#888888] text-[12px] font-semibold hover:border-[#4A9FD8] hover:bg-[#EFF8FF] hover:text-[#4A9FD8] transition-colors">
                <span class="text-xl">📁</span> Browse
                <input type="file" id="addBrowseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
              </label>
            </div>
            <div id="addDropArea"
                 class="border-2 border-dashed border-[#E5E7EB] rounded-[8px] py-4 px-4 text-center cursor-pointer transition-colors hover:border-[#4A9FD8] hover:bg-[#EFF8FF]"
                 onclick={() => (document.getElementById('addFileInput') as HTMLInputElement)?.click()}
                 role="button" tabindex="0"
                 onkeydown={(e) => e.key === 'Enter' && (document.getElementById('addFileInput') as HTMLInputElement)?.click()}>
              <input type="file" id="addFileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
              <p class="text-[13px] text-[#666666]">Drop files or <span class="text-[#4A9FD8] underline">browse</span></p>
            </div>
            <div id="addFileList" class="mt-2 flex flex-col gap-2"></div>
            <button id="addSubmitBtn" disabled
                    class="w-full h-10 mt-3 bg-[#4A9FD8] text-white rounded-[8px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors opacity-50"
                    onclick={() => (window as Window & { submitAddFiles?: () => void }).submitAddFiles?.()}>
              Add to invoice
            </button>
          </div>
        {/if}
      </div>

    </div>
  </div>
</div>
