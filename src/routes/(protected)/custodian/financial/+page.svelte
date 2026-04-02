<script lang="ts">
	import { onMount } from 'svelte';
	import { financialObligationsAPI, type FinancialObligation } from '$lib/api/financialObligations';
	import { donationsAPI, type DonationResponse, type CreateDonationRequest, type CreateDonationNewItemRequest, type CreateDonationAddToExistingRequest, type AddDonationQuantityRequest } from '$lib/api/donations';
	import { inventoryItemsAPI, inventoryCategoriesAPI, type InventoryItem, type InventoryCategory } from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { Package, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-svelte';

	let activeTab = $state<'donations' | 'replacements' | 'history'>('replacements');
	let replacementsFilter = $state<'all' | 'pending' | 'paid' | 'replaced' | 'waived'>('all');
	let historyFilter = $state<'all' | 'resolved' | 'waived'>('all');
	let replacementsView = $state<'by-request' | 'by-item'>('by-item');
	let obligations = $state<FinancialObligation[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedObligation = $state<FinancialObligation | null>(null);
	let selectedSummary = $state<{ borrowRequestId: string; requestCode: string; studentName: string; studentEmail: string; studentProfilePhotoUrl: string | null; items: number; missingCount: number; damagedCount: number; amount: number; amountPaid: number; balance: number; latestDueDate: string; statuses: Set<string> } | null>(null);
	let selectedSummaryItemIndex = $state(0);

	const selectedSummaryItems = $derived(
		selectedSummary
			? obligations.filter(o => o.borrowRequestId === selectedSummary!.borrowRequestId)
			: []
	);
	const selectedSummaryItem = $derived(selectedSummaryItems[selectedSummaryItemIndex] ?? null);

	// Donations real data
	let donations = $state<DonationResponse[]>([]);
	let donationsLoading = $state(false);
	let donationsSearch = $state('');
	let showDonationModal = $state(false);

	// Donation modal — step & mode
	type DonationMode = 'new_item' | 'add_to_existing';
	let donationMode = $state<DonationMode>('new_item');

	// Inventory data for the modal
	let inventoryItems = $state<InventoryItem[]>([]);
	let inventoryCategories = $state<InventoryCategory[]>([]);
	let inventoryLoading = $state(false);
	let inventorySearch = $state('');

	// "New Item" form
	let newItemForm = $state({
		donorName: '',
		itemName: '',
		category: '',
		categoryId: '',
		specification: '',
		toolsOrEquipment: '',
		condition: 'Good',
		location: '',
		quantity: 1,
		unit: '',
		purpose: '',
		date: new Date().toISOString().split('T')[0],
		notes: ''
	});

	// "Add to Existing" form
	let addToExistingForm = $state({
		donorName: '',
		inventoryItemId: '',
		quantity: 1,
		purpose: '',
		date: new Date().toISOString().split('T')[0],
		notes: ''
	});

	const selectedInventoryItem = $derived(
		inventoryItems.find((i) => i.id === addToExistingForm.inventoryItemId) ?? null
	);

	const filteredInventoryItems = $derived(
		inventorySearch.trim()
			? inventoryItems.filter(
					(i) =>
						i.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
						i.category.toLowerCase().includes(inventorySearch.toLowerCase())
				)
			: inventoryItems
	);

	// 'add-quantity' modal state
	let showAddQuantityModal = $state(false);
	let selectedDonationForQty = $state<DonationResponse | null>(null);
	let addQtyValue = $state(1);
	let addQtyNotes = $state('');
	let addQtySubmitting = $state(false);

	// Payment history (derived from resolved obligations)
	const paymentHistory = $derived(
		obligations
			.filter((o) => o.status !== 'pending')
			.map((o) => ({
				id: o.id,
				name: o.studentName || 'Unknown Student',
				type: 'replacement' as const,
				amount: o.amountPaid,
				date: o.resolutionDate || o.updatedAt,
				status: o.status === 'waived' ? 'waived' : 'resolved',
				obligationStatus: o.status,
				resolutionType: o.resolutionType,
				paymentMethod: o.resolutionType === 'replacement' ? 'Item Replacement' : o.resolutionType === 'waiver' ? 'Waived' : 'Cash',
				receiptNumber: o.paymentReference || `REP-${o.id.slice(-6).toUpperCase()}`
			}))
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
	);

	const filteredPaymentHistory = $derived(
		historyFilter === 'all'
			? paymentHistory
			: paymentHistory.filter((p) => p.status === historyFilter)
	);

	const historyCounts = $derived({
		all: paymentHistory.length,
		resolved: paymentHistory.filter((p) => p.status === 'resolved').length,
		waived: paymentHistory.filter((p) => p.status === 'waived').length
	});

	let donationSubmitting = $state(false);

	// Stats
	const totalDonatedItems = $derived(
		donations.reduce((sum, d) => sum + d.quantity, 0)
	);
	const uniqueItemTypes = $derived(
		new Set(donations.map((d) => d.itemName.toLowerCase())).size
	);
	const recentDonationsCount = $derived(
		donations.filter((d) => {
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			return new Date(d.createdAt) >= sevenDaysAgo;
		}).length
	);
	const outstandingObligations = $derived(obligationCounts.pending);

	const obligationCounts = $derived({
		all: obligations.length,
		pending: obligations.filter((o) => o.status === 'pending').length,
		paid: obligations.filter((o) => o.status === 'paid').length,
		replaced: obligations.filter((o) => o.status === 'replaced').length,
		waived: obligations.filter((o) => o.status === 'waived').length
	});

	const filteredObligations = $derived(
		replacementsFilter === 'all' ? obligations : obligations.filter((o) => o.status === replacementsFilter)
	);

	const requestSummaries = $derived.by(() => {
		const grouped = new Map<
			string,
			{
				borrowRequestId: string;
				requestCode: string;
				studentName: string;
				studentEmail: string;
				studentProfilePhotoUrl: string | null;
				items: number;
				missingCount: number;
				damagedCount: number;
				amount: number;
				amountPaid: number;
				balance: number;
				latestDueDate: string;
				statuses: Set<string>;
			}
		>();

		for (const obligation of filteredObligations) {
			const existing = grouped.get(obligation.borrowRequestId);
			const dueDate = obligation.dueDate;

			if (existing) {
				existing.items += 1;
				existing.missingCount += obligation.type === 'missing' ? 1 : 0;
				existing.damagedCount += obligation.type === 'damaged' ? 1 : 0;
				existing.amount += obligation.amount;
				existing.amountPaid += obligation.amountPaid;
				existing.balance += obligation.balance;
				existing.statuses.add(obligation.status);
				if (new Date(dueDate).getTime() > new Date(existing.latestDueDate).getTime()) {
					existing.latestDueDate = dueDate;
				}
				continue;
			}

			grouped.set(obligation.borrowRequestId, {
				borrowRequestId: obligation.borrowRequestId,
				requestCode: `REQ-${obligation.borrowRequestId.slice(-6).toUpperCase()}`,
				studentName: obligation.studentName || 'Unknown Student',
				studentEmail: obligation.studentEmail || 'N/A',
				studentProfilePhotoUrl: obligation.studentProfilePhotoUrl || null,
				items: 1,
				missingCount: obligation.type === 'missing' ? 1 : 0,
				damagedCount: obligation.type === 'damaged' ? 1 : 0,
				amount: obligation.amount,
				amountPaid: obligation.amountPaid,
				balance: obligation.balance,
				latestDueDate: dueDate,
				statuses: new Set([obligation.status])
			});
		}

		return [...grouped.values()].sort(
			(a, b) => new Date(a.latestDueDate).getTime() - new Date(b.latestDueDate).getTime()
		);
	});
	const resolvedCount = $derived(
		obligations.filter((o) => o.status !== 'pending').length
	);
	const recentActivityCount = $derived(
		paymentHistory.filter(p => {
			const paymentDate = new Date(p.date);
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			return paymentDate >= sevenDaysAgo;
		}).length
	);

	let unsubscribeDonations: (() => void) | null = null;
	let unsubscribeFinancial: (() => void) | null = null;

	onMount(async () => {
		await financialObligationsAPI.reconcile();
		await Promise.all([loadObligations(), loadDonations()]);

		unsubscribeFinancial = financialObligationsAPI.subscribeToChanges(async () => {
			await loadObligations();
		});

		unsubscribeDonations = donationsAPI.subscribeToChanges(async () => {
			await loadDonations();
		});

		return () => {
			unsubscribeFinancial?.();
			unsubscribeDonations?.();
		};
	});

	async function loadObligations(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			const response = await financialObligationsAPI.getObligations({ limit: 500 });
			obligations = response.obligations;
		} catch (err) {
			console.error('Failed to load obligations', err);
			error = err instanceof Error ? err.message : 'Failed to load obligations';
		} finally {
			isLoading = false;
		}
	}

	async function loadDonations(): Promise<void> {
		donationsLoading = true;
		try {
			const response = await donationsAPI.getAll({ search: donationsSearch || undefined, limit: 200 });
			donations = response.donations;
		} catch (err) {
			console.error('Failed to load donations', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to load donations', 'Error');
		} finally {
			donationsLoading = false;
		}
	}

	async function handleResolveObligation(
		id: string,
		resolutionType: 'replacement' | 'waiver'
	): Promise<void> {
		try {
			await financialObligationsAPI.resolveObligation(id, {
				resolutionType,
				resolutionNotes: `Resolved via ${resolutionType}`
			});
			await loadObligations();
			toastStore.success('Obligation resolved successfully', 'Success');
		} catch (err) {
			console.error('Failed to resolve obligation', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to resolve obligation', 'Error');
		}
	}

	async function openDonationModal(): Promise<void> {
		showDonationModal = true;
		donationMode = 'new_item';
		inventorySearch = '';
		if (inventoryItems.length === 0 || inventoryCategories.length === 0) {
			inventoryLoading = true;
			try {
				const [itemsRes, catsRes] = await Promise.all([
					inventoryItemsAPI.getAll({ limit: 500 }),
					inventoryCategoriesAPI.getAll()
				]);
				inventoryItems = itemsRes.items;
				inventoryCategories = catsRes.categories;
			} catch (err) {
				toastStore.error('Failed to load inventory data', 'Error');
			} finally {
				inventoryLoading = false;
			}
		}
	}

	async function handleAddDonation(): Promise<void> {
		if (donationMode === 'new_item') {
			if (!newItemForm.donorName.trim()) { toastStore.warning('Donor name is required', 'Validation'); return; }
			if (!newItemForm.itemName.trim()) { toastStore.warning('Item name is required', 'Validation'); return; }
			if (!newItemForm.category.trim()) { toastStore.warning('Category is required', 'Validation'); return; }
			if (!Number.isInteger(newItemForm.quantity) || newItemForm.quantity < 1) { toastStore.warning('Quantity must be a positive whole number', 'Validation'); return; }
			if (!newItemForm.purpose.trim()) { toastStore.warning('Purpose is required', 'Validation'); return; }

			donationSubmitting = true;
			try {
				const payload: CreateDonationNewItemRequest = {
					inventoryAction: 'new_item',
					donorName: newItemForm.donorName.trim(),
					itemName: newItemForm.itemName.trim(),
					category: newItemForm.category.trim(),
					categoryId: newItemForm.categoryId || undefined,
					specification: newItemForm.specification.trim() || undefined,
					toolsOrEquipment: newItemForm.toolsOrEquipment.trim() || undefined,
					condition: newItemForm.condition,
					location: newItemForm.location.trim() || undefined,
					quantity: newItemForm.quantity,
					unit: newItemForm.unit.trim() || undefined,
					purpose: newItemForm.purpose.trim(),
					date: newItemForm.date,
					notes: newItemForm.notes.trim() || undefined
				};
				await donationsAPI.create(payload);
				// Refresh inventory cache
				inventoryItems = [];
				await loadDonations();
				resetDonationForms();
				toastStore.success('Donation recorded and added to inventory', 'Success');
				showDonationModal = false;
			} catch (err) {
				toastStore.error(err instanceof Error ? err.message : 'Failed to record donation', 'Error');
			} finally {
				donationSubmitting = false;
			}
		} else {
			if (!addToExistingForm.donorName.trim()) { toastStore.warning('Donor name is required', 'Validation'); return; }
			if (!addToExistingForm.inventoryItemId) { toastStore.warning('Please select an inventory item', 'Validation'); return; }
			if (!Number.isInteger(addToExistingForm.quantity) || addToExistingForm.quantity < 1) { toastStore.warning('Quantity must be a positive whole number', 'Validation'); return; }
			if (!addToExistingForm.purpose.trim()) { toastStore.warning('Purpose is required', 'Validation'); return; }

			donationSubmitting = true;
			try {
				const payload: CreateDonationAddToExistingRequest = {
					inventoryAction: 'add_to_existing',
					donorName: addToExistingForm.donorName.trim(),
					inventoryItemId: addToExistingForm.inventoryItemId,
					quantity: addToExistingForm.quantity,
					purpose: addToExistingForm.purpose.trim(),
					date: addToExistingForm.date,
					notes: addToExistingForm.notes.trim() || undefined
				};
				await donationsAPI.create(payload);
				inventoryItems = [];
				await loadDonations();
				resetDonationForms();
				toastStore.success('Donation recorded and inventory updated', 'Success');
				showDonationModal = false;
			} catch (err) {
				toastStore.error(err instanceof Error ? err.message : 'Failed to record donation', 'Error');
			} finally {
				donationSubmitting = false;
			}
		}
	}

	function resetDonationForms(): void {
		const today = new Date().toISOString().split('T')[0];
		newItemForm = { donorName: '', itemName: '', category: '', categoryId: '', specification: '', toolsOrEquipment: '', condition: 'Good', location: '', quantity: 1, unit: '', purpose: '', date: today, notes: '' };
		addToExistingForm = { donorName: '', inventoryItemId: '', quantity: 1, purpose: '', date: today, notes: '' };
		inventorySearch = '';
	}

	async function handleAddQuantity(): Promise<void> {
		if (!selectedDonationForQty) return;
		if (!Number.isInteger(addQtyValue) || addQtyValue < 1) {
			toastStore.warning('Quantity to add must be a positive whole number', 'Validation');
			return;
		}

		addQtySubmitting = true;
		try {
			const payload: AddDonationQuantityRequest = {
				quantityToAdd: addQtyValue,
				notes: addQtyNotes.trim() || undefined
			};
			await donationsAPI.addQuantity(selectedDonationForQty.id, payload);
			await loadDonations();
			toastStore.success(
				`Added ${addQtyValue} to "${selectedDonationForQty.itemName}"`,
				'Quantity Updated'
			);
			showAddQuantityModal = false;
			selectedDonationForQty = null;
			addQtyValue = 1;
			addQtyNotes = '';
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to update quantity', 'Error');
		} finally {
			addQtySubmitting = false;
		}
	}

	function openAddQuantityModal(donation: DonationResponse): void {
		selectedDonationForQty = donation;
		addQtyValue = 1;
		addQtyNotes = '';
		showAddQuantityModal = true;
	}

	function printReceipt(receiptNumber: string) {
		toastStore.info(`Printing record ${receiptNumber}…`, 'Print');
	}

	function exportHistory() {
		toastStore.info('Exporting resolution log to CSV…', 'Export');
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'paid':
			case 'completed':
				return 'bg-pink-100 text-pink-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'partial':
				return 'bg-blue-100 text-blue-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getObligationStatusClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'bg-amber-100 text-amber-800 ring-amber-200';
			case 'paid':
				return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
			case 'replaced':
				return 'bg-cyan-100 text-cyan-800 ring-cyan-200';
			case 'waived':
				return 'bg-slate-100 text-slate-700 ring-slate-200';
			default:
				return 'bg-gray-100 text-gray-700 ring-gray-200';
		}
	}

	function getRequestSummaryStatusClass(statuses: Set<string>): string {
		if (statuses.size === 1) {
			const [status] = [...statuses];
			return getObligationStatusClass(status);
		}

		if (statuses.has('pending')) {
			return 'bg-amber-100 text-amber-800 ring-amber-200';
		}

		return 'bg-slate-100 text-slate-700 ring-slate-200';
	}

	function getRequestSummaryStatusLabel(statuses: Set<string>): string {
		if (statuses.size === 1) {
			const [status] = [...statuses];
			return status.charAt(0).toUpperCase() + status.slice(1);
		}

		if (statuses.has('pending')) {
			return 'Mixed';
		}

		return 'Resolved';
	}

	function getInitials(name?: string): string {
		if (!name) return '??';
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Resource Management</h1>
		<p class="text-gray-600 mt-1">Track item donations, accountability obligations, and resolution records</p>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#if isLoading}
			{#each Array(4) as _}
				<div class="rounded-lg bg-white p-3 shadow sm:p-5">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 space-y-2">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="h-8 w-24" />
						</div>
						<Skeleton class="h-9 w-9 rounded-full sm:h-12 sm:w-12" />
					</div>
				</div>
			{/each}
		{:else}
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Donated Items</p>
					<p class="mt-1 text-2xl font-semibold text-pink-600 sm:mt-2 sm:text-3xl">{totalDonatedItems.toLocaleString()}</p>
					<p class="text-xs text-gray-500 mt-0.5">{uniqueItemTypes} type{uniqueItemTypes !== 1 ? 's' : ''}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 sm:h-12 sm:w-12">
					<Package size={18} class="text-pink-600 sm:hidden" />
					<Package size={24} class="hidden text-pink-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
					<p class="mt-1 text-2xl font-semibold text-orange-600 sm:mt-2 sm:text-3xl">{obligationCounts.pending}</p>
					<p class="text-xs text-gray-500 mt-0.5">Awaiting resolution</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 sm:h-12 sm:w-12">
					<AlertCircle size={18} class="text-orange-600 sm:hidden" />
					<AlertCircle size={24} class="hidden text-orange-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Resolved</p>
					<p class="mt-1 text-2xl font-semibold text-green-600 sm:mt-2 sm:text-3xl">{obligationCounts.paid + obligationCounts.replaced + obligationCounts.waived}</p>
					<p class="text-xs text-gray-500 mt-0.5">Paid/replaced/waived</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 sm:h-12 sm:w-12">
					<CheckCircle2 size={18} class="text-green-600 sm:hidden" />
					<CheckCircle2 size={24} class="hidden text-green-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Recent Activity</p>
					<p class="mt-1 text-2xl font-semibold text-blue-600 sm:mt-2 sm:text-3xl">{recentActivityCount + recentDonationsCount}</p>
					<p class="text-xs text-gray-500 mt-0.5">Last 7 days</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<TrendingUp size={18} class="text-blue-600 sm:hidden" />
					<TrendingUp size={24} class="hidden text-blue-600 sm:block" />
				</div>
			</div>
		</div>
		{/if}
	</div>

	<!-- Tabs Navigation -->
	<div class="bg-white rounded-lg shadow mt-6">
		<div class="border-b border-gray-200">
			<nav class="flex -mb-px overflow-x-auto" aria-label="Tabs">
				<button
					onclick={() => (activeTab = 'replacements')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'replacements'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Item Accountability
					{#if obligationCounts.pending > 0}
						<span class="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{obligationCounts.pending}</span>
					{/if}
				</button>
				<button
					onclick={() => (activeTab = 'donations')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'donations'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Donations
				</button>
				<button
					onclick={() => (activeTab = 'history')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'history'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Resolution Log
				</button>
			</nav>
		</div>

		<div class="p-6">
			{#if isLoading}
				<!-- Skeleton: tab content placeholder -->
				<div class="space-y-4" role="status" aria-label="Loading resource management data">
					<div class="flex items-center justify-between">
						<div class="space-y-2">
							<Skeleton class="h-5 w-56" />
							<Skeleton class="h-3.5 w-80" />
						</div>
						<Skeleton class="h-9 w-32" />
					</div>
					<div class="border-b border-gray-200 pb-1 flex gap-6">
						{#each Array(4) as _}
							<Skeleton class="h-4 w-16" />
						{/each}
					</div>
					{#each Array(5) as _}
						<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<Skeleton variant="circle" class="h-10 w-10" />
									<div class="space-y-1.5">
										<Skeleton class="h-4 w-36" />
										<Skeleton class="h-3 w-24" />
									</div>
								</div>
								<Skeleton class="h-6 w-20" />
							</div>
							<div class="flex gap-4">
								<Skeleton class="h-3 w-28" />
								<Skeleton class="h-3 w-28" />
								<Skeleton class="h-3 w-20" />
							</div>
						</div>
					{/each}
				</div>
			{:else if error}
				<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
					<svg class="mx-auto mb-3 h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					<p class="text-sm font-medium text-red-700">{error}</p>
					<button
						onclick={() => loadObligations()}
						class="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
					>
						Try Again
					</button>
				</div>
			{:else}
			<!-- Donations Tracking Tab -->
			{#if activeTab === 'donations'}
				<div class="space-y-6">
					<!-- Header row -->
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Donations Tracking</h3>
							<p class="mt-0.5 text-sm text-gray-500">Record and track item donations from individuals and organizations.</p>
						</div>
						<button
							onclick={openDonationModal}
							class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
							</svg>
							Record Donation
						</button>
					</div>

					<!-- Search -->
					<div class="relative max-w-sm">
						<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
						</svg>
						<input
							type="search"
							bind:value={donationsSearch}
							oninput={() => loadDonations()}
							placeholder="Search by item, donor, or purpose…"
							class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
						/>
					</div>

					<!-- Donations List -->
					<div>
						{#if donationsLoading}
							<div class="space-y-3" role="status" aria-label="Loading donations">
								{#each Array(4) as _}
									<div class="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
										<Skeleton variant="circle" class="h-10 w-10 shrink-0" />
										<div class="flex-1 space-y-2">
											<Skeleton class="h-4 w-40" />
											<Skeleton class="h-3 w-24" />
										</div>
										<Skeleton class="h-6 w-20" />
									</div>
								{/each}
							</div>
						{:else if donations.length === 0}
							<div class="py-12 text-center">
								<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
								</svg>
								<h3 class="mt-4 text-lg font-medium text-gray-900">No donations yet</h3>
								<p class="mt-2 text-sm text-gray-500">Item donations from individuals or organizations will be recorded and tracked here.</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Donor</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody class="bg-white divide-y divide-gray-200">
										{#each donations as donation}
											<tr class="hover:bg-gray-50">
												<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{donation.receiptNumber}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{donation.donorName}</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<span class="text-sm font-medium text-gray-900">{donation.itemName}</span>
													{#if donation.notes}
														<p class="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate" title={donation.notes}>{donation.notes}</p>
													{/if}
												</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
													{donation.quantity.toLocaleString()}{donation.unit ? ` ${donation.unit}` : ''}
												</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {donation.inventoryAction === 'new_item' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}">
														{donation.inventoryAction === 'new_item' ? 'New Item' : 'Added to Existing'}
													</span>
												</td>
											<td class="px-6 py-4 text-sm text-gray-900 max-w-[200px] truncate" title={donation.purpose}>{donation.purpose}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{donation.date}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm">
													<div class="flex items-center gap-3">
														<button
															onclick={() => openAddQuantityModal(donation)}
															class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
															title="Add quantity"
														>
															<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
															</svg>
															Add Qty
														</button>
														<button
															onclick={() => printReceipt(donation.receiptNumber)}
															class="text-emerald-600 hover:text-emerald-900 font-medium"
														>
															Print
														</button>
														<button
															onclick={async () => {
																const confirmed = await confirmStore.danger(
																	`Delete donation ${donation.receiptNumber} (${donation.itemName}) from ${donation.donorName}? This cannot be undone.`,
																	'Delete Donation',
																	'Delete'
																);
																if (!confirmed) return;
																try {
																	await donationsAPI.delete(donation.id);
																	await loadDonations();
																	toastStore.success('Donation deleted successfully', 'Deleted');
																} catch (err) {
																	toastStore.error(err instanceof Error ? err.message : 'Failed to delete donation', 'Error');
																}
															}}
															class="text-red-500 hover:text-red-700 font-medium"
														>
															Delete
														</button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Replacement Payments Tab -->
			{#if activeTab === 'replacements'}
				<div class="space-y-6">
					<!-- Sub-tab header -->
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Item Accountability</h3>
							<p class="mt-0.5 text-sm text-gray-500">Manage outstanding obligations from damage and missing item incidents.</p>
						</div>
						{#if obligationCounts.pending > 0}
							<span class="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
								<span class="h-2 w-2 rounded-full bg-amber-500"></span>
								{obligationCounts.pending} pending
							</span>
						{/if}
					</div>

					<!-- Inner filter tabs -->
					<div class="border-b border-gray-200">
						<nav class="-mb-px flex gap-6 overflow-x-auto">
							{#each [
								{ key: 'all', label: 'All', count: obligationCounts.all },
								{ key: 'pending', label: 'Pending', count: obligationCounts.pending },
								{ key: 'paid', label: 'Paid', count: obligationCounts.paid },
								{ key: 'replaced', label: 'Replaced', count: obligationCounts.replaced },
								{ key: 'waived', label: 'Waived', count: obligationCounts.waived }
							] as tab}
								<button
									onclick={() => (replacementsFilter = tab.key as typeof replacementsFilter)}
									class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {replacementsFilter === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									{tab.label}
									<span class="ml-1.5 rounded-full px-2 py-0.5 text-xs {replacementsFilter === tab.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
										{tab.count}
									</span>
								</button>
							{/each}
						</nav>
					</div>

					<div class="inline-flex w-fit items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
						<button
							onclick={() => (replacementsView = 'by-request')}
							class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {replacementsView === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						>
							By Request
						</button>
						<button
							onclick={() => (replacementsView = 'by-item')}
							class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {replacementsView === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						>
							By Item
						</button>
					</div>

					{#if isLoading}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<p class="text-gray-500">Loading obligations...</p>
						</div>
					{:else if error}
						<div class="text-center py-12 bg-red-50 rounded-lg border border-red-200">
							<svg class="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="text-red-600">{error}</p>
						</div>
					{:else if filteredObligations.length === 0}
						<div class="rounded-lg border-2 border-dashed border-gray-200 py-14 text-center">
							<svg class="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="mt-3 text-sm font-medium text-gray-700">{replacementsFilter === 'all' ? 'No obligations recorded.' : `No ${replacementsFilter} obligations.`}</p>
							<p class="mt-1 text-xs text-gray-500">Obligations from damage and missing incidents will appear here.</p>
						</div>
					{:else if replacementsView === 'by-request'}
						<div class="overflow-x-auto rounded-lg border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Request</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Issue Mix</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Items</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"></th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each requestSummaries as summary}
										<tr class="hover:bg-gray-50">
											<td class="whitespace-nowrap px-6 py-4">
												<div class="text-sm font-semibold text-gray-900">{summary.requestCode}</div>
											</td>
											<td class="px-6 py-4">
												<div class="flex items-center gap-3">
													<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
														{#if summary.studentProfilePhotoUrl}
															<img src={summary.studentProfilePhotoUrl} alt={summary.studentName} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{getInitials(summary.studentName)}
														{/if}
													</div>
													<div>
														<div class="text-sm font-medium text-gray-900">{summary.studentName}</div>
														<div class="text-xs text-gray-500">{summary.studentEmail}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4">
												<div class="flex flex-wrap gap-1.5">
													{#if summary.missingCount > 0}
														<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
															<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
															{summary.missingCount} Missing
														</span>
													{/if}
													{#if summary.damagedCount > 0}
														<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
															<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
															{summary.damagedCount} Damaged
														</span>
													{/if}
												</div>
											</td>
											<td class="whitespace-nowrap px-6 py-4">
												<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getRequestSummaryStatusClass(summary.statuses)}">
													{getRequestSummaryStatusLabel(summary.statuses)}
												</span>
											</td>
											<td class="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-700">
												{summary.items} item{summary.items !== 1 ? 's' : ''}
											</td>
											<td class="whitespace-nowrap px-6 py-4 text-right">
												<button
													onclick={() => { selectedSummary = summary; selectedSummaryItemIndex = 0; }}
													class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
												>
													View Details
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="overflow-x-auto rounded-lg border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Incident</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each filteredObligations as obligation}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center gap-3">
													<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
														{#if obligation.studentProfilePhotoUrl}
															<img src={obligation.studentProfilePhotoUrl} alt={obligation.studentName || 'Student'} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{getInitials(obligation.studentName || 'Unknown Student')}
														{/if}
													</div>
													<div>
														<div class="text-sm font-medium text-gray-900">{obligation.studentName || 'Unknown Student'}</div>
														<div class="text-xs text-gray-500">{obligation.studentEmail || 'N/A'}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm text-gray-900">{obligation.itemName}</div>
												<div class="text-xs text-gray-500">Qty: {obligation.quantity}</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {obligation.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
													<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
													{obligation.type === 'missing' ? 'Missing' : 'Damaged'}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(obligation.status)}">
													{obligation.status.charAt(0).toUpperCase() + obligation.status.slice(1)}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
												{new Date(obligation.dueDate).toLocaleDateString()}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-right">
												<button
													onclick={() => selectedObligation = obligation}
													class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
												>
													View Details
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Payment History Tab -->
			{#if activeTab === 'history'}
				<div class="space-y-6">
					<!-- Header row -->
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Resolution Log</h3>
							<p class="mt-0.5 text-sm text-gray-500">Audit trail of all resolved item accountability obligations.</p>
						</div>
						<button
							onclick={exportHistory}
							class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
						>
							Export to CSV
						</button>
					</div>

					<!-- History sub-filter tabs -->
					<div class="border-b border-gray-200">
						<nav class="-mb-px flex gap-6 overflow-x-auto">
							{#each [
								{ key: 'all', label: 'All', count: historyCounts.all },
								{ key: 'resolved', label: 'Resolved', count: historyCounts.resolved },
								{ key: 'waived', label: 'Waived', count: historyCounts.waived }
							] as tab}
								<button
									onclick={() => (historyFilter = tab.key as typeof historyFilter)}
									class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {historyFilter === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									{tab.label}
									<span class="ml-1.5 rounded-full px-2 py-0.5 text-xs {historyFilter === tab.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
										{tab.count}
									</span>
								</button>
							{/each}
						</nav>
					</div>

					{#if filteredPaymentHistory.length === 0}
						<div class="rounded-lg border-2 border-dashed border-gray-200 py-14 text-center">
							<svg class="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
							</svg>
							<p class="mt-3 text-sm font-medium text-gray-700">{historyFilter === 'all' ? 'No resolution records yet.' : `No ${historyFilter} records.`}</p>
							<p class="mt-1 text-xs text-gray-500">Resolved obligations will appear here once closed.</p>
						</div>
					{:else}
						<div class="overflow-x-auto rounded-lg border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref #</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resolution</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each filteredPaymentHistory as transaction}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{transaction.receiptNumber}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.name}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {transaction.resolutionType === 'payment' ? 'bg-emerald-100 text-emerald-800' : transaction.resolutionType === 'replacement' ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-700'}">
													{transaction.resolutionType === 'payment' ? 'Cash Payment' : transaction.resolutionType === 'replacement' ? 'Item Replaced' : 'Waived'}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
												{new Date(transaction.date).toLocaleDateString()}
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {transaction.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
													{transaction.status === 'resolved' ? 'Resolved' : 'Waived'}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<button
													onclick={() => printReceipt(transaction.receiptNumber)}
													class="text-emerald-600 hover:text-emerald-900 font-medium"
												>
													View Receipt
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
			{/if}
		</div>
	</div>
</div>

<!-- Request Summary Detail Modal -->
{#if selectedSummary}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="summary-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => selectedSummary = null}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-lg rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="summary-modal-title" class="text-base font-semibold text-gray-900">{selectedSummary.requestCode}</h2>
						<p class="mt-0.5 text-xs text-gray-500">{selectedSummary.studentName} · {selectedSummary.items} item{selectedSummary.items !== 1 ? 's' : ''}</p>
					</div>
					<button
						onclick={() => selectedSummary = null}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-5">

					<!-- Student -->
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
							{#if selectedSummary.studentProfilePhotoUrl}
								<img src={selectedSummary.studentProfilePhotoUrl} alt={selectedSummary.studentName} class="h-full w-full object-cover" />
							{:else}
								{getInitials(selectedSummary.studentName)}
							{/if}
						</div>
						<div>
							<p class="text-sm font-medium text-gray-900">{selectedSummary.studentName}</p>
							<p class="text-xs text-gray-500">{selectedSummary.studentEmail}</p>
						</div>
						<div class="ml-auto">
							<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getRequestSummaryStatusClass(selectedSummary.statuses)}">
								{getRequestSummaryStatusLabel(selectedSummary.statuses)}
							</span>
						</div>
					</div>

					<!-- Item selector dropdown -->
					{#if selectedSummaryItems.length > 0}
						<div>
							<label for="summary-item-select" class="block text-xs font-medium text-gray-500 mb-1.5">Item</label>
							<select
								id="summary-item-select"
								bind:value={selectedSummaryItemIndex}
								class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
							>
								{#each selectedSummaryItems as item, i}
									<option value={i}>
										{item.itemName} — {item.type === 'missing' ? 'Missing' : 'Damaged'} · Qty {item.quantity}
									</option>
								{/each}
							</select>
						</div>
					{/if}

					<!-- Selected item detail -->
					{#if selectedSummaryItem}
						<div class="rounded-lg bg-gray-50 p-4 space-y-3 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Type</span>
								<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 {selectedSummaryItem.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{selectedSummaryItem.type === 'missing' ? 'Missing' : 'Damaged'}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Status</span>
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(selectedSummaryItem.status)}">
									{selectedSummaryItem.status.charAt(0).toUpperCase() + selectedSummaryItem.status.slice(1)}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Due Date</span>
								<span class="font-medium text-gray-900">{new Date(selectedSummaryItem.dueDate).toLocaleDateString()}</span>
							</div>
						</div>

						<!-- Financials for selected item -->
						<div class="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Item</span>
								<span class="font-medium text-gray-900">{selectedSummaryItem.itemName}</span>
							</div>
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Quantity</span>
								<span class="font-medium text-gray-900">{selectedSummaryItem.quantity}</span>
							</div>
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Due Date</span>
								<span class="font-medium text-gray-900">{new Date(selectedSummaryItem.dueDate).toLocaleDateString()}</span>
							</div>
						</div>

						<!-- Actions for selected item -->
						{#if selectedSummaryItem.status === 'pending'}
							<div class="flex flex-wrap gap-2 pt-1">
								<button
									onclick={async () => {
										const confirmed = await confirmStore.confirm({ type: 'info', title: 'Mark as Replaced', message: 'Mark this item as replaced by the student?', confirmText: 'Mark Replaced' });
										if (confirmed) {
											await handleResolveObligation(selectedSummaryItem!.id, 'replacement');
											selectedSummary = null;
										}
									}}
									class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
								>
									Mark Replaced
								</button>
								<button
									onclick={async () => {
										const confirmed = await confirmStore.danger('Waive this obligation? This action cannot be undone.', 'Waive Obligation', 'Waive');
										if (confirmed) {
											await handleResolveObligation(selectedSummaryItem!.id, 'waiver');
											selectedSummary = null;
										}
									}}
									class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
								>
									Waive
								</button>
							</div>
						{/if}
					{/if}

					<!-- Request totals -->
					<div class="border-t border-gray-100 pt-4">
						<p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Request Summary</p>
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Total Items</span>
							<span class="font-semibold text-gray-900">{selectedSummary.items} item{selectedSummary.items !== 1 ? 's' : ''}</span>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex justify-end border-t border-gray-200 px-6 py-4">
					<button
						onclick={() => selectedSummary = null}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Record Donation Modal -->
{#if showDonationModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="donation-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => { if (!donationSubmitting) { showDonationModal = false; resetDonationForms(); } }}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-2xl rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="donation-modal-title" class="text-base font-semibold text-gray-900">Record Item Donation</h2>
						<p class="mt-0.5 text-xs text-gray-500">Donations are automatically synced to the inventory.</p>
					</div>
					<button onclick={() => { if (!donationSubmitting) { showDonationModal = false; resetDonationForms(); } }}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Close" disabled={donationSubmitting}>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>

				<!-- Mode toggle -->
				<div class="border-b border-gray-200 px-6 pt-4 pb-3">
					<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 gap-1">
						<button onclick={() => donationMode = 'new_item'}
							class="rounded-md px-4 py-2 text-sm font-medium transition-colors {donationMode === 'new_item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
							<span class="flex items-center gap-2">
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
								New Inventory Item
							</span>
						</button>
						<button onclick={() => donationMode = 'add_to_existing'}
							class="rounded-md px-4 py-2 text-sm font-medium transition-colors {donationMode === 'add_to_existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
							<span class="flex items-center gap-2">
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
								Add to Existing Item
							</span>
						</button>
					</div>
					<p class="mt-2 text-xs text-gray-400">
						{donationMode === 'new_item' ? 'Creates a new item in the inventory and records the donation.' : 'Adds the donated quantity to an existing inventory item.'}
					</p>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
					{#if inventoryLoading}
						<div class="flex items-center justify-center py-8 gap-3 text-gray-500">
							<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
							<span class="text-sm">Loading inventory…</span>
						</div>
					{:else if donationMode === 'new_item'}

						<div>
							<label for="ni-donor" class="block text-sm font-medium text-gray-700 mb-1">Donor Name <span class="text-red-500">*</span></label>
							<input id="ni-donor" type="text" bind:value={newItemForm.donorName} maxlength="200" placeholder="Individual or organization name"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
						</div>

						<div>
							<label for="ni-name" class="block text-sm font-medium text-gray-700 mb-1">Item Name <span class="text-red-500">*</span></label>
							<input id="ni-name" type="text" bind:value={newItemForm.itemName} maxlength="200" placeholder="e.g. Cooking Pot, Ladle Set"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="ni-category" class="block text-sm font-medium text-gray-700 mb-1">Category <span class="text-red-500">*</span></label>
								<select id="ni-category"
									onchange={(e) => { const sel = inventoryCategories.find(c => c.id === (e.target as HTMLSelectElement).value); newItemForm.categoryId = sel?.id ?? ''; newItemForm.category = sel?.name ?? ''; }}
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
									<option value="">Select category…</option>
									{#each inventoryCategories as cat}<option value={cat.id}>{cat.name}</option>{/each}
								</select>
							</div>
							<div>
								<label for="ni-condition" class="block text-sm font-medium text-gray-700 mb-1">Condition <span class="text-red-500">*</span></label>
								<select id="ni-condition" bind:value={newItemForm.condition}
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
									<option value="Excellent">Excellent</option>
									<option value="Good">Good</option>
									<option value="Fair">Fair</option>
									<option value="Poor">Poor</option>
									<option value="Damaged">Damaged</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="ni-spec" class="block text-sm font-medium text-gray-700 mb-1">Specification <span class="text-gray-400 font-normal">(optional)</span></label>
								<input id="ni-spec" type="text" bind:value={newItemForm.specification} maxlength="500" placeholder="e.g. Stainless steel, 5L"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
							<div>
								<label for="ni-tools" class="block text-sm font-medium text-gray-700 mb-1">Tools / Equipment <span class="text-gray-400 font-normal">(optional)</span></label>
								<input id="ni-tools" type="text" bind:value={newItemForm.toolsOrEquipment} maxlength="200" placeholder="e.g. Kitchen Equipment"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<label for="ni-qty" class="block text-sm font-medium text-gray-700 mb-1">Quantity <span class="text-red-500">*</span></label>
								<input id="ni-qty" type="number" bind:value={newItemForm.quantity} min="1" step="1"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
							<div>
								<label for="ni-unit" class="block text-sm font-medium text-gray-700 mb-1">Unit <span class="text-gray-400 font-normal">(optional)</span></label>
								<input id="ni-unit" type="text" bind:value={newItemForm.unit} maxlength="50" placeholder="pcs, kg, sets"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
							<div>
								<label for="ni-location" class="block text-sm font-medium text-gray-700 mb-1">Location <span class="text-gray-400 font-normal">(optional)</span></label>
								<input id="ni-location" type="text" bind:value={newItemForm.location} maxlength="200" placeholder="e.g. Storage Room A"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="ni-purpose" class="block text-sm font-medium text-gray-700 mb-1">Purpose <span class="text-red-500">*</span></label>
								<input id="ni-purpose" type="text" bind:value={newItemForm.purpose} maxlength="500" placeholder="Intended use of the donated item"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
							<div>
								<label for="ni-date" class="block text-sm font-medium text-gray-700 mb-1">Date Received <span class="text-red-500">*</span></label>
								<input id="ni-date" type="date" bind:value={newItemForm.date}
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
							</div>
						</div>

						<div>
							<label for="ni-notes" class="block text-sm font-medium text-gray-700 mb-1">Notes <span class="text-gray-400 font-normal">(optional)</span></label>
							<input id="ni-notes" type="text" bind:value={newItemForm.notes} maxlength="1000" placeholder="Additional notes"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
						</div>

					{:else}

						<div>
							<label for="ae-donor" class="block text-sm font-medium text-gray-700 mb-1">Donor Name <span class="text-red-500">*</span></label>
							<input id="ae-donor" type="text" bind:value={addToExistingForm.donorName} maxlength="200" placeholder="Individual or organization name"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Inventory Item <span class="text-red-500">*</span></label>
							<div class="relative mb-2">
								<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
								<input type="search" bind:value={inventorySearch} placeholder="Search items…"
									class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
							</div>
							<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
								{#if filteredInventoryItems.length === 0}
									<p class="py-6 text-center text-sm text-gray-400">No items found.</p>
								{:else}
									{#each filteredInventoryItems as item}
										<button type="button" onclick={() => addToExistingForm.inventoryItemId = item.id}
											class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors {addToExistingForm.inventoryItemId === item.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}">
											<div>
												<p class="text-sm font-medium text-gray-900">{item.name}</p>
												<p class="text-xs text-gray-500">{item.category} · {item.condition}</p>
											</div>
											<div class="text-right shrink-0 ml-4">
												<p class="text-sm font-semibold text-gray-700">{item.quantity.toLocaleString()}</p>
												<p class="text-xs text-gray-400">in stock</p>
											</div>
										</button>
									{/each}
								{/if}
							</div>
							{#if selectedInventoryItem}
								<div class="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
									<svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
									Selected: <span class="font-semibold">{selectedInventoryItem.name}</span> — current stock: {selectedInventoryItem.quantity}
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="ae-qty" class="block text-sm font-medium text-gray-700 mb-1">Quantity to Add <span class="text-red-500">*</span></label>
								<input id="ae-qty" type="number" bind:value={addToExistingForm.quantity} min="1" step="1"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
								{#if selectedInventoryItem}
									<p class="mt-1 text-xs text-gray-400">New total: {(selectedInventoryItem.quantity + (addToExistingForm.quantity || 0)).toLocaleString()}</p>
								{/if}
							</div>
							<div>
								<label for="ae-date" class="block text-sm font-medium text-gray-700 mb-1">Date Received <span class="text-red-500">*</span></label>
								<input id="ae-date" type="date" bind:value={addToExistingForm.date}
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
							</div>
						</div>

						<div>
							<label for="ae-purpose" class="block text-sm font-medium text-gray-700 mb-1">Purpose <span class="text-red-500">*</span></label>
							<input id="ae-purpose" type="text" bind:value={addToExistingForm.purpose} maxlength="500" placeholder="Intended use of the donated item"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
						</div>

						<div>
							<label for="ae-notes" class="block text-sm font-medium text-gray-700 mb-1">Notes <span class="text-gray-400 font-normal">(optional)</span></label>
							<input id="ae-notes" type="text" bind:value={addToExistingForm.notes} maxlength="1000" placeholder="Additional notes"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
						</div>

					{/if}
				</div>

				<!-- Footer -->
				<div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
					<button onclick={() => { if (!donationSubmitting) { showDonationModal = false; resetDonationForms(); } }} disabled={donationSubmitting}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors disabled:opacity-50">
						Cancel
					</button>
					<button onclick={handleAddDonation} disabled={donationSubmitting || inventoryLoading}
						class="inline-flex items-center gap-2 rounded-lg {donationMode === 'new_item' ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'} px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors disabled:opacity-60">
						{#if donationSubmitting}
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
							Recording…
						{:else}
							{donationMode === 'new_item' ? 'Record & Add to Inventory' : 'Record & Update Inventory'}
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Add Quantity Modal -->
{#if showAddQuantityModal && selectedDonationForQty}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="add-qty-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => { if (!addQtySubmitting) { showAddQuantityModal = false; selectedDonationForQty = null; } }}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-md rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="add-qty-modal-title" class="text-base font-semibold text-gray-900">Add Quantity</h2>
						<p class="mt-0.5 text-xs text-gray-500">{selectedDonationForQty.itemName} · current qty: {selectedDonationForQty.quantity.toLocaleString()}{selectedDonationForQty.unit ? ` ${selectedDonationForQty.unit}` : ''}</p>
					</div>
					<button
						onclick={() => { if (!addQtySubmitting) { showAddQuantityModal = false; selectedDonationForQty = null; } }}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close"
						disabled={addQtySubmitting}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-4">
					<div>
						<label for="add-qty-value" class="block text-sm font-medium text-gray-700 mb-1">Quantity to Add <span class="text-red-500">*</span></label>
						<input
							id="add-qty-value"
							type="number"
							bind:value={addQtyValue}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							min="1"
							step="1"
						/>
					</div>
					<div>
						<label for="add-qty-notes" class="block text-sm font-medium text-gray-700 mb-1">Notes <span class="text-gray-400 font-normal">(optional)</span></label>
						<input
							id="add-qty-notes"
							type="text"
							bind:value={addQtyNotes}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							placeholder="Reason for quantity update"
							maxlength="1000"
						/>
					</div>
					<div class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
						New total will be <span class="font-semibold">{(selectedDonationForQty.quantity + (addQtyValue || 0)).toLocaleString()}{selectedDonationForQty.unit ? ` ${selectedDonationForQty.unit}` : ''}</span>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
					<button
						onclick={() => { if (!addQtySubmitting) { showAddQuantityModal = false; selectedDonationForQty = null; } }}
						disabled={addQtySubmitting}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onclick={handleAddQuantity}
						disabled={addQtySubmitting}
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-60"
					>
						{#if addQtySubmitting}
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Updating…
						{:else}
							Add Quantity
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Obligation Detail Modal -->
{#if selectedObligation}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="obligation-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => selectedObligation = null}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-lg rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="obligation-modal-title" class="text-base font-semibold text-gray-900">Obligation Details</h2>
						<p class="mt-0.5 text-xs text-gray-500">{selectedObligation.itemName} · {selectedObligation.studentName || 'Unknown Student'}</p>
					</div>
					<button
						onclick={() => selectedObligation = null}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-5">

					<!-- Student -->
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
							{#if selectedObligation.studentProfilePhotoUrl}
								<img src={selectedObligation.studentProfilePhotoUrl} alt={selectedObligation.studentName || ''} class="h-full w-full object-cover" />
							{:else}
								{getInitials(selectedObligation.studentName || 'Unknown Student')}
							{/if}
						</div>
						<div>
							<p class="text-sm font-medium text-gray-900">{selectedObligation.studentName || 'Unknown Student'}</p>
							<p class="text-xs text-gray-500">{selectedObligation.studentEmail || 'N/A'}</p>
						</div>
						<div class="ml-auto">
							<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(selectedObligation.status)}">
								{selectedObligation.status.charAt(0).toUpperCase() + selectedObligation.status.slice(1)}
							</span>
						</div>
					</div>

					<!-- Details grid -->
					<div class="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
						<div>
							<p class="text-xs text-gray-500">Item</p>
							<p class="mt-0.5 font-medium text-gray-900">{selectedObligation.itemName}</p>
						</div>
						<div>
							<p class="text-xs text-gray-500">Quantity</p>
							<p class="mt-0.5 font-medium text-gray-900">{selectedObligation.quantity}</p>
						</div>
						<div>
							<p class="text-xs text-gray-500">Type</p>
							<span class="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 {selectedObligation.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
								<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
								{selectedObligation.type === 'missing' ? 'Missing' : 'Damaged'}
							</span>
						</div>
						<div>
							<p class="text-xs text-gray-500">Due Date</p>
							<p class="mt-0.5 font-medium text-gray-900">{new Date(selectedObligation.dueDate).toLocaleDateString()}</p>
						</div>
					</div>

					<!-- Actions -->
					{#if selectedObligation.status === 'pending'}
						<div class="flex flex-wrap gap-2 pt-1">
							<button
								onclick={async () => {
									const confirmed = await confirmStore.confirm({ type: 'info', title: 'Mark as Replaced', message: 'Mark this item as replaced by the student?', confirmText: 'Mark Replaced' });
									if (confirmed) {
										await handleResolveObligation(selectedObligation!.id, 'replacement');
										selectedObligation = null;
									}
								}}
								class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
							>
								Mark Replaced
							</button>
							<button
								onclick={async () => {
									const confirmed = await confirmStore.danger('Waive this obligation? This action cannot be undone.', 'Waive Obligation', 'Waive');
									if (confirmed) {
										await handleResolveObligation(selectedObligation!.id, 'waiver');
										selectedObligation = null;
									}
								}}
								class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
							>
								Waive
							</button>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex justify-end border-t border-gray-200 px-6 py-4">
					<button
						onclick={() => selectedObligation = null}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
