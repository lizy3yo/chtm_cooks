<script lang="ts">
	import { onMount } from 'svelte';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { confirmStore } from '$lib/stores/confirm';
	import { ClipboardX } from 'lucide-svelte';

	type LoanFilter = 'all' | 'overdue' | 'due-soon' | 'on-track' | 'return-initiated';
	type LoanSort = 'urgent' | 'due-date' | 'latest-borrowed';
	type ViewMode = 'by-request' | 'by-item';
	type ItemOperationalStatus = 'in-use' | 'return-in-progress' | 'returned' | 'damaged' | 'missing' | 'replaced' | 'payable' | 'paid';

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
	}

	let isLoading = $state(true);
	let actionLoadingId = $state<string | null>(null);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let search = $state('');
	let viewMode = $state<ViewMode>('by-request');
	let hasShownOverdueModal = $state(false);
	let selectedFilter = $state<LoanFilter>('all');
	let sortBy = $state<LoanSort>('urgent');
	let loans = $state<LoanCard[]>([]);

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
			missingItems
		};
	}

	function getItemStatus(item: BorrowRequestRecord['items'][number], loan: LoanCard): ItemOperationalStatus {
		const notes = (item.inspection?.notes || '').toLowerCase();
		if (notes.includes('paid')) return 'paid';
		if (notes.includes('replaced')) return 'replaced';
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
		if (status === 'damaged') return 'bg-amber-100 text-amber-700 ring-amber-200';
		if (status === 'missing') return 'bg-red-100 text-red-700 ring-red-200';
		if (status === 'replaced') return 'bg-cyan-100 text-cyan-700 ring-cyan-200';
		if (status === 'payable') return 'bg-orange-100 text-orange-700 ring-orange-200';
		if (status === 'paid') return 'bg-green-100 text-green-700 ring-green-200';
		if (status === 'return-in-progress') return 'bg-slate-100 text-slate-700 ring-slate-200';
		return 'bg-blue-100 text-blue-700 ring-blue-200';
	}

	function getSettlementLabel(item: BorrowRequestRecord['items'][number]): string {
		if (item.inspection?.status === 'good') return 'No charge';
		if (item.inspection?.status === 'damaged' || item.inspection?.status === 'missing') {
			return item.inspection.unitPrice ? `Charge review: ${item.inspection.unitPrice.toLocaleString()}` : 'Charge review';
		}
		return 'Not assessed';
	}

	async function loadBorrowedItems(forceRefresh = false): Promise<void> {
		isLoading = true;
		try {
			const requests = (
				await borrowRequestsAPI.list(
					{
						statuses: ['borrowed', 'pending_return', 'missing'],
						sortBy: 'returnDate',
						page: 1,
						limit: 100
					},
					{ forceRefresh }
				)
			).requests;

			loans = requests
				.filter((request) => ['borrowed', 'pending_return', 'missing'].includes(request.status))
				.map(toLoanCard);

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
			actionMessage = {
				type: 'error',
				text: error instanceof Error ? error.message : 'Unable to load borrowed items.'
			};
			loans = [];
		} finally {
			isLoading = false;
		}
	}

	async function initiateReturn(loan: LoanCard): Promise<void> {
		actionLoadingId = loan.id;
		actionMessage = null;

		try {
			await borrowRequestsAPI.initiateReturn(loan.id);
			actionMessage = {
				type: 'success',
				text: `${loan.requestCode} marked for return. Please proceed to the custodian for handover.`
			};
			await loadBorrowedItems(true);
		} catch (error) {
			actionMessage = {
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to initiate return.'
			};
		} finally {
			actionLoadingId = null;
		}
	}

	function getLoanTone(loan: LoanCard): 'danger' | 'warning' | 'safe' | 'muted' {
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

	function getLoanSummary(loan: LoanCard): string {
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
					settlementLabel: getSettlementLabel(item),
					isOverdue: loan.isOverdue,
					daysDelta: loan.daysDelta
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
		pendingReturn: loans.filter((loan) => loan.status === 'pending_return').length
	});

	onMount(async () => {
		await loadBorrowedItems();
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

	{#if actionMessage}
		<div class="rounded-lg border p-4 {actionMessage.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}">
			<div class="flex items-start justify-between gap-4">
				<p class="text-sm font-medium">{actionMessage.text}</p>
				<button onclick={() => (actionMessage = null)} class="text-xs font-semibold uppercase tracking-wide opacity-80 hover:opacity-100">Dismiss</button>
			</div>
		</div>
	{/if}

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
			<p class="text-sm font-medium text-gray-600">Return Initiated</p>
			<p class="mt-2 text-3xl font-semibold text-slate-700">{metrics.pendingReturn}</p>
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
			<div class="rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
				<p class="text-sm font-medium text-gray-600">Loading borrowed items...</p>
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
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md">
					<div class="border-b border-gray-100 px-5 py-4 sm:px-6">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="min-w-0">
								<p class="font-mono text-xs font-semibold tracking-widest text-gray-500">{loan.requestCode}</p>
								<p class="mt-1 text-base font-semibold text-gray-900 truncate">{loan.items.length} item{loan.items.length > 1 ? 's' : ''} on active loan</p>
							</div>
							<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {getLoanBadgeClasses(loan)}">
								{getLoanSummary(loan)}
							</span>
						</div>
					</div>

					<div class="grid gap-5 px-5 py-4 sm:px-6 lg:grid-cols-[1.5fr_1fr_auto] lg:items-start">
						<div>
							<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Items</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each loan.items as item}
									<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700">
										<span>{inferItemIcon(item.name)}</span>
										<span>{item.name}</span>
										<span class="text-gray-400">x{item.quantity}</span>
									</span>
								{/each}
							</div>

							<div class="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
							</div>
							<p class="mt-4 text-xs text-gray-500"><span class="font-medium text-gray-700">Purpose:</span> {loan.purpose}</p>
						</div>

						<div class="grid grid-cols-2 gap-4 text-sm lg:grid-cols-1">
							<div>
								<p class="text-xs font-medium text-gray-500">Borrow Date</p>
								<p class="mt-1 font-semibold text-gray-900">{new Date(loan.borrowDate).toLocaleDateString()}</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Due Date</p>
								<p class="mt-1 font-semibold {loan.isOverdue ? 'text-red-600' : 'text-gray-900'}">{new Date(loan.returnDate).toLocaleDateString()}</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Instructor</p>
								<p class="mt-1 text-gray-700">{loan.instructorName}</p>
							</div>
						</div>

						<div class="flex flex-col gap-2">
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
							{#if loan.isOverdue || loan.status === 'missing'}
								<a href="/student/account/help" class="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
									Contact Support
								</a>
							{/if}
						</div>
					</div>

					<div class="border-t border-gray-100 px-5 py-4 sm:px-6">
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
									{#each loan.items as item}
										{@const itemStatus = getItemStatus(item, loan)}
										<tr class="border-b border-gray-100 last:border-b-0">
											<td class="py-3 pr-4">
												<div class="flex items-center gap-2">
													<span>{inferItemIcon(item.name)}</span>
													<span class="font-medium text-gray-900">{item.name}</span>
												</div>
											</td>
											<td class="py-3 pr-4 text-gray-700">{item.quantity}</td>
											<td class="py-3 pr-4">
												<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 {getItemStatusClasses(itemStatus)}">
													{getItemStatusLabel(itemStatus)}
												</span>
											</td>
											<td class="py-3 pr-4 text-xs text-gray-700">{getSettlementLabel(item)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<div class="bg-gray-50 px-5 py-3 sm:px-6">
						<div class="flex items-center justify-between text-xs text-gray-600">
							<span>Loan timeline</span>
							<span>{loan.loanPeriodDays} day term</span>
						</div>
						<div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
							<div class="h-full rounded-full {loan.isOverdue ? 'bg-red-500' : loan.isDueSoon ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: {loan.remainingProgress}%"></div>
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
										<td class="px-5 py-3 text-gray-900">{row.itemName}</td>
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
</div>
