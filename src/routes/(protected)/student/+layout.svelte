<script lang="ts">
	import StudentSidebar from '$lib/components/student/StudentSidebar.svelte';
	import StudentTopNav from '$lib/components/student/StudentTopNav.svelte';
	import StudentBottomNav from '$lib/components/student/StudentBottomNav.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ConfirmDialogContainer from '$lib/components/ui/ConfirmDialogContainer.svelte';
	import { sidebarCollapsed } from '$lib/stores/student';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex min-h-screen overflow-x-hidden bg-white">
	<StudentSidebar />

	<!-- Main Content — offset top for the fixed top nav bar -->
	<main class="min-w-0 flex-1 bg-white transition-all duration-300 {$sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
		<div class="mx-auto max-w-7xl px-4 pt-[30px] pb-6 sm:px-6 lg:px-8">
			{@render children()}
		</div>
	</main>
</div>

<StudentTopNav />
<StudentBottomNav />
<ToastContainer />
<ConfirmDialogContainer />
