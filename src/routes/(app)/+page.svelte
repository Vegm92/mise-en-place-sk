<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData, ActionData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';

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
        if (f.size > MAX_FILE_BYTES) {
          alert(`'${f.name}' exceeds the 20 MB limit and was not added.`);
          continue;
        }
        if (!files.some(e => e.name === f.name && e.size === f.size)) files.push(f);
      }
      render();
    }

    function removeFile(idx: number) {
      files.splice(idx, 1);
      render();
    }

    function iconFor(name: string) {
      return name.split('.').pop()?.toLowerCase() === 'pdf' ? '📄' : '🖼️';
    }

    function fmtSize(bytes: number) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function render() {
      fileList.innerHTML = files.map((f, i) => `
        <div class="flex items-center gap-2 bg-secondary rounded-md px-3 py-2 text-sm">
          <span class="text-lg shrink-0">${iconFor(f.name)}</span>
          <span class="flex-1 font-medium overflow-hidden text-ellipsis whitespace-nowrap">${f.name}</span>
          <span class="text-muted-foreground shrink-0 text-xs">${fmtSize(f.size)}</span>
          <button type="button" class="bg-transparent border-none cursor-pointer text-muted-foreground text-base px-1 leading-none hover:text-destructive" data-idx="${i}" title="Remove">✕</button>
        </div>
      `).join('');
      fileList.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => removeFile(Number((btn as HTMLElement).dataset.idx)));
      });
      submitBtn.disabled = files.length === 0;
      submitBtn.textContent = files.length === 0 ? 'Upload' : files.length === 1 ? 'Upload 1 file' : `Upload ${files.length} files`;
    }

    async function doUpload() {
      if (files.length === 0) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading…';
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      try {
        const resp = await fetch('/?/upload', { method: 'POST', body: formData });
        // SvelteKit returns JSON for programmatic fetch calls to action endpoints.
        // { type: 'redirect', location: '/confirm/<id>' } on success
        // { type: 'failure', data: { error: '...' } } on fail()
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

    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('border-primary', 'bg-primary/5'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('border-primary', 'bg-primary/5'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('border-primary', 'bg-primary/5');
      addFiles(e.dataTransfer?.files ?? null);
    });
  });
</script>

<div class="flex items-start justify-center">
  <Card.Root class="w-full max-w-[480px]">
    <Card.Header>
      <Card.Title>Upload Invoice</Card.Title>
      <Card.Description>Mise en Place — Invoice Processing</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">

      {#if data.saved}
        <div class="bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3 text-sm">
          Invoice saved successfully.
        </div>
      {/if}
      {#if data.duplicate}
        <div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-md px-4 py-3 text-sm">
          Duplicate invoice number — already exists for this supplier.
        </div>
      {/if}
      {#if errorMsg}
        <div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-md px-4 py-3 text-sm">
          {errorMsg}
        </div>
      {/if}

      <!-- Mobile capture row (hidden by default, shown via JS) -->
      <div id="captureRow" class="hidden gap-3">
        <label class="flex-1 flex flex-col items-center justify-center gap-1 py-[1.1rem] px-2 rounded-xl
                      border-[1.5px] border-dashed border-border bg-secondary cursor-pointer
                      text-muted-foreground text-sm font-semibold transition-colors
                      hover:border-primary hover:bg-primary/5 hover:text-primary">
          <span class="text-2xl">📷</span>
          Take Photo
          <input type="file" id="cameraInput" class="hidden" accept="image/*" capture="environment" />
        </label>
        <label class="flex-1 flex flex-col items-center justify-center gap-1 py-[1.1rem] px-2 rounded-xl
                      border-[1.5px] border-dashed border-border bg-secondary cursor-pointer
                      text-muted-foreground text-sm font-semibold transition-colors
                      hover:border-primary hover:bg-primary/5 hover:text-primary">
          <span class="text-2xl">📁</span>
          Browse Files
          <input type="file" id="browseInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
        </label>
      </div>

      <!-- Drop area -->
      <div id="dropArea"
           class="border-2 border-dashed border-border rounded-lg py-7 px-4 text-center cursor-pointer
                  transition-colors hover:border-primary hover:bg-primary/5"
           onclick={() => (document.getElementById('fileInput') as HTMLInputElement)?.click()}
           role="button"
           tabindex="0"
           onkeydown={(e) => e.key === 'Enter' && (document.getElementById('fileInput') as HTMLInputElement)?.click()}
      >
        <input type="file" id="fileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
        <p class="text-sm text-muted-foreground">
          Drop files here or <span class="text-primary underline cursor-pointer">browse</span>
        </p>
        <p class="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — select multiple or drag several at once</p>
      </div>

      <div id="fileList" class="flex flex-col gap-1"></div>

      <Button id="submitBtn" disabled class="w-full mt-1">Upload</Button>

    </Card.Content>
  </Card.Root>
</div>
