<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
	
	async function handleLogout() {
		await authStore.logout();
		toastStore.success('You have been logged out successfully.', 'Logged Out');
		goto('/auth/login');
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Navigation Bar -->
	<nav class="border-b border-gray-200 bg-white shadow-sm">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 justify-between">
				<div class="flex items-center">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
						<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
						</svg>
					</div>
					<span class="ml-3 text-xl font-bold text-gray-900">CHTM Cooks</span>
					<span class="ml-3 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
						Instructor Portal
					</span>
				</div>
				
				<div class="flex items-center space-x-4">
					{#if $user}
						<div class="text-right">
							<p class="text-sm font-medium text-gray-900">
								{$user.firstName} {$user.lastName}
							</p>
							<p class="text-xs text-gray-500">
								Instructor
							</p>
						</div>
					{/if}
					
					<button
						onclick={handleLogout}
						class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
					>
						Logout
					</button>
				</div>
			</div>
		</div>
	</nav>
	
	<!-- Main Content -->
	<main>
		{@render children()}
	</main>
</div>
