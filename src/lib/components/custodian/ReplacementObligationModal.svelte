<script lang="ts">
	import type { ReplacementObligation } from '$lib/api/replacementObligations';
	import { CheckCircle2, AlertTriangle, XCircle, Package, Calendar } from 'lucide-svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';

	interface Props {
		obligations?: ReplacementObligation[];
		obligation?: ReplacementObligation;
		itemPictures?: Map<string, string>;
		onResolve: (id: string, quantityReplaced: number) => Promise<void>;
		onCancel: () => void;
	}

	let { obligations, obligation, itemPictures, onResolve, onCancel }: Props = $props();

	const activeObligations = $derived(obligations || (obligation ? [obligation] : []));
	let currentIndex = $state(0);
	const currentObligation = $derived(activeObligations[currentIndex] || null);

	const itemPic = $derived(
		currentObligation && itemPictures ? itemPictures.get(currentObligation.itemId) || null : null
	);

	let submitting = $state(false);
	let error = $state<string | null>(null);

	function getTypeColor(type: 'missing' | 'damaged'): string {
		return type === 'missing'
			? 'bg-red-100 text-red-800 border-red-300'
			: 'bg-rose-100 text-rose-800 border-rose-300';
	}

	function getTypeIcon(type: 'missing' | 'damaged') {
		return type === 'missing' ? XCircle : AlertTriangle;
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'pending':
				return 'bg-amber-100 text-amber-800 border-amber-300';
			case 'replaced':
				return 'bg-emerald-100 text-emerald-800 border-emerald-300';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-300';
		}
	}

	function getInitials(name?: string): string {
		if (!name) return '??';
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	async function handleSubmit() {
		submitting = true;
		error = null;

		try {
			// Automatically use the exact remaining balance required by the custodian
			await onResolve(currentObligation.id, currentObligation.balance);

			// Auto-advance or close
			if (activeObligations.length > 1 && currentIndex < activeObligations.length - 1) {
				currentIndex++;
				submitting = false;
			} else {
				onCancel();
			}
		} catch (err) {
			console.error('[ReplacementObligationModal] Resolution failed:', err);
			error = err instanceof Error ? err.message : 'Failed to resolve obligation';
			submitting = false;
		}
	}
</script>

<!-- Modal Container -->
<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
		onclick={onCancel}
		aria-label="Close modal"
		tabindex="-1"
	></button>

	<!-- Modal -->
	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			class="animate-scaleIn relative mx-0 w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl"
			role="dialog"
			aria-labelledby="modal-title"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
				<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
					<div class="flex items-start gap-3 sm:gap-4">
						<!-- Icon -->
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-14 sm:w-14 sm:rounded-2xl lg:h-16 lg:w-16"
						>
							<Package class="h-6 w-6 text-white sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
						</div>

						<div class="min-w-0 flex-1">
							<h2 id="modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
								Resolve Obligation
							</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">
								Record the resolution of this accountability obligation
							</p>

							<!-- Status Badge -->
							<div class="mt-2">
								<span
									class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(currentObligation.status)}`}
								>
									{currentObligation.status.charAt(0).toUpperCase() +
										currentObligation.status.slice(1)}
								</span>
							</div>
						</div>

						<button
							type="button"
							onclick={onCancel}
							class="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:rounded-xl sm:p-2"
							aria-label="Close modal"
						>
							<svg
								class="h-5 w-5 sm:h-6 sm:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="max-h-[calc(100vh-240px)] overflow-y-auto sm:max-h-[60vh]">
				<div class="space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
					{#if error}
						<div class="rounded-xl border border-rose-200 bg-rose-50 p-4">
							<div class="flex items-center gap-3">
								<AlertTriangle class="h-5 w-5 shrink-0 text-rose-500" />
								<p class="text-sm font-medium text-rose-800">{error}</p>
							</div>
						</div>
					{/if}

					<!-- Student Information Card -->
					<div
						class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 shadow-sm sm:p-6"
					>
						<div class="mb-4 flex items-center gap-3">
							<div
								class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200 sm:h-16 sm:w-16"
							>
								{#if currentObligation.studentProfilePhotoUrl}
									<img
										src={currentObligation.studentProfilePhotoUrl}
										alt={currentObligation.studentName || 'Student'}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<span class="text-lg"
										>{getInitials(currentObligation.studentName || 'Unknown Student')}</span
									>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<h3 class="truncate text-lg font-bold text-gray-900">
									{currentObligation.studentName || 'Unknown Student'}
								</h3>
								<p class="truncate text-sm text-gray-600">
									{currentObligation.studentEmail || 'N/A'}
								</p>
							</div>
						</div>
					</div>

					<!-- Item Navigation Pills -->
					{#if activeObligations.length > 1}
						<div class="mb-6 flex flex-wrap gap-2">
							{#each activeObligations as obl, index}
								<button
									type="button"
									onclick={() => (currentIndex = index)}
									class="group relative rounded-lg px-3 py-2 text-xs font-medium transition-all {currentIndex ===
									index
										? 'bg-pink-600 text-white shadow-md'
										: obl.status === 'replaced'
											? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
											: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
								>
									<span class="flex items-center gap-1.5">
										{#if obl.status === 'replaced'}
											<CheckCircle2 class="h-3 w-3" />
										{/if}
										Item {index + 1}
									</span>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Obligation Details Card -->
					<div
						class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 shadow-sm sm:p-6"
					>
						<!-- Item Header -->
						<div class="mb-5 flex items-start gap-4">
							{#if itemPic}
								<img
									src={itemPic}
									alt={currentObligation.itemName}
									class="h-16 w-16 shrink-0 rounded-xl border-2 border-pink-200 object-cover shadow-md"
									loading="lazy"
								/>
							{:else}
								<div
									class="flex h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-pink-200 shadow-md"
								>
									<ItemImagePlaceholder size="md" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<h3 class="truncate text-lg font-bold text-gray-900 uppercase">
									{currentObligation.itemName}
								</h3>
								<div class="mt-1.5 flex items-center gap-2">
									<span class="text-sm font-medium text-gray-600">Expected Replacement Qty:</span>
									<span
										class="inline-flex min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-900"
									>
										{currentObligation.amount}
									</span>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									<span
										class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getTypeColor(currentObligation.type)}`}
									>
										{#key currentObligation.type}
											{@const Icon = getTypeIcon(currentObligation.type)}
											<Icon class="h-3 w-3" />
										{/key}
										{currentObligation.type === 'missing' ? 'Missing' : 'Damaged'}
									</span>
								</div>
							</div>
						</div>

						<!-- Obligation Details Table -->
						<div class="mb-5 overflow-hidden rounded-xl border border-gray-200">
							<!-- Desktop Table Header -->
							<div
								class="hidden grid-cols-5 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase sm:grid"
							>
								<span class="text-center">Original Qty</span>
								<span class="text-center text-amber-700">Damaged</span>
								<span class="text-center text-rose-700">Missing</span>
								<span class="text-center">Due Date</span>
								<span class="text-center">Request ID</span>
							</div>

							<!-- Desktop Table Row -->
							<div class="hidden grid-cols-5 items-center bg-white px-4 py-3 sm:grid">
								<div class="text-center">
									<span class="text-sm font-bold text-gray-900 tabular-nums"
										>{currentObligation.quantity}</span
									>
								</div>
								<div class="text-center">
									<span
										class="text-sm font-bold tabular-nums {currentObligation.type === 'damaged'
											? 'text-amber-600'
											: 'text-gray-300'}"
										>{currentObligation.type === 'damaged' ? currentObligation.quantity : '0'}</span
									>
								</div>
								<div class="text-center">
									<span
										class="text-sm font-bold tabular-nums {currentObligation.type === 'missing'
											? 'text-rose-600'
											: 'text-gray-300'}"
										>{currentObligation.type === 'missing' ? currentObligation.quantity : '0'}</span
									>
								</div>
								<div class="flex items-center justify-center gap-1.5">
									<Calendar class="h-4 w-4 text-gray-400" />
									<span class="text-sm font-semibold text-gray-900"
										>{new Date(currentObligation.dueDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}</span
									>
								</div>
								<div class="flex items-center justify-center gap-1.5">
									<Package class="h-4 w-4 text-gray-400" />
									<span class="font-mono text-sm font-semibold text-gray-900"
										>REQ-{currentObligation.borrowRequestId.slice(-6).toUpperCase()}</span
									>
								</div>
							</div>

							<!-- Mobile Layout -->
							<div
								class="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200 bg-white sm:hidden"
							>
								<div class="flex flex-col items-center justify-center p-3">
									<span class="mb-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase"
										>Original Qty</span
									>
									<span class="text-sm font-bold text-gray-900 tabular-nums"
										>{currentObligation.quantity}</span
									>
								</div>
								<div class="flex flex-col items-center justify-center p-3">
									<span
										class="mb-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase"
										>Damaged</span
									>
									<span
										class="text-sm font-bold tabular-nums {currentObligation.type === 'damaged'
											? 'text-amber-600'
											: 'text-gray-300'}"
										>{currentObligation.type === 'damaged' ? currentObligation.quantity : '0'}</span
									>
								</div>
								<div class="flex flex-col items-center justify-center p-3">
									<span class="mb-1 text-[10px] font-semibold tracking-wide text-rose-700 uppercase"
										>Missing</span
									>
									<span
										class="text-sm font-bold tabular-nums {currentObligation.type === 'missing'
											? 'text-rose-600'
											: 'text-gray-300'}"
										>{currentObligation.type === 'missing' ? currentObligation.quantity : '0'}</span
									>
								</div>
							</div>
							<div class="grid grid-cols-2 divide-x divide-gray-200 bg-white sm:hidden">
								<div class="flex flex-col items-center justify-center p-3">
									<span
										class="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase"
									>
										<Calendar class="h-3 w-3" /> Due Date
									</span>
									<span class="text-sm font-semibold text-gray-900"
										>{new Date(currentObligation.dueDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}</span
									>
								</div>
								<div class="flex flex-col items-center justify-center p-3">
									<span
										class="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase"
									>
										<Package class="h-3 w-3" /> Request ID
									</span>
									<span class="font-mono text-sm font-semibold text-gray-900"
										>REQ-{currentObligation.borrowRequestId.slice(-6).toUpperCase()}</span
									>
								</div>
							</div>
						</div>

						{#if currentObligation.amountPaid > 0}
							<div class="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-emerald-800">Previously Replaced</span>
									<span class="text-base font-bold text-emerald-900 tabular-nums"
										>{currentObligation.amountPaid} items</span
									>
								</div>
							</div>
						{/if}

						{#if currentObligation.incidentNotes}
							<div class="mt-4 border-t border-gray-200 pt-4">
								<p class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
									Incident Notes
								</p>
								<p class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
									{currentObligation.incidentNotes}
								</p>
							</div>
						{/if}
					</div>

					<!-- Note: Quantity is automatically resolved using the exact remaining balance required by the custodian -->
				</div>
			</div>

			<!-- Footer -->
			<div
				class="sticky bottom-0 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 lg:px-8"
			>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<!-- Cancel Button -->
					<button
						type="button"
						onclick={onCancel}
						disabled={submitting}
						class="order-2 rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:order-1"
					>
						Cancel
					</button>

					{#if activeObligations.length > 1}
						<span class="order-3 self-center text-sm font-semibold text-gray-500 sm:order-2">
							Item {currentIndex + 1} of {activeObligations.length}
						</span>
					{/if}

					<!-- Navigation/Submit Buttons -->
					<div class="order-1 flex w-full gap-2 sm:order-3 sm:w-auto">
						{#if currentIndex > 0}
							<button
								type="button"
								onclick={() => currentIndex--}
								disabled={submitting}
								class="flex-1 rounded-lg border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 sm:flex-none"
							>
								&larr; Prev
							</button>
						{/if}

						{#if currentObligation.status === 'pending'}
							<button
								type="button"
								onclick={handleSubmit}
								disabled={submitting}
								class="flex-1 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:flex-none"
							>
								{#if submitting}
									<span class="flex items-center justify-center gap-2">
										<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
										Processing...
									</span>
								{:else}
									{activeObligations.length > 1 && currentIndex < activeObligations.length - 1
										? 'Resolve & Next'
										: 'Resolve Obligation'}
								{/if}
							</button>
						{:else if currentIndex < activeObligations.length - 1}
							<button
								type="button"
								onclick={() => currentIndex++}
								disabled={submitting}
								class="flex-1 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] sm:flex-none"
							>
								Next &rarr;
							</button>
						{:else}
							<button
								type="button"
								onclick={onCancel}
								class="flex-1 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] sm:flex-none"
							>
								Finish
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes scaleIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-scaleIn {
		animation: scaleIn 0.2s ease-out;
	}
</style>
