<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, isAuthenticated, isLoading } from '$lib/stores/auth';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
	
	// Simple redirect to login if not authenticated
	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(`/auth/login?redirect=${encodeURIComponent($page.url.pathname)}`);
		}
	});
</script>

{#if $isLoading}
	<div class="flex min-h-screen items-center justify-center bg-white">
		<div class="text-center">
			<svg 
				class="mx-auto h-12 w-12 animate-spin text-blue-600" 
				xmlns="http://www.w3.org/2000/svg" 
				fill="none" 
				viewBox="0 0 24 24"
			>
				<circle 
					class="opacity-25" 
					cx="12" 
					cy="12" 
					r="10" 
					stroke="currentColor" 
					stroke-width="4"
				></circle>
				<path 
					class="opacity-75" 
					fill="currentColor" 
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<p class="mt-4 text-sm text-gray-600">Loading...</p>
		</div>
	</div>
{:else if $isAuthenticated}
	{@render children()}
{/if}

<!-- Toast Container - Always rendered for protected routes -->
<ToastContainer />
