<script lang="ts">
	import { onMount } from 'svelte';
	import { replacementObligationsAPI, type ReplacementObligation } from '$lib/api/replacementObligations';
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
	let obligations = $state<ReplacementObligation[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let currentPage = $state(1);
	const itemsPerPageByRequest = 5;  // Cards view - max 5 cards
	const itemsPerPageByItem = 10;     // Table/List view
	const itemsPerPageDonations = 10;  // Donations table
	const itemsPerPageHistory = 10;    // Resolution log table
	let selectedObligation = $state<ReplacementObligation | null>(null);
	let editingAmountReplacedId = $state<string | null>(null);
	let editedAmountReplaced = $state(0);
	let isUpdatingAmountReplaced = $state(false);
	let selectedSummary = $state<{ borrowRequestId: string; requestCode: string; studentName: string; studentEmail: string; studentProfilePhotoUrl: string | null; items: number; missingCount: number; damagedCount: number; amount: number; amountPaid: number; balance: number; latestDueDate: string; statuses: Set<string> } | null>(null);
	let selectedSummaryItemIndex = $state(0);
	let hasInitialized = $state(false);
	let selectedDonation = $state<DonationResponse | null>(null);

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

	function getInventoryCurrentStock(item: InventoryItem): number {
		return item.currentCount ?? (item.quantity + (item.donations ?? 0));
	}

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
				paymentMethod: o.resolutionType === 'replacement' ? 'Item Replaced' : 'Waived',
				receiptNumber: o.paymentReference || `REP-${o.id.slice(-6).toUpperCase()}`
			}))
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
	);

	const filteredPaymentHistory = $derived(
		historyFilter === 'all'
			? paymentHistory
			: paymentHistory.filter((p) => p.status === historyFilter)
	);

	const totalDonationsPages = $derived(Math.ceil(donations.length / itemsPerPageDonations));
	const paginatedDonations = $derived(
		donations.slice((currentPage - 1) * itemsPerPageDonations, currentPage * itemsPerPageDonations)
	);

	const totalHistoryPages = $derived(Math.ceil(filteredPaymentHistory.length / itemsPerPageHistory));
	const paginatedHistory = $derived(
		filteredPaymentHistory.slice((currentPage - 1) * itemsPerPageHistory, currentPage * itemsPerPageHistory)
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
		replaced: obligations.filter((o) => o.status === 'replaced').length,
		waived: obligations.filter((o) => o.status === 'waived').length
	});

	const filteredObligations = $derived(
		replacementsFilter === 'all' ? obligations : obligations.filter((o) => o.status === replacementsFilter)
	);

	const totalPages = $derived(Math.ceil(filteredObligations.length / itemsPerPageByItem));
	const paginatedObligations = $derived(
		filteredObligations.slice((currentPage - 1) * itemsPerPageByItem, currentPage * itemsPerPageByItem)
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

		const allSummaries = [...grouped.values()].sort(
			(a, b) => new Date(a.latestDueDate).getTime() - new Date(b.latestDueDate).getTime()
		);

		return allSummaries.slice((currentPage - 1) * itemsPerPageByRequest, currentPage * itemsPerPageByRequest);
	});

	const totalRequestPages = $derived(
		Math.ceil(
			new Set(filteredObligations.map(o => o.borrowRequestId)).size / itemsPerPageByRequest
		)
	);
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
	let unsubscribereplacement: (() => void) | null = null;
	let isMounted = $state(false);
	let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

	// Debounced refresh to prevent excessive API calls
	function scheduleRefresh(loadFn: () => Promise<void>, delay = 300) {
		if (refreshTimeout) {
			clearTimeout(refreshTimeout);
		}
		refreshTimeout = setTimeout(() => {
			if (isMounted) {
				loadFn();
			}
		}, delay);
	}

	onMount(async () => {
		isMounted = true;

		// Initialize from cache if available, otherwise show loading
		const cachedObligations = replacementObligationsAPI.peekCachedObligations({ limit: 500 });
		const cachedDonations = donationsAPI.peekCachedDonations({ limit: 200 });
		
		if (cachedObligations) {
			obligations = cachedObligations.obligations;
		}
		if (cachedDonations) {
			donations = cachedDonations.donations;
		}

		// Only show loading indicator if we don't have any cached data
		const shouldShowLoading = !cachedObligations || !cachedDonations;
		if (shouldShowLoading) {
			isLoading = true;
		}

		// Parallel reconciliation and data load
		try {
			await replacementObligationsAPI.reconcile();
			await Promise.all([loadObligations(shouldShowLoading), loadDonations(shouldShowLoading)]);
		} catch (err) {
			console.error('Initial load failed', err);
			if (isMounted && !error) {
				error = 'Failed to load resource management data';
			}
		}

		hasInitialized = true;

		// Set up real-time subscriptions with debouncing
		unsubscribereplacement = replacementObligationsAPI.subscribeToChanges(() => {
			if (isMounted) {
				scheduleRefresh(() => loadObligations(false));
			}
		});

		unsubscribeDonations = donationsAPI.subscribeToChanges(() => {
			if (isMounted) {
				scheduleRefresh(() => loadDonations(false));
			}
		});

		return () => {
			isMounted = false;
			
			// Clear any pending refreshes
			if (refreshTimeout) {
				clearTimeout(refreshTimeout);
				refreshTimeout = null;
			}
			
			// Unsubscribe from SSE connections
			if (unsubscribereplacement) {
				unsubscribereplacement();
				unsubscribereplacement = null;
			}
			if (unsubscribeDonations) {
				unsubscribeDonations();
				unsubscribeDonations = null;
			}
		};
	});

	async function loadObligations(showLoading = true): Promise<void> {
		if (showLoading) {
			isLoading = true;
		}
		error = null;
		
		try {
			const response = await replacementObligationsAPI.getObligations({ limit: 500 });
			if (isMounted) {
				obligations = response.obligations;
			}
		} catch (err) {
			console.error('Failed to load obligations', err);
			if (isMounted) {
				error = err instanceof Error ? err.message : 'Failed to load obligations';
			}
		} finally {
			if (showLoading && isMounted) {
				isLoading = false;
			}
		}
	}

	async function loadDonations(showLoading = true): Promise<void> {
		if (showLoading && isMounted) {
			donationsLoading = true;
		}
		
		try {
			const response = await donationsAPI.getAll({ 
				search: donationsSearch || undefined, 
				limit: 200 
			});
			if (isMounted) {
				donations = response.donations;
			}
		} catch (err) {
			console.error('Failed to load donations', err);
			if (isMounted) {
				toastStore.error(
					err instanceof Error ? err.message : 'Failed to load donations', 
					'Error'
				);
			}
		} finally {
			if (showLoading && isMounted) {
				donationsLoading = false;
			}
		}
	}

	async function handleResolveObligation(
		id: string,
		resolutionType: 'replacement' | 'waiver'
	): Promise<void> {
		try {
			await replacementObligationsAPI.resolveObligation(id, {
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

	async function updateAmountReplaced(): Promise<void> {
		if (!selectedObligation || editedAmountReplaced < 0) return;

		isUpdatingAmountReplaced = true;
		try {
			await replacementObligationsAPI.resolveObligation(selectedObligation.id, {
				resolutionType: 'replacement',
				amountPaid: editedAmountReplaced
			});
			await loadObligations();
			editingAmountReplacedId = null;
			toastStore.success('Amount replaced updated successfully', 'Success');
		} catch (err) {
			console.error('Failed to update amount replaced', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to update amount replaced', 'Error');
		} finally {
			isUpdatingAmountReplaced = false;
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
		newItemForm = { donorName: '', itemName: '', category: '', categoryId: '', specification: '', toolsOrEquipment: '', location: '', quantity: 1, unit: '', purpose: '', date: today, notes: '' };
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
				return 'bg-amber-100 text-amber-800';
			case 'replaced':
				return 'bg-cyan-100 text-cyan-800';
			case 'waived':
				return 'bg-slate-100 text-slate-700';
			default:
				return 'bg-gray-100 text-gray-700';
		}
	}

	function getRequestSummaryStatusClass(statuses: Set<string>): string {
		if (statuses.size === 1) {
			const [status] = [...statuses];
			return getObligationStatusClass(status);
		}

		if (statuses.has('pending')) {
			return 'bg-amber-100 text-amber-800';
		}

		return 'bg-slate-100 text-slate-700';
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

	function goToPage(page: number): void {
		let maxPages = totalPages;
		
		if (activeTab === 'donations') {
			maxPages = totalDonationsPages;
		} else if (activeTab === 'history') {
			maxPages = totalHistoryPages;
		} else if (replacementsView === 'by-request') {
			maxPages = totalRequestPages;
		}
		
		if (page >= 1 && page <= maxPages) {
			currentPage = page;
		}
	}

	// Reset to page 1 when filters or view changes
	$effect(() => {
		if (replacementsFilter || replacementsView || activeTab || historyFilter) {
			currentPage = 1;
		}
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Resource Management</h1>
		<p class="mt-1 text-sm text-gray-500">Track item donations, accountability obligations, and resolution records</p>
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
					<p class="mt-1 text-2xl font-semibold text-green-600 sm:mt-2 sm:text-3xl">{obligationCounts.replaced + obligationCounts.waived}</p>
					<p class="text-xs text-gray-500 mt-0.5">Replaced/waived</p>
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
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			<button
				onclick={() => (activeTab = 'replacements')}
				class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-6 sm:text-sm {activeTab === 'replacements'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				<span class="hidden sm:inline">Item Accountability</span>
				<span class="sm:hidden">Accountability</span>
				{#if obligationCounts.pending > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {activeTab === 'replacements' ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-600'}">{obligationCounts.pending}</span>
				{/if}
			</button>
			<button
				onclick={() => (activeTab = 'donations')}
				class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-6 sm:text-sm {activeTab === 'donations'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				Donations
			</button>
			<button
				onclick={() => (activeTab = 'history')}
				class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-6 sm:text-sm {activeTab === 'history'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				<span class="hidden sm:inline">Resolution Log</span>
				<span class="sm:hidden">History</span>
			</button>
		</nav>
	</div>

	<div class="bg-white rounded-lg shadow">

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
							<div class="py-12 text-center" style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
								<div>
									<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
									</svg>
									<h3 class="mt-4 text-lg font-medium text-gray-900">No donations yet</h3>
									<p class="mt-2 text-sm text-gray-500">Item donations from individuals or organizations will be recorded and tracked here.</p>
								</div>
							</div>
						{:else}
							<!-- Clean list view -->
							<div class="overflow-hidden rounded-lg bg-white shadow divide-y divide-gray-100" style="min-height: 600px;">
								{#each paginatedDonations as donation}
									<button
										onclick={() => selectedDonation = donation}
										class="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors sm:px-4 sm:py-3.5"
									>
										<!-- Icon -->
										<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:h-14 sm:w-14">
											<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>
											</svg>
										</div>

										<!-- Info -->
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{donation.itemName}</p>
											<p class="truncate text-xs text-gray-500">{donation.donorName}</p>
											<div class="mt-1 flex flex-wrap items-center gap-1">
												<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {donation.inventoryAction === 'new_item' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}">
													{donation.inventoryAction === 'new_item' ? 'New Item' : 'Added'}
												</span>
												<span class="text-[10px] text-gray-400">Qty: {donation.quantity.toLocaleString()}</span>
											</div>
										</div>

										<!-- Arrow -->
										<svg class="h-5 w-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
										</svg>
									</button>
								{/each}
							</div>

							<!-- Pagination -->
							{#if totalDonationsPages > 1}
								<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
									<p class="text-xs text-gray-600">
										Page <span class="font-semibold">{currentPage}</span> of <span class="font-semibold">{totalDonationsPages}</span>
									</p>
									<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
										<button
											onclick={() => goToPage(currentPage - 1)}
											disabled={currentPage === 1}
											class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Previous page"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
											</svg>
										</button>

										{#each Array(totalDonationsPages) as _, i}
											{#if Math.abs(i + 1 - currentPage) <= 1 || i + 1 === 1 || i + 1 === totalDonationsPages}
												<button
													onclick={() => goToPage(i + 1)}
													class="relative inline-flex items-center px-3 py-2 text-xs font-medium ring-1 ring-inset ring-gray-300 transition-colors {i + 1 === currentPage ? 'z-10 bg-pink-600 text-white ring-pink-600' : 'bg-white text-gray-900 hover:bg-gray-50'}"
													aria-current={i + 1 === currentPage ? 'page' : undefined}
												>
													{i + 1}
												</button>
											{:else if Math.abs(i + 1 - currentPage) === 2}
												<span class="relative inline-flex items-center px-3 py-2 text-xs text-gray-400 ring-1 ring-inset ring-gray-300">…</span>
											{/if}
										{/each}

										<button
											onclick={() => goToPage(currentPage + 1)}
											disabled={currentPage === totalDonationsPages}
											class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Next page"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
											</svg>
										</button>
									</nav>
								</div>
							{/if}
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
					</div>

					<!-- Inner filter tabs -->
					<div class="border-b border-gray-200 bg-white">
						<nav class="-mb-px flex overflow-x-auto" aria-label="Accountability filter" style="scrollbar-width: none; -ms-overflow-style: none;">
							{#each [
								{ key: 'all', label: 'All', count: obligationCounts.all },
								{ key: 'pending', label: 'Pending', count: obligationCounts.pending },
								{ key: 'replaced', label: 'Replaced', count: obligationCounts.replaced },
								{ key: 'waived', label: 'Waived', count: obligationCounts.waived }
							] as tab}
								<button
									onclick={() => (replacementsFilter = tab.key as typeof replacementsFilter)}
									class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm {replacementsFilter === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									<span class="truncate">{tab.label}</span>
									<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] {replacementsFilter === tab.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
										{tab.count}
									</span>
								</button>
							{/each}
						</nav>
					</div>

					<div class="inline-flex w-fit items-center rounded-lg border border-gray-200 bg-gray-50 p-1">
						<button
							onclick={() => (replacementsView = 'by-request')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm {replacementsView === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						>
							By Request
						</button>
						<button
							onclick={() => (replacementsView = 'by-item')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm {replacementsView === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
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
						<div class="rounded-lg border-2 border-dashed border-gray-200 py-14 text-center" style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
							<div>
								<svg class="mx-auto h-12 w-12 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<p class="mt-3 text-sm font-medium text-gray-700">{replacementsFilter === 'all' ? 'No obligations recorded.' : `No ${replacementsFilter} obligations.`}</p>
								<p class="mt-1 text-xs text-gray-500">Obligations from damage and missing incidents will appear here.</p>
							</div>
						</div>
					{:else if replacementsView === 'by-request'}
						<div class="space-y-4">
							<!-- Mobile card list - hidden on sm+ -->
							<div class="space-y-3 sm:hidden" style="min-height: 600px;">
								{#each requestSummaries as summary}
									<button
										onclick={() => { selectedSummary = summary; selectedSummaryItemIndex = 0; }}
										class="w-full rounded-xl border-l-4 {getRequestSummaryStatusClass(summary.statuses).includes('amber') ? 'border-amber-400' : getRequestSummaryStatusClass(summary.statuses).includes('slate') ? 'border-slate-400' : 'border-gray-300'} bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 transition-all active:bg-gray-50"
									>
										<div class="space-y-3">
											<!-- Header -->
											<div class="flex items-start justify-between gap-2">
												<div class="flex flex-col gap-1 flex-1 min-w-0">
													<span class="font-mono text-xs font-bold tracking-widest text-gray-900">{summary.requestCode}</span>
													<span class="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold {getRequestSummaryStatusClass(summary.statuses)}">
														{getRequestSummaryStatusLabel(summary.statuses)}
													</span>
												</div>
												<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
												</svg>
											</div>

											<!-- Student -->
											<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
												<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-[10px] font-semibold text-pink-700">
													{#if summary.studentProfilePhotoUrl}
														<img src={summary.studentProfilePhotoUrl} alt={summary.studentName} class="h-full w-full object-cover" loading="lazy" />
													{:else}
														{getInitials(summary.studentName)}
													{/if}
												</div>
												<div class="sm:ml-auto">
													<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getRequestSummaryStatusClass(summary.statuses)}">
														{getRequestSummaryStatusLabel(summary.statuses)}
													</span>
												</div>
												<div class="min-w-0 flex-1">
													<div class="truncate text-xs font-medium text-gray-900">{summary.studentName}</div>
													<div class="truncate text-[10px] text-gray-500">{summary.studentEmail}</div>
												</div>
											</div>

											<!-- Incidents & Meta -->
											<div class="flex flex-wrap items-center gap-1.5 text-[10px]">
												{#if summary.missingCount > 0}
													<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
														<span class="h-1 w-1 rounded-full bg-red-500"></span>
														{summary.missingCount} Missing
													</span>
												{/if}
												{#if summary.damagedCount > 0}
													<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800">
														<span class="h-1 w-1 rounded-full bg-rose-500"></span>
														{summary.damagedCount} Damaged
													</span>
												{/if}
												<span class="text-gray-400">· {summary.items} item{summary.items !== 1 ? 's' : ''}</span>
												<span class="text-gray-400">· Due: {new Date(summary.latestDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
											</div>
										</div>
									</button>
								{/each}
							</div>

							<!-- Desktop card list - hidden on mobile -->
							<div class="hidden space-y-4 sm:block" style="min-height: 600px;">
								{#each requestSummaries as summary}
										<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md border-l-4 {getRequestSummaryStatusClass(summary.statuses).includes('amber') ? 'border-amber-400' : getRequestSummaryStatusClass(summary.statuses).includes('slate') ? 'border-slate-400' : 'border-gray-300'}">
											<!-- Card Body -->
											<div class="p-4 sm:p-5">
												<!-- Header: Request Code + Status + Date -->
												<div class="flex items-start justify-between gap-3 mb-3">
													<div class="flex flex-col gap-1 flex-1 min-w-0">
														<div class="flex flex-wrap items-center gap-2">
															<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{summary.requestCode}</span>
															<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {getRequestSummaryStatusClass(summary.statuses)}">
																{getRequestSummaryStatusLabel(summary.statuses)}
															</span>
														</div>
														<time class="text-[11px] text-gray-400">
															Due: {new Date(summary.latestDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
														</time>
													</div>
												</div>

												<!-- Student Info -->
												<div class="mt-4 flex items-center gap-3">
													<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
														{#if summary.studentProfilePhotoUrl}
															<img src={summary.studentProfilePhotoUrl} alt={summary.studentName} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{getInitials(summary.studentName)}
														{/if}
													</div>
													<div class="min-w-0 flex-1">
														<div class="truncate text-sm font-medium text-gray-900">{summary.studentName}</div>
														<div class="truncate text-xs text-gray-500">{summary.studentEmail}</div>
													</div>
												</div>

												<!-- Incident Badges -->
												<div class="mt-4">
													<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Incidents</p>
													<div class="flex flex-wrap gap-1.5">
														{#if summary.missingCount > 0}
															<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
																<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
																{summary.missingCount} Missing
															</span>
														{/if}
														{#if summary.damagedCount > 0}
															<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
																<span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
																{summary.damagedCount} Damaged
															</span>
														{/if}
													</div>
												</div>

												<!-- Metadata -->
												<div class="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
													<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
													</svg>
													<span>{summary.items} item{summary.items !== 1 ? 's' : ''}</span>
												</div>
											</div>

											<!-- Card Footer -->
											<div class="flex justify-end border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
												<button
													onclick={() => { selectedSummary = summary; selectedSummaryItemIndex = 0; }}
													class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
												>
													View Details
													<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
													</svg>
												</button>
											</div>
										</div>
								{/each}
							</div>

							<!-- Pagination -->
							{#if totalRequestPages > 1}
								<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
									<p class="text-sm text-gray-700">
										Page <span class="font-medium">{currentPage}</span> of <span class="font-medium">{totalRequestPages}</span>
										<span class="text-gray-500">·</span>
										<span class="font-medium">{new Set(filteredObligations.map(o => o.borrowRequestId)).size}</span> total requests
									</p>
									<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
										<button
											onclick={() => goToPage(currentPage - 1)}
											disabled={currentPage === 1}
											class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Previous page"
										>
											<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
											</svg>
										</button>

										{#each Array(totalRequestPages) as _, i}
											{#if Math.abs(i + 1 - currentPage) <= 1 || i + 1 === 1 || i + 1 === totalRequestPages}
												<button
													onclick={() => goToPage(i + 1)}
													class="relative inline-flex items-center px-4 py-2 text-sm font-medium ring-1 ring-inset ring-gray-300 transition-colors {i + 1 === currentPage ? 'z-10 bg-pink-600 text-white ring-pink-600' : 'bg-white text-gray-900 hover:bg-gray-50'}"
													aria-current={i + 1 === currentPage ? 'page' : undefined}
												>
													{i + 1}
												</button>
											{:else if Math.abs(i + 1 - currentPage) === 2}
												<span class="relative inline-flex items-center px-4 py-2 text-sm text-gray-400 ring-1 ring-inset ring-gray-300">…</span>
											{/if}
										{/each}

										<button
											onclick={() => goToPage(currentPage + 1)}
											disabled={currentPage === totalRequestPages}
											class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Next page"
										>
											<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
											</svg>
										</button>
									</nav>
								</div>
							{/if}
						</div>
					{:else}
						<div class="space-y-4">
							<!-- Mobile/All screens list -->
							<div class="overflow-hidden rounded-lg bg-white shadow divide-y divide-gray-100" style="min-height: 600px;">
								{#each paginatedObligations as obligation}
									<button
										onclick={() => selectedObligation = obligation}
										class="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors sm:px-4 sm:py-3.5"
									>
										<!-- Student Avatar -->
										<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 sm:h-14 sm:w-14">
											{#if obligation.studentProfilePhotoUrl}
												<img src={obligation.studentProfilePhotoUrl} alt={obligation.studentName || 'Student'} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{getInitials(obligation.studentName || 'Unknown Student')}
											{/if}
										</div>

										<!-- Info -->
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{obligation.studentName || 'Unknown Student'}</p>
											<p class="truncate text-xs text-gray-500">{obligation.itemName}</p>
											<div class="mt-1 flex flex-wrap items-center gap-1">
												<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {obligation.type === 'missing' ? 'bg-red-100 text-red-800' : 'bg-rose-100 text-rose-800'}">
													{obligation.type === 'missing' ? 'Missing' : 'Damaged'}
												</span>
												<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {getObligationStatusClass(obligation.status)}">
													{obligation.status.charAt(0).toUpperCase() + obligation.status.slice(1)}
												</span>
											</div>
										</div>

										<!-- Arrow -->
										<svg class="h-5 w-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
										</svg>
									</button>
								{/each}
							</div>

							<!-- Pagination -->
							{#if totalPages > 1}
								<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
									<p class="text-xs text-gray-600">
										Page <span class="font-semibold">{currentPage}</span> of <span class="font-semibold">{totalPages}</span>
									</p>
									<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
										<button
											onclick={() => goToPage(currentPage - 1)}
											disabled={currentPage === 1}
											class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Previous page"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
											</svg>
										</button>

										{#each Array(totalPages) as _, i}
											{#if Math.abs(i + 1 - currentPage) <= 1 || i + 1 === 1 || i + 1 === totalPages}
												<button
													onclick={() => goToPage(i + 1)}
													class="relative inline-flex items-center px-3 py-2 text-xs font-medium ring-1 ring-inset ring-gray-300 transition-colors {i + 1 === currentPage ? 'z-10 bg-pink-600 text-white ring-pink-600' : 'bg-white text-gray-900 hover:bg-gray-50'}"
													aria-current={i + 1 === currentPage ? 'page' : undefined}
												>
													{i + 1}
												</button>
											{:else if Math.abs(i + 1 - currentPage) === 2}
												<span class="relative inline-flex items-center px-3 py-2 text-xs text-gray-400 ring-1 ring-inset ring-gray-300">…</span>
											{/if}
										{/each}

										<button
											onclick={() => goToPage(currentPage + 1)}
											disabled={currentPage === totalPages}
											class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
											aria-label="Next page"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
											</svg>
										</button>
									</nav>
								</div>
							{/if}
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
							class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
							</svg>
							Export to CSV
						</button>
					</div>

					<!-- History sub-filter tabs -->
					<div class="border-b border-gray-200 bg-white">
						<nav class="-mb-px flex overflow-x-auto" aria-label="History filter" style="scrollbar-width: none; -ms-overflow-style: none;">
							{#each [
								{ key: 'all', label: 'All', count: historyCounts.all },
								{ key: 'resolved', label: 'Resolved', count: historyCounts.resolved },
								{ key: 'waived', label: 'Waived', count: historyCounts.waived }
							] as tab}
								<button
									onclick={() => (historyFilter = tab.key as typeof historyFilter)}
									class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm {historyFilter === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									<span class="truncate">{tab.label}</span>
									<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] {historyFilter === tab.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
										{tab.count}
									</span>
								</button>
							{/each}
						</nav>
					</div>

					{#if filteredPaymentHistory.length === 0}
						<div class="rounded-lg border-2 border-dashed border-gray-200 py-14 text-center" style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
							<div>
								<svg class="mx-auto h-12 w-12 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
								</svg>
								<p class="mt-3 text-sm font-medium text-gray-700">{historyFilter === 'all' ? 'No resolution records yet.' : `No ${historyFilter} records.`}</p>
								<p class="mt-1 text-xs text-gray-500">Resolved obligations will appear here once closed.</p>
							</div>
						</div>
					{:else}
						<!-- Clean list view -->
						<div class="overflow-hidden rounded-lg bg-white shadow divide-y divide-gray-100" style="min-height: 600px;">
							{#each paginatedHistory as transaction}
								<button
									onclick={() => printReceipt(transaction.receiptNumber)}
									class="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors sm:px-4 sm:py-3.5"
								>
									<!-- Icon -->
									<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full {transaction.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'} sm:h-14 sm:w-14">
										<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											{#if transaction.status === 'resolved'}
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
											{:else}
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
											{/if}
										</svg>
									</div>

									<!-- Info -->
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900">{transaction.name}</p>
										<p class="truncate text-xs text-gray-500">{transaction.receiptNumber}</p>
										<div class="mt-1 flex flex-wrap items-center gap-1">
											<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {transaction.resolutionType === 'replacement' ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-700'}">
												{transaction.resolutionType === 'replacement' ? 'Replaced' : 'Waived'}
											</span>
										</div>
									</div>

									<!-- Arrow -->
									<svg class="h-5 w-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
									</svg>
								</button>
							{/each}
						</div>

						<!-- Pagination -->
						{#if totalHistoryPages > 1}
							<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
								<p class="text-xs text-gray-600">
									Page <span class="font-semibold">{currentPage}</span> of <span class="font-semibold">{totalHistoryPages}</span>
								</p>
								<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
									<button
										onclick={() => goToPage(currentPage - 1)}
										disabled={currentPage === 1}
										class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										aria-label="Previous page"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
										</svg>
									</button>

									{#each Array(totalHistoryPages) as _, i}
										{#if Math.abs(i + 1 - currentPage) <= 1 || i + 1 === 1 || i + 1 === totalHistoryPages}
											<button
												onclick={() => goToPage(i + 1)}
												class="relative inline-flex items-center px-3 py-2 text-xs font-medium ring-1 ring-inset ring-gray-300 transition-colors {i + 1 === currentPage ? 'z-10 bg-pink-600 text-white ring-pink-600' : 'bg-white text-gray-900 hover:bg-gray-50'}"
												aria-current={i + 1 === currentPage ? 'page' : undefined}
											>
												{i + 1}
											</button>
										{:else if Math.abs(i + 1 - currentPage) === 2}
											<span class="relative inline-flex items-center px-3 py-2 text-xs text-gray-400 ring-1 ring-inset ring-gray-300">…</span>
										{/if}
									{/each}

									<button
										onclick={() => goToPage(currentPage + 1)}
										disabled={currentPage === totalHistoryPages}
										class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										aria-label="Next page"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
										</svg>
									</button>
								</nav>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
			{/if}
		</div>
	</div>
</div>

<!-- Request Summary Detail Modal -->
{#if selectedSummary}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={() => selectedSummary = null} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">

				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
								<svg class="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="summary-modal-title" class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Request Summary</h2>
								<p class="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-pink-600">{selectedSummary.requestCode}</p>
								<p class="mt-1 text-xs text-gray-500">{selectedSummary.items} item{selectedSummary.items !== 1 ? 's' : ''}</p>
							</div>
						</div>
						<button 
							onclick={() => selectedSummary = null}
							aria-label="Close modal"
							class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">

						<!-- Student Info Card -->
						<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 sm:p-6">
							<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200">
										{#if selectedSummary.studentProfilePhotoUrl}
											<img src={selectedSummary.studentProfilePhotoUrl} alt={selectedSummary.studentName} class="h-full w-full object-cover" />
										{:else}
											<span class="text-base sm:text-lg">{getInitials(selectedSummary.studentName)}</span>
										{/if}
									</div>
									<div>
										<p class="text-base font-semibold text-gray-900">{selectedSummary.studentName}</p>
										<p class="mt-0.5 text-sm text-gray-500">{selectedSummary.studentEmail}</p>
									</div>
								</div>
								<div class="sm:ml-auto">
									<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-inset {getRequestSummaryStatusClass(selectedSummary.statuses)}">
										<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
										{getRequestSummaryStatusLabel(selectedSummary.statuses)}
									</span>
								</div>
							</div>
						</div>

					<!-- Item selector dropdown -->
					{#if selectedSummaryItems.length > 0}
						<div>
							<label for="summary-item-select" class="block text-sm font-semibold text-gray-700 mb-2">Select Item</label>
							<select
								id="summary-item-select"
								bind:value={selectedSummaryItemIndex}
								class="block w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-colors focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
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
						<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 sm:p-6 space-y-4">
							<div class="flex items-center justify-between pb-3 border-b border-gray-200">
								<span class="text-sm font-semibold text-gray-700">Item Details</span>
								<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset {selectedSummaryItem.type === 'missing' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{selectedSummaryItem.type === 'missing' ? 'Missing' : 'Damaged'}
								</span>
							</div>
							
							<div class="grid grid-cols-2 gap-4 text-sm">
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
									<span class="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset {getObligationStatusClass(selectedSummaryItem.status)}">
										<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
										{selectedSummaryItem.status.charAt(0).toUpperCase() + selectedSummaryItem.status.slice(1)}
									</span>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</p>
									<p class="mt-1.5 font-semibold text-gray-900">{new Date(selectedSummaryItem.dueDate).toLocaleDateString()}</p>
								</div>
							</div>
						</div>

						<!-- Replacement Details -->
						<div class="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
							<div class="bg-gradient-to-r from-gray-50 to-white px-5 py-3 border-b border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900">Replacement Information</h3>
							</div>
							<div class="divide-y divide-gray-100">
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm text-gray-600">Item Name</span>
									<span class="font-semibold text-gray-900">{selectedSummaryItem.itemName}</span>
								</div>
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm text-gray-600">Quantity Required</span>
									<span class="font-semibold text-gray-900">{selectedSummaryItem.quantity}</span>
								</div>
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm text-gray-600">Due Date</span>
									<span class="font-semibold text-gray-900">{new Date(selectedSummaryItem.dueDate).toLocaleDateString()}</span>
								</div>
							</div>
						</div>

						<!-- Actions for selected item -->
						{#if selectedSummaryItem.status === 'pending'}
							<div class="flex flex-col gap-3 pt-2 sm:flex-row">
								<button
									onclick={async () => {
										const confirmed = await confirmStore.confirm({ type: 'info', title: 'Mark as Replaced', message: 'Mark this item as replaced by the student?', confirmText: 'Mark Replaced' });
										if (confirmed) {
											await handleResolveObligation(selectedSummaryItem!.id, 'replacement');
											selectedSummary = null;
										}
									}}
									class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-95 sm:flex-1"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
									</svg>
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
									class="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 active:scale-95 sm:w-auto"
								>
									Waive
								</button>
							</div>
						{/if}
					{/if}

					<!-- Request totals -->
					<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
						<div class="flex items-center gap-3 mb-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
								<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
								</svg>
							</div>
							<h3 class="text-sm font-bold text-gray-900 uppercase tracking-wide">Request Summary</h3>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-gray-700">Total Items</span>
							<span class="text-2xl font-bold text-gray-900">{selectedSummary.items}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8">
				<div class="flex justify-end">
					<button
						onclick={() => selectedSummary = null}
						class="rounded-xl border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 active:scale-95"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
{/if}

<!-- Record Donation Modal -->
{#if showDonationModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="donation-modal-title">
		<button type="button" class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => { if (!donationSubmitting) { showDonationModal = false; resetDonationForms(); } }} aria-label="Close modal" tabindex="-1"></button>
		<div class="relative z-50 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">

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
				<div class="border-b border-gray-200 px-4 pt-4 pb-3 sm:px-6">
					<div class="inline-flex w-full flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 sm:w-auto sm:flex-row">
						<button onclick={() => donationMode = 'new_item'}
							class="rounded-md px-4 py-2 text-sm font-medium transition-colors {donationMode === 'new_item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'} sm:flex-1">
							<span class="flex items-center gap-2">
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
								New Inventory Item
							</span>
						</button>
						<button onclick={() => donationMode = 'add_to_existing'}
							class="rounded-md px-4 py-2 text-sm font-medium transition-colors {donationMode === 'add_to_existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'} sm:flex-1">
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
				<div class="flex-1 overflow-y-auto px-4 py-5 space-y-4 sm:px-6">
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
							<span id="inventory-item-label" class="block text-sm font-medium text-gray-700 mb-1">Inventory Item <span class="text-red-500">*</span></span>
							<div class="relative mb-2">
								<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
								<input type="search" bind:value={inventorySearch} placeholder="Search items…"
									class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
							</div>
							<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100" role="listbox" aria-labelledby="inventory-item-label">
								{#if filteredInventoryItems.length === 0}
									<p class="py-6 text-center text-sm text-gray-400">No items found.</p>
								{:else}
									{#each filteredInventoryItems as item}
										<button type="button" onclick={() => addToExistingForm.inventoryItemId = item.id}
											class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors {addToExistingForm.inventoryItemId === item.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}">
											<div>
												<p class="text-sm font-medium text-gray-900">{item.name}</p>
												<p class="text-xs text-gray-500">{item.category}</p>
											</div>
											<div class="text-right shrink-0 ml-4">
												<p class="text-sm font-semibold text-gray-700">{getInventoryCurrentStock(item).toLocaleString()}</p>
												<p class="text-xs text-gray-400">in stock</p>
											</div>
										</button>
									{/each}
								{/if}
							</div>
							{#if selectedInventoryItem}
								<div class="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
									<svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
									Selected: <span class="font-semibold">{selectedInventoryItem.name}</span> — current stock: {getInventoryCurrentStock(selectedInventoryItem)}
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="ae-qty" class="block text-sm font-medium text-gray-700 mb-1">Quantity to Add <span class="text-red-500">*</span></label>
								<input id="ae-qty" type="number" bind:value={addToExistingForm.quantity} min="1" step="1"
									class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
								{#if selectedInventoryItem}
									<p class="mt-1 text-xs text-gray-400">New total: {(getInventoryCurrentStock(selectedInventoryItem) + (addToExistingForm.quantity || 0)).toLocaleString()}</p>
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
				<div class="flex flex-col-reverse gap-3 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
					<button onclick={() => { if (!donationSubmitting) { showDonationModal = false; resetDonationForms(); } }} disabled={donationSubmitting}
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors disabled:opacity-50 sm:w-auto">
						Cancel
					</button>
					<button onclick={handleAddDonation} disabled={donationSubmitting || inventoryLoading}
						class="inline-flex w-full items-center justify-center gap-2 rounded-lg {donationMode === 'new_item' ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'} px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors disabled:opacity-60 sm:w-auto">
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
{/if}

<!-- Add Quantity Modal -->
{#if showAddQuantityModal && selectedDonationForQty}
	<div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-qty-modal-title">
		<button type="button" class="fixed inset-0 -z-10" onclick={() => { if (!addQtySubmitting) { showAddQuantityModal = false; selectedDonationForQty = null; } }} aria-label="Close modal" tabindex="-1"></button>
		<div class="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">

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
				<div class="flex-1 overflow-y-auto px-4 py-5 space-y-4 sm:px-6">
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
				<div class="flex flex-col-reverse gap-3 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
					<button
						onclick={() => { if (!addQtySubmitting) { showAddQuantityModal = false; selectedDonationForQty = null; } }}
						disabled={addQtySubmitting}
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors disabled:opacity-50 sm:w-auto"
					>
						Cancel
					</button>
					<button
						onclick={handleAddQuantity}
						disabled={addQtySubmitting}
						class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-60 sm:w-auto"
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
{/if}

<!-- Obligation Detail Modal -->
{#if selectedObligation}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={() => {
			selectedObligation = null;
			editingAmountReplacedId = null;
		}} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">

				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-500/30">
								<svg class="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="obligation-modal-title" class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Obligation Details</h2>
								<p class="mt-0.5 text-xs sm:text-sm font-medium text-gray-600">{selectedObligation.itemName}</p>
								<p class="mt-0.5 text-xs text-gray-500">{selectedObligation.studentName || 'Unknown Student'}</p>
							</div>
						</div>
						<button 
							onclick={() => {
								selectedObligation = null;
								editingAmountReplacedId = null;
							}}
							aria-label="Close modal"
							class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">

						<!-- Student Info Card -->
						<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 sm:p-6">
							<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200">
										{#if selectedObligation.studentProfilePhotoUrl}
											<img src={selectedObligation.studentProfilePhotoUrl} alt={selectedObligation.studentName || ''} class="h-full w-full object-cover" />
										{:else}
											<span class="text-base sm:text-lg">{getInitials(selectedObligation.studentName || 'Unknown Student')}</span>
										{/if}
									</div>
									<div>
										<p class="text-base font-semibold text-gray-900">{selectedObligation.studentName || 'Unknown Student'}</p>
										<p class="mt-0.5 text-sm text-gray-500">{selectedObligation.studentEmail || 'N/A'}</p>
									</div>
								</div>
								<div class="sm:ml-auto">
									<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-inset {getObligationStatusClass(selectedObligation.status)}">
										<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
										{selectedObligation.status.charAt(0).toUpperCase() + selectedObligation.status.slice(1)}
									</span>
								</div>
							</div>
						</div>

						<!-- Details Card -->
						<div class="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
							<div class="bg-gradient-to-r from-gray-50 to-white px-5 py-3 border-b border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900">Obligation Information</h3>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5">
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Item Name</p>
									<p class="font-semibold text-gray-900">{selectedObligation.itemName}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Replacement Quantity</p>
									<p class="font-semibold text-gray-900">{selectedObligation.amount}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Original Borrowed Qty</p>
									<p class="font-semibold text-gray-900">{selectedObligation.quantity}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Amount Replaced</p>
									{#if editingAmountReplacedId === selectedObligation.id}
										<div class="flex items-center gap-2">
											<input
												type="number"
												min="0"
												max={selectedObligation.amount}
												bind:value={editedAmountReplaced}
												placeholder="0"
												class="w-24 rounded-lg border-2 border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
												disabled={isUpdatingAmountReplaced}
											/>
											<button
												onclick={updateAmountReplaced}
												disabled={isUpdatingAmountReplaced}
												class="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-all active:scale-95"
											>
												{isUpdatingAmountReplaced ? 'Saving...' : 'Save'}
											</button>
											<button
												onclick={() => editingAmountReplacedId = null}
												disabled={isUpdatingAmountReplaced}
												class="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-all active:scale-95"
											>
												Cancel
											</button>
										</div>
									{:else}
										<div class="flex items-center justify-between">
											<p class="font-semibold text-gray-900">{selectedObligation.amountPaid}</p>
											{#if selectedObligation.status === 'pending'}
												<button
													onclick={() => {
														editingAmountReplacedId = selectedObligation!.id;
														editedAmountReplaced = selectedObligation!.amountPaid;
													}}
													class="text-xs text-blue-600 hover:text-blue-700 font-semibold focus:outline-none hover:underline"
												>
													Edit
												</button>
											{/if}
										</div>
									{/if}
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Type</p>
									<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset {selectedObligation.type === 'missing' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}">
										<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
										{selectedObligation.type === 'missing' ? 'Missing' : 'Damaged'}
									</span>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Due Date</p>
									<p class="font-semibold text-gray-900">{new Date(selectedObligation.dueDate).toLocaleDateString()}</p>
								</div>
							</div>
						</div>

						<!-- Actions -->
						{#if selectedObligation.status === 'pending'}
							<div class="flex flex-col gap-3 pt-2 sm:flex-row">
								<button
									onclick={async () => {
										const confirmed = await confirmStore.confirm({ type: 'info', title: 'Mark as Replaced', message: 'Mark this item as replaced by the student?', confirmText: 'Mark Replaced' });
										if (confirmed) {
											await handleResolveObligation(selectedObligation!.id, 'replacement');
											selectedObligation = null;
										}
									}}
									class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-95 sm:flex-1"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
									</svg>
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
									class="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 active:scale-95 sm:w-auto"
								>
									Waive
								</button>
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8">
					<div class="flex justify-end">
						<button
							onclick={() => {
								selectedObligation = null;
								editingAmountReplacedId = null;
							}}
							class="rounded-xl border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 active:scale-95"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Donation Detail Modal -->
{#if selectedDonation}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={() => selectedDonation = null} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">

				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
								<svg class="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="donation-modal-title" class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Donation Details</h2>
								<p class="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-emerald-600">{selectedDonation.receiptNumber}</p>
							</div>
						</div>
						<button 
							onclick={() => selectedDonation = null}
							aria-label="Close modal"
							class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">

						<!-- Item Info Card -->
						<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 sm:p-6">
							<div class="flex items-start gap-4">
								<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 ring-2 ring-emerald-200">
									<svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>
									</svg>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-lg font-bold text-gray-900">{selectedDonation.itemName}</p>
									<p class="mt-1 text-sm text-gray-600">Donated by <span class="font-semibold text-gray-900">{selectedDonation.donorName}</span></p>
									<div class="mt-3 flex flex-wrap items-center gap-2">
										<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset {selectedDonation.inventoryAction === 'new_item' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-blue-50 text-blue-700 ring-blue-200'}">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{selectedDonation.inventoryAction === 'new_item' ? 'New Item' : 'Added to Existing'}
										</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Details Card -->
						<div class="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
							<div class="bg-gradient-to-r from-gray-50 to-white px-5 py-3 border-b border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900">Donation Information</h3>
							</div>
							<div class="divide-y divide-gray-100">
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm font-medium text-gray-600">Quantity</span>
									<span class="text-base font-bold text-gray-900">{selectedDonation.quantity.toLocaleString()}{selectedDonation.unit ? ` ${selectedDonation.unit}` : ''}</span>
								</div>
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm font-medium text-gray-600">Date Received</span>
									<span class="text-base font-semibold text-gray-900">{selectedDonation.date}</span>
								</div>
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm font-medium text-gray-600">Purpose</span>
									<span class="text-base font-semibold text-gray-900">{selectedDonation.purpose}</span>
								</div>
								<div class="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<span class="text-sm font-medium text-gray-600">Receipt Number</span>
									<span class="font-mono text-sm font-bold text-gray-900">{selectedDonation.receiptNumber}</span>
								</div>
							</div>
						</div>

						{#if selectedDonation.notes}
							<div class="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
								<div class="flex items-start gap-3">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
										<svg class="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
										</svg>
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-xs font-bold text-blue-900 uppercase tracking-wide mb-1">Notes</p>
										<p class="text-sm font-medium text-blue-800">{selectedDonation.notes}</p>
									</div>
								</div>
							</div>
						{/if}

						<!-- Actions -->
						<div class="flex flex-col gap-3 pt-2 sm:flex-row">
							<button
								onclick={(e) => { e.stopPropagation(); openAddQuantityModal(selectedDonation!); selectedDonation = null; }}
								class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 sm:flex-1"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
								</svg>
								Add Quantity
							</button>
							<button
								onclick={(e) => { e.stopPropagation(); printReceipt(selectedDonation!.receiptNumber); }}
								class="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-emerald-100 px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition-all hover:from-emerald-100 hover:to-emerald-200 hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-95 sm:flex-1"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
								</svg>
								Print Receipt
							</button>
						</div>
						
						<button
							onclick={async (e) => {
								e.stopPropagation();
								const confirmed = await confirmStore.danger(
									`Delete donation ${selectedDonation!.receiptNumber} (${selectedDonation!.itemName}) from ${selectedDonation!.donorName}? This cannot be undone.`,
									'Delete Donation',
									'Delete'
								);
								if (!confirmed) return;
								try {
									await donationsAPI.delete(selectedDonation!.id);
									await loadDonations();
									toastStore.success('Donation deleted successfully', 'Deleted');
									selectedDonation = null;
								} catch (err) {
									toastStore.error(err instanceof Error ? err.message : 'Failed to delete donation', 'Error');
								}
							}}
							class="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 bg-gradient-to-r from-red-50 to-red-100 px-5 py-3 text-sm font-semibold text-red-700 shadow-sm transition-all hover:from-red-100 hover:to-red-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-95"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
							</svg>
							Delete Donation
						</button>
					</div>
				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8">
					<div class="flex justify-end">
						<button
							onclick={() => selectedDonation = null}
							class="rounded-xl border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 active:scale-95"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
