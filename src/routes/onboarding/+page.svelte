<script lang="ts">
	import type { ActionData } from './$types';
	const { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Configura tu restaurante · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:400px;">

		<!-- Logo -->
		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);flex-shrink:0;">
				<rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
			</svg>
			<span style="font-size:16px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
				Mise en Place
			</span>
		</div>

		<!-- Card -->
		<div class="card" style="padding:28px;">
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">Bienvenido</h1>
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 24px;">
				Para empezar, dinos cómo se llama tu restaurante.
			</p>

			{#if form?.error}
				<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
				            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
					{form.error}
				</div>
			{/if}

			<form method="POST" style="display:flex;flex-direction:column;gap:16px;">
				<div style="display:flex;flex-direction:column;gap:6px;">
					<label for="name" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">
						Nombre del restaurante
					</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						maxlength="80"
						autocomplete="organization"
						placeholder="Ej. Casa Lua"
						class="input"
						style="height:36px;"
					/>
				</div>

				<button type="submit" class="btn btn-primary" style="height:38px;justify-content:center;margin-top:4px;">
					Crear restaurante
				</button>
			</form>
		</div>

	</div>
</div>
