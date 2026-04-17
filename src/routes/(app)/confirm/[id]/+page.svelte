<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';

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
        <div class="flex items-center gap-2 text-sm bg-secondary rounded px-2 py-1">
          <span>${f.name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
          <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">${f.name}</span>
          <button type="button" class="bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive" data-idx="${i}">✕</button>
        </div>`).join('');
      addFileList.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => { addFiles.splice(Number((btn as HTMLElement).dataset.idx), 1); renderAdd(); });
      });
      addSubmitBtn.disabled = addFiles.length === 0;
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
      addDropArea.addEventListener('dragover', e => { e.preventDefault(); addDropArea.classList.add('border-primary'); });
      addDropArea.addEventListener('dragleave', () => addDropArea.classList.remove('border-primary'));
      addDropArea.addEventListener('drop', e => { e.preventDefault(); addDropArea.classList.remove('border-primary'); pushFiles((e as DragEvent).dataTransfer?.files ?? null); });
    }
  });
</script>

<!-- Overlay -->
<div id="overlay" class="hidden fixed inset-0 bg-white/85 z-10 flex-col items-center justify-center gap-4">
  <div class="w-9 h-9 border-[3px] border-border border-t-primary rounded-full animate-spin"></div>
  <p class="text-[.9375rem] text-secondary-foreground">Extracting invoice data…</p>
</div>

<div class="flex items-start justify-center">
  <Card.Root class="w-full max-w-[500px]">
    <Card.Header>
      <Card.Title>Review Files</Card.Title>
      <Card.Description>{data.files.length} file{data.files.length !== 1 ? 's' : ''} uploaded.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">

      <div class="flex flex-col gap-[.4rem]">
        {#each data.files as file}
          <div class="grid grid-cols-[auto_1fr_auto] items-center gap-[.6rem] bg-secondary rounded-lg px-3 py-[.55rem] text-[.82rem]">
            <span class="text-lg">{file.type === 'PDF' ? '📄' : '🖼️'}</span>
            <div class="min-w-0">
              <p class="font-medium overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</p>
              <p class="text-[.7rem] text-muted-foreground mt-[.1rem]">{file.type} · {file.size}</p>
            </div>
            <form method="POST" action="?/remove">
              <input type="hidden" name="filename" value={file.name} />
              <button type="submit" class="bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive text-base p-0 leading-none">✕</button>
            </form>
          </div>
        {/each}
      </div>

      <div class="flex gap-[.65rem]">
        <form method="POST" action="?/extract" class="flex-1"
              onsubmit={() => { const o = document.getElementById('overlay'); if(o) { o.classList.remove('hidden'); o.classList.add('flex'); } }}>
          <Button type="submit" class="w-full">
            {data.files.length === 1 ? 'Extract Invoice' : `Extract ${data.files.length} invoices`}
          </Button>
        </form>
        <form method="POST" action="?/discard" class="flex-1">
          <Button type="submit" variant="outline" class="w-full">Discard All</Button>
        </form>
      </div>

      <div>
        <button type="button"
                class="text-[.82rem] font-semibold text-primary bg-transparent border-none cursor-pointer p-0 font-[inherit] hover:underline"
                onclick={() => addMoreOpen = !addMoreOpen}>
          {addMoreOpen ? '− Add more files' : '+ Add more files'}
        </button>

        {#if addMoreOpen}
          <div class="mt-[.65rem] bg-secondary rounded-lg p-[.85rem]">
            <div id="addCaptureRow" class="hidden gap-[.6rem] mb-[.65rem]">
              <label class="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg border-[1.5px] border-dashed border-border bg-card cursor-pointer text-muted-foreground text-[.75rem] font-semibold hover:border-primary">
                <span class="text-xl">📷</span> Take Photo
                <input type="file" id="addCameraInput" class="hidden" accept="image/*" capture="environment" />
              </label>
              <label class="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg border-[1.5px] border-dashed border-border bg-card cursor-pointer text-muted-foreground text-[.75rem] font-semibold hover:border-primary">
                <span class="text-xl">📁</span> Browse
                <input type="file" id="addBrowseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
              </label>
            </div>
            <div id="addDropArea"
                 class="border-[1.5px] border-dashed border-border rounded-lg py-3 px-4 text-center cursor-pointer hover:border-primary"
                 onclick={() => (document.getElementById('addFileInput') as HTMLInputElement)?.click()}
                 role="button" tabindex="0"
                 onkeydown={(e) => e.key === 'Enter' && (document.getElementById('addFileInput') as HTMLInputElement)?.click()}>
              <input type="file" id="addFileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
              <p class="text-[.8rem] text-muted-foreground">Drop files or <span class="text-primary underline">browse</span></p>
            </div>
            <div id="addFileList" class="mt-2 flex flex-col gap-1"></div>
            <Button id="addSubmitBtn" disabled class="w-full mt-[.65rem]"
                    onclick={() => (window as Window & { submitAddFiles?: () => void }).submitAddFiles?.()}>
              Add to invoice
            </Button>
          </div>
        {/if}
      </div>

    </Card.Content>
  </Card.Root>
</div>
