<script lang="ts">
	import CustodianSidebar from '$lib/components/custodian/CustodianSidebar.svelte';
	import CustodianTopNav from '$lib/components/custodian/CustodianTopNav.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
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
	<main class="min-w-0 flex-1 overflow-x-hidden bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-5 pb-6 sm:px-6 lg:px-8 lg:pt-6">
			{@render children()}
		</div>
	</main>
</div>

<CustodianTopNav />
<ToastContainer />
<ConfirmDialogContainer />
