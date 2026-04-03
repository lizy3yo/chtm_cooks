<script lang="ts">
	import { LogOut, X } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { open, onconfirm, oncancel }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="signout-title"
		aria-describedby="signout-desc"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<!-- Panel -->
		<div class="relative mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200">
			<!-- Close button -->
			<button
				onclick={oncancel}
				class="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
				aria-label="Close"
			>
				<X size={16} />
			</button>

			<!-- Icon -->
			<div class="flex flex-col items-center px-6 pb-6 pt-8 text-center">
				<div class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50">
					<LogOut size={24} class="text-red-500" />
				</div>

				<h2 id="signout-title" class="text-lg font-semibold text-gray-900">Sign out?</h2>
				<p id="signout-desc" class="mt-1.5 text-sm text-gray-500">
					You'll be returned to the login page. Any unsaved changes will be lost.
				</p>

				<!-- Actions -->
				<div class="mt-6 flex w-full gap-3">
					<button
						onclick={oncancel}
						class="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
					>
						Cancel
					</button>
					<button
						onclick={onconfirm}
						class="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
					>
						Sign out
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
