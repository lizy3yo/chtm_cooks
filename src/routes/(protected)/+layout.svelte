<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, isAuthenticated, isLoading } from '$lib/stores/auth';
	import { loadingStore } from '$lib/stores/loading';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
	
	// Show loading bar during auth check
	$effect(() => {
		if ($isLoading) {
			loadingStore.start();
		} else {
			loadingStore.stop();
		}
	});
	
	// Simple redirect to login if not authenticated
	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(`/auth/login?redirect=${encodeURIComponent($page.url.pathname)}`);
		}
	});
</script>

{#if $isAuthenticated}
	{@render children()}
{/if}

<!-- Toast Container - Always rendered for protected routes -->
<ToastContainer />

<!-- Confirmation Dialog Container - Always rendered for protected routes -->
<ConfirmDialogContainer />
