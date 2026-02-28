<script lang="ts">
	import CustodianSidebar from '$lib/components/custodian/CustodianSidebar.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import { sidebarCollapsed } from '$lib/stores/custodian';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
</script>

<div class="flex min-h-screen bg-white">
	<CustodianSidebar />
	
	<!-- Main Content -->
	<main class="flex-1 bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
			{@render children()}
		</div>
	</main>
</div>

<ToastContainer />
