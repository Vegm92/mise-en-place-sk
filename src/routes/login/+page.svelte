<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';

	const { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in · Mise en Place</title>
</svelte:head>

<div class="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
	<div class="w-full max-w-[400px]">

		<!-- Logo -->
		<div class="flex items-center gap-3 justify-center mb-8">
			<div class="w-8 h-8 rounded-[8px] bg-[#4A9FD8] flex items-center justify-center">
				<span class="text-white text-[13px] font-bold">M</span>
			</div>
			<span class="text-[#1A1A1A] text-[18px] font-semibold">Mise en Place</span>
		</div>

		<!-- Card -->
		<div class="bg-white rounded-[12px] border border-[#E5E7EB] p-8 shadow-sm">
			<h1 class="text-[18px] font-semibold text-[#1A1A1A] mb-1">Welcome back</h1>
			<p class="text-[13px] text-[#888888] mb-6">Sign in to continue</p>

			{#if form?.error}
				<div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] px-4 py-3 text-[13px] mb-4">
					{form.error}
				</div>
			{/if}

			<form method="POST" use:enhance class="flex flex-col gap-4">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />

				<div class="flex flex-col gap-1.5">
					<label for="email" class="text-[13px] font-medium text-[#374151]">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						autocomplete="email"
						value={form?.email ?? ''}
						placeholder="you@example.com"
						class="h-10 rounded-[8px] border border-[#E5E7EB] px-3 text-[13px]
						       focus:outline-none focus:ring-2 focus:ring-[#4A9FD8]/30 focus:border-[#4A9FD8]
						       transition-colors bg-white"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="password" class="text-[13px] font-medium text-[#374151]">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						autocomplete="current-password"
						class="h-10 rounded-[8px] border border-[#E5E7EB] px-3 text-[13px]
						       focus:outline-none focus:ring-2 focus:ring-[#4A9FD8]/30 focus:border-[#4A9FD8]
						       transition-colors bg-white"
					/>
				</div>

				<button
					type="submit"
					class="mt-2 h-10 w-full rounded-[8px] bg-[#2271B1] text-white text-[13px]
					       font-semibold hover:bg-[#1A5E90] transition-colors border-none cursor-pointer"
				>
					Sign in
				</button>
			</form>
		</div>

	</div>
</div>
