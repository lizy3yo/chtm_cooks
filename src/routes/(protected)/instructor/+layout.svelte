<script lang="ts">
	import InstructorSidebar from '$lib/components/instructor/InstructorSidebar.svelte';
	import InstructorTopNav from '$lib/components/instructor/InstructorTopNav.svelte';
	import InstructorBottomNav from '$lib/components/instructor/InstructorBottomNav.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import { sidebarCollapsed } from '$lib/stores/instructor';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
</script>

<div class="flex min-h-screen overflow-x-hidden bg-white">
	<InstructorSidebar />

	<!-- Main Content -->
	<main class="min-w-0 flex-1 bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-7.5 pb-24 sm:px-6 lg:pb-6 lg:px-8">
			{@render children()}
		</div>
	</main>
</div>

<InstructorTopNav />
<InstructorBottomNav />
<ToastContainer />
<ConfirmDialogContainer />
