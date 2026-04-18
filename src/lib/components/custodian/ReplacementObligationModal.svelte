<script lang="ts">
	import type { ReplacementObligation } from '$lib/api/replacementObligations';
	import { CheckCircle2, AlertTriangle, XCircle, Package, Calendar } from 'lucide-svelte';

	interface Props {
		obligation: ReplacementObligation;
		onResolve: (id: string, quantityReplaced: number) => Promise<void>;
		onCancel: () => void;
	}

	let { obligation, onResolve, onCancel }: Props = $props();

	let quantityReplaced = $state(0);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Initialize quantityReplaced when obligation changes
	$effect(() => {
		quantityReplaced = obligation.balance;
	});

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
		// Validation
		if (!Number.isInteger(quantityReplaced) || quantityReplaced <= 0) {
			error = 'Please enter a valid quantity (must be a positive whole number)';
			return;
		}

		if (quantityReplaced > obligation.balance) {
			error = `Quantity cannot exceed the remaining balance of ${obligation.balance}`;
			return;
		}

		submitting = true;
		error = null;

		try {
			await onResolve(obligation.id, quantityReplaced);
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
			class="relative w-full max-w-2xl sm:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden mx-0 sm:mx-auto"
			role="dialog"
			aria-labelledby="modal-title"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
				<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
					<div class="flex items-start gap-3 sm:gap-4">
						<!-- Icon -->
						<div class="flex h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
							<Package class="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-white" />
						</div>
						
						<div class="min-w-0 flex-1">
							<h2 id="modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">Resolve Obligation</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">Record the resolution of this accountability obligation</p>
							
							<!-- Status Badge -->
							<div class="mt-2">
								<span class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(obligation.status)}`}>
									{obligation.status.charAt(0).toUpperCase() + obligation.status.slice(1)}
								</span>
							</div>
						</div>

						<button
							type="button"
							onclick={onCancel}
							class="rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 shrink-0"
							aria-label="Close modal"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="max-h-[calc(100vh-240px)] sm:max-h-[60vh] overflow-y-auto">
				<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 space-y-6">
					{#if error}
						<div class="rounded-xl border border-rose-200 bg-rose-50 p-4">
							<div class="flex items-center gap-3">
								<AlertTriangle class="h-5 w-5 text-rose-500 shrink-0" />
								<p class="text-sm font-medium text-rose-800">{error}</p>
							</div>
						</div>
					{/if}

					<!-- Student Information Card -->
					<div class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 sm:p-6 shadow-sm">
						<div class="mb-4 flex items-center gap-3">
							<div class="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200">
								{#if obligation.studentProfilePhotoUrl}
									<img
										src={obligation.studentProfilePhotoUrl}
										alt={obligation.studentName || 'Student'}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<span class="text-lg">{getInitials(obligation.studentName || 'Unknown Student')}</span>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<h3 class="text-lg font-bold text-gray-900 truncate">{obligation.studentName || 'Unknown Student'}</h3>
								<p class="text-sm text-gray-600 truncate">{obligation.studentEmail || 'N/A'}</p>
							</div>
						</div>
					</div>

					<!-- Obligation Details Card -->
					<div class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 sm:p-6 shadow-sm">
						<!-- Item Header -->
						<div class="mb-5 flex items-start gap-4">
							<div class="flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-pink-50 to-pink-100 border-2 border-pink-200 shadow-md">
								<Package class="h-8 w-8 text-pink-400" aria-label="Item icon" />
							</div>
							<div class="flex-1 min-w-0">
								<h3 class="text-lg font-bold text-gray-900 truncate">{obligation.itemName}</h3>
								<div class="mt-2 flex flex-wrap gap-2">
									<span class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getTypeColor(obligation.type)}`}>
										{#key obligation.type}
											{@const Icon = getTypeIcon(obligation.type)}
											<Icon class="h-3 w-3" />
										{/key}
										{obligation.type === 'missing' ? 'Missing' : 'Damaged'}
									</span>
								</div>
							</div>
						</div>

						<!-- Replacement Metrics -->
						<div class="mb-5 grid grid-cols-2 gap-4 rounded-xl bg-white p-4 border border-gray-200">
							<div class="text-center">
								<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Original Qty</p>
								<p class="text-xl font-bold text-gray-900 tabular-nums">{obligation.quantity}</p>
							</div>
							<div class="text-center border-l border-gray-200">
								<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Required</p>
								<p class="text-xl font-bold text-gray-900 tabular-nums">{obligation.amount}</p>
							</div>
						</div>

						{#if obligation.amountPaid > 0}
							<div class="mb-5 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-emerald-800">Previously Replaced</span>
									<span class="text-base font-bold text-emerald-900 tabular-nums">{obligation.amountPaid} {obligation.amountPaid === 1 ? 'item' : 'items'}</span>
								</div>
							</div>
						{/if}

						<!-- Obligation Info Grid -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
							<div>
								<div class="flex items-center gap-2 mb-1">
									<Calendar class="h-4 w-4 text-gray-400" />
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</p>
								</div>
								<p class="text-sm font-semibold text-gray-900">{new Date(obligation.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
							</div>
							<div>
								<div class="flex items-center gap-2 mb-1">
									<Package class="h-4 w-4 text-gray-400" />
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Request ID</p>
								</div>
								<p class="text-sm font-mono font-semibold text-gray-900">REQ-{obligation.borrowRequestId.slice(-6).toUpperCase()}</p>
							</div>
						</div>

						{#if obligation.incidentNotes}
							<div class="mt-4 pt-4 border-t border-gray-200">
								<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Incident Notes</p>
								<p class="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{obligation.incidentNotes}</p>
							</div>
						{/if}
					</div>

					<!-- Quantity Being Replaced -->
					<div>
						<label for="quantity-replaced" class="mb-2 block text-sm font-bold text-gray-900">
							Quantity Being Replaced <span class="text-pink-500">*</span>
						</label>
						<div class="relative">
							<input
								id="quantity-replaced"
								type="number"
								min="1"
								max={obligation.balance}
								step="1"
								bind:value={quantityReplaced}
								class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-base font-semibold shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 pr-24"
								placeholder="Enter quantity"
								required
							/>
							<div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
								<span class="text-sm text-gray-500">of {obligation.balance}</span>
							</div>
						</div>
						<p class="mt-2 text-xs text-gray-500">
							Enter the number of items the student is replacing in this transaction. Maximum: {obligation.balance}
						</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<!-- Cancel Button -->
					<button
						type="button"
						onclick={onCancel}
						disabled={submitting}
						class="order-2 sm:order-1 rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
					>
						Cancel
					</button>

					<!-- Submit Button -->
					<button
						type="button"
						onclick={handleSubmit}
						disabled={!Number.isInteger(quantityReplaced) || quantityReplaced <= 0 || quantityReplaced > obligation.balance || submitting}
						class="order-1 sm:order-2 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
					>
						{#if submitting}
							<span class="flex items-center justify-center gap-2">
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Processing...
							</span>
						{:else}
							Resolve Obligation
						{/if}
					</button>
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
