<script lang="ts">
	import { onMount } from 'svelte';
	import {
		borrowRequestsAPI,
		type BorrowRequestRealtimeEvent,
		type BorrowRequestRecord
	} from '$lib/api/borrowRequests';
	import { catalogAPI } from '$lib/api/catalog';
	import { financialObligationsAPI } from '$lib/api/financialObligations';
	import { confirmStore } from '$lib/stores/confirm';
	import { toastStore } from '$lib/stores/toast';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import { ClipboardX } from 'lucide-svelte';

	type LoanFilter = 'all' | 'overdue' | 'due-soon' | 'on-track' | 'return-initiated' | 'unresolved';
	type LoanSort = 'urgent' | 'due-date' | 'latest-borrowed';
	type ViewMode = 'by-request' | 'by-item';
	type ItemOperationalStatus = 'in-use' | 'return-in-progress' | 'returned' | 'damaged' | 'missing' | 'replaced' | 'payable' | 'paid' | 'unresolved-damaged' | 'unresolved-missing';

	interface LoanCard {
		id: string;
		requestCode: string;
		items: BorrowRequestRecord['items'];
		borrowDate: string;
		returnDate: string;
		status: BorrowRequestRecord['status'];
		isOverdue: boolean;
		isDueSoon: boolean;
		daysDelta: number;
		loanPeriodDays: number;
		remainingProgress: number;
		purpose: string;
		instructorName: string;
		returnedItems: number;
		damagedItems: number;
		missingItems: number;
		hasUnresolvedIssue: boolean;
		unresolvedItems: number;
	}

	interface ItemRow {
		requestId: string;
		requestCode: string;
		itemName: string;
		quantity: number;
		borrowDate: string;
		returnDate: string;
		instructorName: string;
		status: ItemOperationalStatus;
		settlementLabel: string;
		isOverdue: boolean;
		daysDelta: number;
		hasUnresolvedIssue: boolean;
		picture?: string | null;
	}

	let isLoading = $state(true);
	let actionLoadingId = $state<string | null>(null);
	let search = $state('');
	let viewMode = $state<ViewMode>('by-request');
	let selectedLoan = $state<LoanCard | null>(null);
	let hasShownOverdueModal = $state(false);
	let selectedFilter = $state<LoanFilter>('all');
	let sortBy = $state<LoanSort>('urgent');
	let loans = $state<LoanCard[]>([]);
	let liveSyncActive = $state(false);

	let refreshInFlight = false;
	let pendingRefresh = false;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let unresolvedRequestIds = $state<Set<string>>(new Set());
	let unresolvedItemKeys = $state<Set<string>>(new Set());
	let itemPictureCache = $state<Map<string, string>>(new Map());
	let lastLoadError = '';

	function buildIssueKey(requestId: string, itemId: string): string {
		return `${requestId}:${itemId}`;
	}

	function formatRequestCode(id: string): string {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	function inferItemIcon(itemName: string): string {
		const normalized = itemName.toLowerCase();
		if (normalized.includes('knife')) return '🔪';
		if (normalized.includes('bowl')) return '🥣';
		if (normalized.includes('scale')) return '⚖️';
		if (normalized.includes('mixer')) return '🎛️';
		if (normalized.includes('processor')) return '🔧';
		return '📦';
	}

	function toLoanCard(request: BorrowRequestRecord): LoanCard {
		const now = new Date();
		const borrow = new Date(request.borrowDate);
		const due = new Date(request.returnDate);

		const msPerDay = 1000 * 60 * 60 * 24;
		const loanPeriodDays = Math.max(1, Math.ceil((due.getTime() - borrow.getTime()) / msPerDay));
		const daysDelta = Math.ceil((due.getTime() - now.getTime()) / msPerDay);
		const isOverdue = daysDelta < 0;
		const isDueSoon = daysDelta >= 0 && daysDelta <= 2;

		const elapsedDays = Math.max(0, Math.ceil((now.getTime() - borrow.getTime()) / msPerDay));
		const remainingProgress = Math.max(0, Math.min(100, Math.round(((loanPeriodDays - elapsedDays) / loanPeriodDays) * 100)));

		const returnedItems = request.items.filter((item) => item.inspection?.status === 'good').length;
		const damagedItems = request.items.filter((item) => item.inspection?.status === 'damaged').length;
		const missingItems = request.items.filter((item) => item.inspection?.status === 'missing').length;
		const unresolvedItems = request.items.filter((item) =>
			unresolvedItemKeys.has(buildIssueKey(request.id, item.itemId))
		).length;

		return {
			id: request.id,
			requestCode: formatRequestCode(request.id),
			items: request.items,
			borrowDate: request.borrowDate,
			returnDate: request.returnDate,
			status: request.status,
			isOverdue,
			isDueSoon,
			daysDelta,
			loanPeriodDays,
			remainingProgress,
			purpose: request.purpose,
			instructorName: request.instructor?.fullName || 'Assigned Instructor',
			returnedItems,
			damagedItems,
			missingItems,
			hasUnresolvedIssue: unresolvedRequestIds.has(request.id),
			unresolvedItems
		};
	}

	function getItemStatus(item: BorrowRequestRecord['items'][number], loan: LoanCard): ItemOperationalStatus {
		const notes = (item.inspection?.notes || '').toLowerCase();
		const hasUnresolvedIssue = unresolvedItemKeys.has(buildIssueKey(loan.id, item.itemId));
		if (notes.includes('paid')) return 'paid';
		if (notes.includes('replaced')) return 'replaced';
		if (hasUnresolvedIssue && item.inspection?.status === 'damaged') return 'unresolved-damaged';
		if (hasUnresolvedIssue && item.inspection?.status === 'missing') return 'unresolved-missing';
		if (item.inspection?.status === 'good') return 'returned';
		if (item.inspection?.status === 'damaged' && (notes.includes('pay') || notes.includes('charge'))) return 'payable';
		if (item.inspection?.status === 'damaged') return 'damaged';
		if (item.inspection?.status === 'missing' && (notes.includes('pay') || notes.includes('charge'))) return 'payable';
		if (item.inspection?.status === 'missing') return 'missing';
		if (loan.status === 'pending_return') return 'return-in-progress';
		return 'in-use';
	}

	function getItemStatusLabel(status: ItemOperationalStatus): string {
		if (status === 'returned') return 'Returned';
		if (status === 'unresolved-damaged') return 'Damaged';
		if (status === 'unresolved-missing') return 'Missing';
		if (status === 'damaged') return 'Damaged';
		if (status === 'missing') return 'Missing';
		if (status === 'replaced') return 'Replaced';
		if (status === 'payable') return 'Payable';
		if (status === 'paid') return 'Paid';
		if (status === 'return-in-progress') return 'Return in Progress';
		return 'In Use';
	}

	function getItemStatusClasses(status: ItemOperationalStatus): string {
		if (status === 'returned') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
		if (status === 'unresolved-damaged') return 'bg-rose-100 text-rose-700 ring-rose-200';
		if (status === 'unresolved-missing') return 'bg-red-100 text-red-700 ring-red-200';
		if (status === 'damaged') return 'bg-amber-100 text-amber-700 ring-amber-200';
		if (status === 'missing') return 'bg-red-100 text-red-700 ring-red-200';
		if (status === 'replaced') return 'bg-cyan-100 text-cyan-700 ring-cyan-200';
		if (status === 'payable') return 'bg-orange-100 text-orange-700 ring-orange-200';
		if (status === 'paid') return 'bg-green-100 text-green-700 ring-green-200';
		if (status === 'return-in-progress') return 'bg-slate-100 text-slate-700 ring-slate-200';
		return 'bg-blue-100 text-blue-700 ring-blue-200';
	}

	function getSettlementLabel(item: BorrowRequestRecord['items'][number], requestId: string): string {
		const isUnresolved = unresolvedItemKeys.has(buildIssueKey(requestId, item.itemId));
		if (isUnresolved) return 'Open incident case';
		if (item.inspection?.status === 'good') return 'No charge';
		if (item.inspection?.status === 'damaged' || item.inspection?.status === 'missing') {
			return item.inspection.unitPrice ? `Charge review: ${item.inspection.unitPrice.toLocaleString()}` : 'Charge review';
		}
		return 'Not assessed';
	}

	async function loadBorrowedItems(forceRefresh = false): Promise<void> {
		const shouldShowLoading = loans.length === 0;
		if (shouldShowLoading) {
			isLoading = true;
		}

		try {
			const [requestResponse, obligationResponse] = await Promise.all([
				borrowRequestsAPI.list(
					{
						statuses: ['borrowed', 'pending_return', 'missing'],
						sortBy: 'returnDate',
						page: 1,
						limit: 100
					},
					{ forceRefresh }
				),
				financialObligationsAPI.getObligations(
					{ status: 'pending', limit: 200 },
					{ forceRefresh }
				)
			]);

			const nextUnresolvedRequestIds = new Set(obligationResponse.obligations.map((obligation) => obligation.borrowRequestId));
			const nextUnresolvedItemKeys = new Set(
				obligationResponse.obligations.map((obligation) => buildIssueKey(obligation.borrowRequestId, obligation.itemId))
			);
			unresolvedRequestIds = nextUnresolvedRequestIds;
			unresolvedItemKeys = nextUnresolvedItemKeys;

			const requests = requestResponse.requests;

			loans = requests
				.filter((request) => request.status === 'borrowed' || request.status === 'pending_return' || (request.status === 'missing' && nextUnresolvedRequestIds.has(request.id)))
				.map(toLoanCard);
			lastLoadError = '';

			await backfillItemPictures();
			syncSelectedLoan();

			const overdueCount = loans.filter((loan) => loan.isOverdue).length;
			if (overdueCount > 0 && !hasShownOverdueModal) {
				hasShownOverdueModal = true;
				void confirmStore.warning(
					`You currently have ${overdueCount} overdue loan${overdueCount > 1 ? 's' : ''}. Please initiate return and proceed to the custodian desk.`,
					'Immediate Attention Required',
					'Understood',
					'Later'
				);
			}
		} catch (error) {
			console.error('Failed to load borrowed items', error);
			const message = error instanceof Error ? error.message : 'Unable to load borrowed items.';
			if (message !== lastLoadError) {
				toastStore.error(message, 'Borrowed Items');
				lastLoadError = message;
			}
		} finally {
			isLoading = false;
		}
	}

	function openLoanDetails(loan: LoanCard): void {
		selectedLoan = loan;
	}

	function closeLoanDetails(): void {
		selectedLoan = null;
	}

	function syncSelectedLoan(): void {
		if (!selectedLoan) return;
		const fresh = loans.find((loan) => loan.id === selectedLoan?.id);
		selectedLoan = fresh ?? null;
	}

	async function backfillItemPictures(): Promise<void> {
		const missingIds = new Set<string>();

		for (const loan of loans) {
			for (const item of loan.items) {
				if (item.itemId && !item.picture && !itemPictureCache.has(item.itemId)) {
					missingIds.add(item.itemId);
				}
			}
		}

		if (missingIds.size === 0) return;

		try {
			const response = await catalogAPI.getCatalog({ availability: 'all', limit: 300 });
			const next = new Map(itemPictureCache);

			for (const catalogItem of response.items) {
				if (missingIds.has(catalogItem.id) && catalogItem.picture) {
					next.set(catalogItem.id, catalogItem.picture);
				}
			}

			itemPictureCache = next;
		} catch {
			// Fall back gracefully to icon-only rendering if catalog images are unavailable.
		}
	}

	async function initiateReturn(loan: LoanCard): Promise<void> {
		actionLoadingId = loan.id;

		try {
			await borrowRequestsAPI.initiateReturn(loan.id);
			toastStore.success(
				`${loan.requestCode} marked for return. Please proceed to the custodian for handover.`,
				'Return Initiated'
			);
			await loadBorrowedItems(true);
		} catch (error) {
			toastStore.error(
				error instanceof Error ? error.message : 'Failed to initiate return.',
				'Return Initiation Failed'
			);
		} finally {
			actionLoadingId = null;
		}
	}

	async function refreshBorrowedItems(): Promise<void> {
		if (refreshInFlight) {
			pendingRefresh = true;
			return;
		}

		refreshInFlight = true;
		try {
			borrowRequestsAPI.invalidateCache();
			financialObligationsAPI.invalidateCache();
			await loadBorrowedItems(true);
		} finally {
			refreshInFlight = false;
			if (pendingRefresh) {
				pendingRefresh = false;
				await refreshBorrowedItems();
			}
		}
	}

	function scheduleRefresh(): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			refreshBorrowedItems();
		}, 250);
	}

	function getLoanTone(loan: LoanCard): 'danger' | 'warning' | 'safe' | 'muted' {
		if (loan.hasUnresolvedIssue) return 'danger';
		if (loan.status === 'missing') return 'danger';
		if (loan.status === 'pending_return') return 'muted';
		if (loan.isOverdue) return 'danger';
		if (loan.isDueSoon) return 'warning';
		return 'safe';
	}

	function getLoanBadgeClasses(loan: LoanCard): string {
		const tone = getLoanTone(loan);
		if (tone === 'danger') return 'bg-red-100 text-red-700 ring-red-200';
		if (tone === 'warning') return 'bg-amber-100 text-amber-700 ring-amber-200';
		if (tone === 'safe') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
		return 'bg-slate-100 text-slate-700 ring-slate-200';
	}

	function getLoanCardBorderClasses(loan: LoanCard): string {
		const tone = getLoanTone(loan);
		if (tone === 'danger') return 'border-l-red-500';
		if (tone === 'warning') return 'border-l-amber-500';
		if (tone === 'safe') return 'border-l-emerald-500';
		return 'border-l-slate-400';
	}

	function getLoanStateLabel(loan: LoanCard): string {
		if (loan.hasUnresolvedIssue || loan.status === 'missing') return 'Unresolved';
		if (loan.status === 'pending_return') return 'Return Initiated';
		if (loan.isOverdue) return 'Overdue';
		if (loan.isDueSoon) return 'Due Soon';
		return 'Active Loan';
	}

	function getLoanTimelineColorClasses(loan: LoanCard): string {
		if (loan.isOverdue || loan.hasUnresolvedIssue || loan.status === 'missing') return 'bg-red-500';
		if (loan.isDueSoon) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function getLoanSummary(loan: LoanCard): string {
		if (loan.hasUnresolvedIssue) return `${loan.unresolvedItems} unresolved item ${loan.unresolvedItems === 1 ? 'case' : 'cases'}`;
		if (loan.status === 'missing') return 'Marked as missing. Coordinate with custodian immediately.';
		if (loan.status === 'pending_return') return 'Return initiated. Waiting for custodian confirmation.';
		if (loan.isOverdue) return `${Math.abs(loan.daysDelta)} day${Math.abs(loan.daysDelta) > 1 ? 's' : ''} overdue`;
		if (loan.daysDelta === 0) return 'Due today';
		if (loan.isDueSoon) return `Due in ${loan.daysDelta} day${loan.daysDelta > 1 ? 's' : ''}`;
		return `${loan.daysDelta} days remaining`;
	}

	const filteredLoans = $derived.by(() => {
		const normalizedSearch = search.trim().toLowerCase();

		let output = loans.filter((loan) => {
			if (selectedFilter === 'overdue' && !loan.isOverdue) return false;
			if (selectedFilter === 'due-soon' && !loan.isDueSoon) return false;
			if (selectedFilter === 'on-track' && (loan.isOverdue || loan.isDueSoon || loan.status !== 'borrowed')) return false;
			if (selectedFilter === 'return-initiated' && loan.status !== 'pending_return') return false;
			if (selectedFilter === 'unresolved' && !loan.hasUnresolvedIssue) return false;

			if (!normalizedSearch) return true;

			const itemNames = loan.items.map((item) => item.name).join(' ').toLowerCase();
			const haystack = `${loan.requestCode} ${loan.purpose} ${loan.instructorName} ${itemNames}`.toLowerCase();
			return haystack.includes(normalizedSearch);
		});

		output = [...output].sort((a, b) => {
			if (sortBy === 'due-date') {
				return new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
			}

			if (sortBy === 'latest-borrowed') {
				return new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime();
			}

			const urgencyA = a.isOverdue ? -10 : a.status === 'missing' ? -9 : a.daysDelta;
			const urgencyB = b.isOverdue ? -10 : b.status === 'missing' ? -9 : b.daysDelta;
			return urgencyA - urgencyB;
		});

		return output;
	});

	const itemRows = $derived.by(() => {
		const rows: ItemRow[] = [];
		for (const loan of filteredLoans) {
			for (const item of loan.items) {
				rows.push({
					requestId: loan.id,
					requestCode: loan.requestCode,
					itemName: item.name,
					quantity: item.quantity,
					borrowDate: loan.borrowDate,
					returnDate: loan.returnDate,
					instructorName: loan.instructorName,
					status: getItemStatus(item, loan),
					settlementLabel: getSettlementLabel(item, loan.id),
					isOverdue: loan.isOverdue,
					daysDelta: loan.daysDelta,
					hasUnresolvedIssue: unresolvedItemKeys.has(buildIssueKey(loan.id, item.itemId)),
					picture: item.picture ?? itemPictureCache.get(item.itemId) ?? null
				});
			}
		}

		if (!search.trim()) return rows;
		const needle = search.trim().toLowerCase();
		return rows.filter((row) => {
			const text = `${row.requestCode} ${row.itemName} ${row.instructorName} ${row.settlementLabel}`.toLowerCase();
			return text.includes(needle);
		});
	});

	const metrics = $derived({
		totalActive: loans.length,
		overdue: loans.filter((loan) => loan.isOverdue).length,
		dueSoon: loans.filter((loan) => loan.isDueSoon).length,
		unresolved: loans.filter((loan) => loan.hasUnresolvedIssue).length
	});

	onMount(() => {
		void loadBorrowedItems();

		const unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((_event: BorrowRequestRealtimeEvent) => {
			scheduleRefresh();
		});
		liveSyncActive = true;

		const pollInterval = setInterval(() => {
			void refreshBorrowedItems();
		}, 30_000);

		const onFocus = () => {
			void refreshBorrowedItems();
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void refreshBorrowedItems();
			}
		};

		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeSSE();
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			clearInterval(pollInterval);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<svelte:head>
	<title>My Borrowed Items - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">My Borrowed Items</h1>
			<p class="mt-1 text-sm text-gray-500">Track your equipment borrow requests</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<p class="text-sm font-medium text-gray-600">Active Loans</p>
			<p class="mt-2 text-3xl font-semibold text-gray-900">{metrics.totalActive}</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<p class="text-sm font-medium text-gray-600">Overdue</p>
			<p class="mt-2 text-3xl font-semibold text-red-600">{metrics.overdue}</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<p class="text-sm font-medium text-gray-600">Due Soon (48h)</p>
			<p class="mt-2 text-3xl font-semibold text-amber-600">{metrics.dueSoon}</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
			<p class="text-sm font-medium text-gray-600">Unresolved Cases</p>
			<p class="mt-2 text-3xl font-semibold text-rose-700">{metrics.unresolved}</p>
		</div>
	</div>

	<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium">
				<button
					onclick={() => (viewMode = 'by-request')}
					class="rounded-md px-3 py-1.5 {viewMode === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}"
				>
					By Request
				</button>
				<button
					onclick={() => (viewMode = 'by-item')}
					class="rounded-md px-3 py-1.5 {viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}"
				>
					By Item
				</button>
			</div>
			<div class="w-full max-w-xl">
				<input
					type="text"
					bind:value={search}
					placeholder="Search by request code, item, purpose, or instructor"
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
				/>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<select bind:value={selectedFilter} class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
					<option value="all">All Loans</option>
					<option value="overdue">Overdue</option>
					<option value="due-soon">Due Soon</option>
					<option value="on-track">On Track</option>
					<option value="return-initiated">Return Initiated</option>
					<option value="unresolved">Unresolved</option>
				</select>
				<select bind:value={sortBy} class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
					<option value="urgent">Sort: Most Urgent</option>
					<option value="due-date">Sort: Due Date</option>
					<option value="latest-borrowed">Sort: Latest Borrowed</option>
				</select>
			</div>
		</div>
	</div>

	<div class="space-y-4">
		{#if isLoading}
			<div class="space-y-4" role="status" aria-live="polite" aria-label="Loading borrowed items">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{#each Array(4) as _}
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
							<Skeleton class="h-4 w-28" />
							<div class="mt-2">
								<Skeleton class="h-8 w-16" />
							</div>
						</div>
					{/each}
				</div>

				<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
					<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium">
							<Skeleton class="h-8 w-24 rounded-md" />
							<div class="w-2"></div>
							<Skeleton class="h-8 w-20 rounded-md" />
						</div>
						<div class="w-full max-w-xl">
							<Skeleton class="h-10 w-full rounded-lg" />
						</div>
						<div class="flex gap-2">
							<Skeleton class="h-10 w-36 rounded-lg" />
							<Skeleton class="h-10 w-40 rounded-lg" />
						</div>
					</div>
				</div>

				<div class="space-y-3">
					{#each Array(viewMode === 'by-request' ? 3 : 1) as _}
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 space-y-3">
									<Skeleton class="h-4 w-28" />
									<Skeleton class="h-6 w-64" />
									<Skeleton class="h-4 w-56" />
								</div>
								<Skeleton class="h-4 w-24" />
							</div>
							<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
								{#each Array(5) as __}
									<Skeleton class="h-8 w-full rounded-md" />
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else if filteredLoans.length === 0}
			<div class="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
					<ClipboardX size={26} class="text-gray-400" />
				</div>
				<p class="mt-4 text-base font-semibold text-gray-800">No borrowed items found</p>
				<p class="mt-1 text-sm text-gray-500">You have no active borrowed items in this view. Adjust filters or submit a new request.</p>
				<div class="mt-6">
					<a href="/student/catalog" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
						Browse Catalog
					</a>
				</div>
			</div>
		{:else if viewMode === 'by-request'}
			{#each filteredLoans as loan}
				<div class="overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md {getLoanCardBorderClasses(loan)}">
					<div class="p-5 sm:p-6">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 flex-wrap items-center gap-2">
									<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{loan.requestCode}</span>
									<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getLoanBadgeClasses(loan)}">
										{getLoanStateLabel(loan)}
									</span>
									{#if loan.hasUnresolvedIssue}
										<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{loan.unresolvedItems} Unresolved
										</span>
									{/if}
								</div>

								<div class="mt-4">
									<div class="min-w-0">
										<h3 class="text-lg font-semibold text-gray-900">{loan.items.length} item{loan.items.length > 1 ? 's' : ''} on active loan</h3>
										<p class="text-sm text-gray-500">{getLoanSummary(loan)}</p>
										<p class="mt-1 text-xs text-gray-400">Instructor: {loan.instructorName}</p>
									</div>
								</div>
							</div>

							<time class="shrink-0 whitespace-nowrap text-xs text-gray-400">
								{new Date(loan.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</time>
						</div>

						<div class="mt-4">
							<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Borrowed Equipment</p>
							<div class="flex flex-wrap gap-1.5">
								{#each loan.items.slice(0, 3) as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
										{#if pic}
											<img src={pic} alt={item.name} class="h-4 w-4 shrink-0 rounded object-cover" loading="lazy" />
										{:else}
											<span class="h-4 w-4 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
										{/if}
										<span class="truncate">{item.name}</span>
										<span class="text-gray-400">x{item.quantity}</span>
									</span>
								{/each}
								{#if loan.items.length > 3}
									<span class="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
										+{loan.items.length - 3} more
									</span>
								{/if}
							</div>
						</div>

						<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
							<div class="flex items-center gap-1.5 text-xs text-gray-500">
								<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z"/>
								</svg>
								<span>
									{new Date(loan.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									-
									{new Date(loan.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</span>
							</div>
							<div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
								<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
								<span class="max-w-[320px] truncate">{loan.purpose}</span>
							</div>
						</div>

						<div class="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-5">
							<div class="rounded-md bg-gray-100 px-2.5 py-1.5 text-gray-700">
								<span class="font-semibold">Total:</span> {loan.items.length}
							</div>
							<div class="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
								<span class="font-semibold">Returned:</span> {loan.returnedItems}
							</div>
							<div class="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-700">
								<span class="font-semibold">Damaged:</span> {loan.damagedItems}
							</div>
							<div class="rounded-md bg-red-50 px-2.5 py-1.5 text-red-700">
								<span class="font-semibold">Missing:</span> {loan.missingItems}
							</div>
							<div class="rounded-md {loan.isOverdue ? 'bg-red-50 text-red-700' : loan.isDueSoon ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'} px-2.5 py-1.5 sm:col-span-2 xl:col-span-1">
								<span class="font-semibold">Due:</span> {new Date(loan.returnDate).toLocaleDateString()}
							</div>
							{#if loan.hasUnresolvedIssue}
								<div class="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-700 sm:col-span-2 xl:col-span-2">
									<span class="font-semibold">Case Status:</span> Unresolved
								</div>
							{/if}
						</div>

						<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
							<button
								onclick={() => openLoanDetails(loan)}
								class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								View Details
							</button>
							{#if loan.status === 'borrowed'}
								<button
									onclick={() => initiateReturn(loan)}
									disabled={actionLoadingId === loan.id}
									class="inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{actionLoadingId === loan.id ? 'Processing...' : 'Initiate Return'}
								</button>
							{/if}
							<a href="/student/requests" class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
								Track Request
							</a>
							{#if loan.isOverdue || loan.hasUnresolvedIssue || loan.status === 'missing'}
								<a href="/student/account/help" class="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
									Contact Support
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{:else}
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
				<div class="border-b border-gray-200 bg-gray-50 px-5 py-3">
					<p class="text-sm font-semibold text-gray-800">By Item View</p>
					<p class="mt-1 text-xs text-gray-600">Operational tracking per item across all active requests.</p>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full border-collapse text-sm">
						<thead>
							<tr class="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
								<th class="px-5 py-3 font-semibold">Request</th>
								<th class="px-5 py-3 font-semibold">Item</th>
								<th class="px-5 py-3 font-semibold">Qty</th>
								<th class="px-5 py-3 font-semibold">Status</th>
								<th class="px-5 py-3 font-semibold">Financial</th>
								<th class="px-5 py-3 font-semibold">Due</th>
								<th class="px-5 py-3 font-semibold">Instructor</th>
							</tr>
						</thead>
						<tbody>
							{#if itemRows.length === 0}
								<tr>
									<td colspan="7" class="px-5 py-8 text-center text-sm text-gray-500">No items match the current search/filter.</td>
								</tr>
							{:else}
								{#each itemRows as row}
									<tr class="border-b border-gray-100 last:border-b-0">
										<td class="px-5 py-3 font-mono text-xs font-semibold tracking-wide text-gray-700">{row.requestCode}</td>
										<td class="px-5 py-3">
											<div class="flex items-center gap-2 text-gray-900">
												{#if row.picture}
													<img src={row.picture} alt={row.itemName} class="h-6 w-6 shrink-0 rounded object-cover" loading="lazy" />
												{:else}
													<span class="h-6 w-6 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
												{/if}
												<span>{row.itemName}</span>
											</div>
										</td>
										<td class="px-5 py-3 text-gray-700">{row.quantity}</td>
										<td class="px-5 py-3">
											<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {getItemStatusClasses(row.status)}">
												{getItemStatusLabel(row.status)}
											</span>
										</td>
										<td class="px-5 py-3 text-xs text-gray-700">{row.settlementLabel}</td>
										<td class="px-5 py-3 text-xs {row.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}">
											{new Date(row.returnDate).toLocaleDateString()} ({row.daysDelta < 0 ? `${Math.abs(row.daysDelta)}d overdue` : `${row.daysDelta}d left`})
										</td>
										<td class="px-5 py-3 text-gray-700">{row.instructorName}</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>

	{#if selectedLoan}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<div class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
				<div class="flex items-start justify-between border-b border-gray-200 px-6 py-5">
					<div>
						<p class="font-mono text-xs font-semibold tracking-widest text-gray-500">{selectedLoan.requestCode}</p>
						<h2 class="mt-1 text-xl font-semibold text-gray-900">Borrowed Request Details</h2>
						<p class="mt-1 text-sm text-gray-500">Detailed condition, return, and financial tracking for this request.</p>
					</div>
					<button
						onclick={closeLoanDetails}
						class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
					>
						Close
					</button>
				</div>

				<div class="max-h-[calc(90vh-88px)] overflow-y-auto">
					<div class="p-6">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 flex-wrap items-center gap-2">
									<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getLoanBadgeClasses(selectedLoan)}">
										{getLoanStateLabel(selectedLoan)}
									</span>
									{#if selectedLoan.hasUnresolvedIssue}
										<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{selectedLoan.unresolvedItems} Unresolved
										</span>
									{/if}
								</div>
								<h3 class="mt-4 text-lg font-semibold text-gray-900">{selectedLoan.items.length} item{selectedLoan.items.length > 1 ? 's' : ''} on active loan</h3>
								<p class="mt-1 text-sm text-gray-500">{getLoanSummary(selectedLoan)}</p>
							</div>
							<time class="shrink-0 whitespace-nowrap text-xs text-gray-400">
								{new Date(selectedLoan.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</time>
						</div>

						<div class="mt-4">
							<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Borrowed Equipment</p>
							<div class="flex flex-wrap gap-1.5">
								{#each selectedLoan.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
										{#if pic}
											<img src={pic} alt={item.name} class="h-4 w-4 shrink-0 rounded object-cover" loading="lazy" />
										{:else}
											<span class="h-4 w-4 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
										{/if}
										<span>{item.name}</span>
										<span class="text-gray-400">x{item.quantity}</span>
									</span>
								{/each}
							</div>
						</div>

						<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
							<div class="flex items-center gap-1.5 text-xs text-gray-500">
								<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z"/>
								</svg>
								<span>
									{new Date(selectedLoan.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									-
									{new Date(selectedLoan.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</span>
							</div>
							<div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
								<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
								<span class="max-w-[420px] truncate">{selectedLoan.purpose}</span>
							</div>
						</div>

						<div class="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-5">
							<div class="rounded-md bg-gray-100 px-2.5 py-1.5 text-gray-700">
								<span class="font-semibold">Total:</span> {selectedLoan.items.length}
							</div>
							<div class="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
								<span class="font-semibold">Returned:</span> {selectedLoan.returnedItems}
							</div>
							<div class="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-700">
								<span class="font-semibold">Damaged:</span> {selectedLoan.damagedItems}
							</div>
							<div class="rounded-md bg-red-50 px-2.5 py-1.5 text-red-700">
								<span class="font-semibold">Missing:</span> {selectedLoan.missingItems}
							</div>
							<div class="rounded-md {selectedLoan.isOverdue ? 'bg-red-50 text-red-700' : selectedLoan.isDueSoon ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'} px-2.5 py-1.5 sm:col-span-2 xl:col-span-1">
								<span class="font-semibold">Due:</span> {new Date(selectedLoan.returnDate).toLocaleDateString()}
							</div>
							{#if selectedLoan.hasUnresolvedIssue}
								<div class="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-700 sm:col-span-2 xl:col-span-2">
									<span class="font-semibold">Case Status:</span> Unresolved
								</div>
							{/if}
						</div>

						{#if selectedLoan.isOverdue || selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing'}
							<div class="mt-4 flex items-start gap-2.5 rounded-lg border {selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'border-rose-200 bg-rose-50' : 'border-red-200 bg-red-50'} px-3 py-2.5">
								<svg class="mt-0.5 h-4 w-4 shrink-0 {selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'text-rose-500' : 'text-red-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
								<div>
									<p class="text-sm font-medium {selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'text-rose-800' : 'text-red-800'}">
										{selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'An unresolved incident is attached to this request.' : `${Math.abs(selectedLoan.daysDelta)} day${Math.abs(selectedLoan.daysDelta) > 1 ? 's' : ''} overdue`}
									</p>
									<p class="mt-0.5 text-xs {selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'text-rose-700' : 'text-red-700'}">
										{selectedLoan.hasUnresolvedIssue || selectedLoan.status === 'missing' ? 'Coordinate with the custodian to resolve the outstanding case.' : `Due ${new Date(selectedLoan.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
									</p>
								</div>
							</div>
						{/if}

						<div class="mt-6 border-t border-gray-100 pt-4">
							<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Per-item Return and Condition Status</p>
							<div class="mt-3 overflow-x-auto">
								<table class="min-w-full border-collapse text-sm">
									<thead>
										<tr class="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
											<th class="pb-2 pr-4 font-semibold">Item</th>
											<th class="pb-2 pr-4 font-semibold">Qty</th>
											<th class="pb-2 pr-4 font-semibold">Status</th>
											<th class="pb-2 pr-4 font-semibold">Financial</th>
										</tr>
									</thead>
									<tbody>
										{#each selectedLoan.items as item}
											{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
											{@const itemStatus = getItemStatus(item, selectedLoan)}
											<tr class="border-b border-gray-100 last:border-b-0">
												<td class="py-3 pr-4">
													<div class="flex items-center gap-2">
														{#if pic}
															<img src={pic} alt={item.name} class="h-6 w-6 shrink-0 rounded object-cover" loading="lazy" />
														{:else}
															<span class="h-6 w-6 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
														{/if}
														<span class="font-medium text-gray-900">{item.name}</span>
													</div>
												</td>
												<td class="py-3 pr-4 text-gray-700">{item.quantity}</td>
												<td class="py-3 pr-4">
													<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {getItemStatusClasses(itemStatus)}">
														{getItemStatusLabel(itemStatus)}
													</span>
												</td>
												<td class="py-3 pr-4 text-xs text-gray-700">{getSettlementLabel(item, selectedLoan.id)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div class="mt-6 rounded-lg bg-gray-50 px-5 py-3">
							<div class="flex items-center justify-between text-xs text-gray-600">
								<span>Loan timeline</span>
								<span>{selectedLoan.loanPeriodDays} day term</span>
							</div>
							<div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
								<div class="h-full rounded-full {getLoanTimelineColorClasses(selectedLoan)}" style="width: {selectedLoan.remainingProgress}%"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
