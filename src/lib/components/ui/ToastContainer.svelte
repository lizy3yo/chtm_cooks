<script lang="ts">
	import { toastStore } from '$lib/stores/toast';
	import Toast from './Toast.svelte';
</script>

<!-- Toast Container - Fixed position at top-right -->
<div
	aria-live="assertive"
	class="pointer-events-none fixed inset-0 z-[9999] flex items-start justify-end px-4 py-6 sm:items-start sm:p-6"
	style="position: fixed !important;"
>
	<div class="flex w-full flex-col items-end space-y-4">
		{#each $toastStore.toasts as toast (toast.id)}
			<Toast {toast} onDismiss={toastStore.dismiss} />
		{/each}
	</div>
</div>
