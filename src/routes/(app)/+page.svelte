<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData, ActionData } from './$types';

  const { data, form }: { data: PageData; form: ActionData } = $props();

  const errorMsg = $derived(form?.error ?? (data.error ? decodeURIComponent(data.error) : null));

  onMount(() => {
    const isMobile = navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent);
    const captureRow  = document.getElementById('captureRow') as HTMLElement;
    const dropArea    = document.getElementById('dropArea') as HTMLElement;
    const fileInput   = document.getElementById('fileInput') as HTMLInputElement;
    const cameraInput = isMobile ? document.getElementById('cameraInput') as HTMLInputElement : null;
    const browseInput = isMobile ? document.getElementById('browseInput') as HTMLInputElement : null;
    const fileList    = document.getElementById('fileList') as HTMLElement;
    const submitBtn   = document.getElementById('submitBtn') as HTMLButtonElement;

    if (isMobile) {
      captureRow.classList.remove('hidden');
      dropArea.classList.add('hidden');
    }

    let files: File[] = [];
    const MAX_FILE_BYTES = 20 * 1024 * 1024;

    function addFiles(newFiles: FileList | null) {
      if (!newFiles) return;
      for (const f of Array.from(newFiles)) {
        if (f.size > MAX_FILE_BYTES) { alert(`'${f.name}' exceeds the 20 MB limit and was not added.`); continue; }
        if (!files.some(e => e.name === f.name && e.size === f.size)) files.push(f);
      }
      render();
    }

    function removeFile(idx: number) { files.splice(idx, 1); render(); }
    function iconFor(name: string) { return name.split('.').pop()?.toLowerCase() === 'pdf' ? '📄' : '🖼️'; }
    function fmtSize(bytes: number) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function render() {
      fileList.innerHTML = files.map((f, i) => `
        <div class="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-3 py-2 text-[13px]">
          <span class="text-base shrink-0">${iconFor(f.name)}</span>
          <span class="flex-1 font-medium overflow-hidden text-ellipsis whitespace-nowrap text-[#1A1A1A]">${f.name}</span>
          <span class="text-[#888888] shrink-0 text-[11px]">${fmtSize(f.size)}</span>
          <button type="button" class="bg-transparent border-none cursor-pointer text-[#888888] text-[13px] px-1 leading-none hover:text-[#E05555]" data-idx="${i}" title="Remove">✕</button>
        </div>
      `).join('');
      fileList.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => removeFile(Number((btn as HTMLElement).dataset.idx)));
      });
      submitBtn.disabled = files.length === 0;
      submitBtn.textContent = files.length === 0 ? 'Upload' : files.length === 1 ? 'Upload 1 file' : `Upload ${files.length} files`;
      submitBtn.style.opacity = files.length === 0 ? '0.5' : '1';
    }

    async function doUpload() {
      if (files.length === 0) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading…';
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      try {
        const resp = await fetch('/?/upload', { method: 'POST', body: formData });
        const result = await resp.json() as { type: string; location?: string; data?: { error?: string } };
        if (result.type === 'redirect' && result.location) {
          location.replace(result.location);
        } else {
          submitBtn.disabled = false;
          render();
          if (result.data?.error) alert(result.data.error);
        }
      } catch (err) {
        submitBtn.disabled = false;
        render();
        alert('Upload failed: ' + (err as Error).message);
      }
    }

    submitBtn.addEventListener('click', doUpload);
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
    if (cameraInput) cameraInput.addEventListener('change', () => { addFiles(cameraInput.files); cameraInput.value = ''; });
    if (browseInput) browseInput.addEventListener('change', () => { addFiles(browseInput.files); browseInput.value = ''; });

    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('border-[#4A9FD8]', 'bg-[#EFF8FF]'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('border-[#4A9FD8]', 'bg-[#EFF8FF]'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('border-[#4A9FD8]', 'bg-[#EFF8FF]');
      addFiles(e.dataTransfer?.files ?? null);
    });
  });
</script>

<div class="flex items-start justify-center pt-4">
  <div class="w-full max-w-[480px] bg-white rounded-[12px] border border-[#E5E7EB]">

    <div class="px-6 pt-6 pb-4 border-b border-[#F3F4F6]">
      <h1 class="text-[16px] font-semibold text-[#1A1A1A]">Upload Invoice</h1>
      <p class="text-[13px] text-[#888888] mt-[2px]">PDF, JPG or PNG — up to 20 MB</p>
    </div>

    <div class="px-6 py-5 flex flex-col gap-4">

      {#if data.saved}
        <div class="bg-[#F0FDF4] border border-[#BBF7D0] text-[#3A8C5C] rounded-[8px] px-4 py-3 text-[13px]">
          Invoice saved successfully.
        </div>
      {/if}
      {#if data.duplicate}
        <div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] px-4 py-3 text-[13px]">
          Duplicate invoice number — already exists for this supplier.
        </div>
      {/if}
      {#if errorMsg}
        <div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] px-4 py-3 text-[13px]">
          {errorMsg}
        </div>
      {/if}

      <!-- Mobile capture row -->
      <div id="captureRow" class="hidden gap-3">
        <label class="flex-1 flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-[10px]
                      border-2 border-dashed border-[#E5E7EB] bg-[#F9FAFB] cursor-pointer
                      text-[#888888] text-[12px] font-semibold transition-colors hover:border-[#4A9FD8] hover:bg-[#EFF8FF] hover:text-[#4A9FD8]">
          <span class="text-xl">📷</span>
          Take Photo
          <input type="file" id="cameraInput" class="hidden" accept="image/*" capture="environment" />
        </label>
        <label class="flex-1 flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-[10px]
                      border-2 border-dashed border-[#E5E7EB] bg-[#F9FAFB] cursor-pointer
                      text-[#888888] text-[12px] font-semibold transition-colors hover:border-[#4A9FD8] hover:bg-[#EFF8FF] hover:text-[#4A9FD8]">
          <span class="text-xl">📁</span>
          Browse Files
          <input type="file" id="browseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
        </label>
      </div>

      <!-- Drop area -->
      <div id="dropArea"
           class="border-2 border-dashed border-[#E5E7EB] rounded-[10px] py-8 px-4 text-center cursor-pointer transition-colors hover:border-[#4A9FD8] hover:bg-[#EFF8FF]"
           onclick={() => (document.getElementById('fileInput') as HTMLInputElement)?.click()}
           role="button"
           tabindex="0"
           onkeydown={(e) => e.key === 'Enter' && (document.getElementById('fileInput') as HTMLInputElement)?.click()}
      >
        <input type="file" id="fileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
        <div class="text-2xl mb-2">📂</div>
        <p class="text-[13px] text-[#666666]">Drop files here or <span class="text-[#4A9FD8] underline">browse</span></p>
        <p class="text-[11px] text-[#888888] mt-1">PDF, JPG, PNG · max 20 MB each</p>
      </div>

      <div id="fileList" class="flex flex-col gap-2"></div>

      <button
        id="submitBtn"
        disabled
        class="w-full h-10 bg-[#4A9FD8] text-white rounded-[8px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors opacity-50"
      >Upload</button>

    </div>
  </div>
</div>
