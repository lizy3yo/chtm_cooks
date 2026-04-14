<script lang="ts">
	import SuperadminSidebar from '$lib/components/superadmin/SuperadminSidebar.svelte';
	import SuperadminTopNav from '$lib/components/superadmin/SuperadminTopNav.svelte';
	import SuperadminBottomNav from '$lib/components/superadmin/SuperadminBottomNav.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import { sidebarCollapsed } from '$lib/stores/superadmin';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
</script>

<div class="flex min-h-screen bg-white">
	<SuperadminSidebar />
	
	<!-- Main Content -->
	<main class="min-w-0 flex-1 overflow-x-hidden bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-5 pb-6 sm:px-6 lg:px-8 lg:pt-6">
			{@render children()}
		</div>
	</main>
</div>

<SuperadminTopNav />
<SuperadminBottomNav />
<ToastContainer />
<ConfirmDialogContainer />
