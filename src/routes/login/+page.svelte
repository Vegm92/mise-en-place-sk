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

			<!-- Divider -->
			<div class="flex items-center gap-3 my-5">
				<div class="flex-1 h-px bg-[#E5E7EB]"></div>
				<span class="text-[11px] text-[#AAAAAA] uppercase tracking-wide">or</span>
				<div class="flex-1 h-px bg-[#E5E7EB]"></div>
			</div>

			<!-- Google OAuth -->
			<a
				href="/api/auth/social/google?callbackURL={encodeURIComponent(data.redirectTo)}"
				class="flex items-center justify-center gap-[10px] h-10 w-full rounded-[8px]
				       border border-[#E5E7EB] bg-white text-[#374151] text-[13px] font-medium
				       hover:bg-[#F9FAFB] transition-colors no-underline"
			>
				<!-- Google "G" logo -->
				<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
					<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
				</svg>
				Continue with Google
			</a>
		</div>

	</div>
</div>
