<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		fetchAnalytics,
		subscribeToAnalyticsChanges,
		clearAnalyticsCache,
		type AnalyticsReport,
		type AnalyticsPeriod
	} from '$lib/api/analyticsReports';
	import { toastStore } from '$lib/stores/toast';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';

	// ── State ─────────────────────────────────────────────────────────────────

	type Tab = 'borrow' | 'inventory' | 'financial' | 'risk';

	let activeTab = $state<Tab>('borrow');
	let period = $state<AnalyticsPeriod>('month');
	let customFrom = $state('');
	let customTo = $state('');
	let useCustomRange = $state(false);

	let report = $state<AnalyticsReport | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let lastRefreshed = $state<Date | null>(null);

	let unsubscribeSSE: (() => void) | null = null;
	let mounted = false;

	// ── Derived helpers ───────────────────────────────────────────────────────

	const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

	const statusColors: Record<string, string> = {
		pending_instructor: 'bg-yellow-100 text-yellow-800',
		approved_instructor: 'bg-blue-100 text-blue-800',
		ready_for_pickup: 'bg-indigo-100 text-indigo-800',
		borrowed: 'bg-pink-100 text-pink-800',
		pending_return: 'bg-orange-100 text-orange-800',
		returned: 'bg-emerald-100 text-emerald-800',
		missing: 'bg-red-100 text-red-800',
		resolved: 'bg-teal-100 text-teal-800',
		cancelled: 'bg-gray-100 text-gray-600',
		rejected: 'bg-rose-100 text-rose-800'
	};

	const statusLabels: Record<string, string> = {
		pending_instructor: 'Pending Approval',
		approved_instructor: 'Instructor Approved',
		ready_for_pickup: 'Ready for Pickup',
		borrowed: 'Borrowed',
		pending_return: 'Pending Return',
		returned: 'Returned',
		missing: 'Missing',
		resolved: 'Resolved',
		cancelled: 'Cancelled',
		rejected: 'Rejected'
	};

	const conditionColors: Record<string, string> = {
		Excellent: 'bg-emerald-500',
		Good: 'bg-green-400',
		Fair: 'bg-yellow-400',
		Poor: 'bg-orange-400',
		Damaged: 'bg-red-500'
	};

	// ── KPI derived values ────────────────────────────────────────────────────

	const totalRequests = $derived(
		report?.borrowRequests.statusBreakdown.reduce((s, i) => s + i.count, 0) ?? 0
	);
	const returnedCount = $derived(
		report?.borrowRequests.statusBreakdown.find((s) => s.status === 'returned')?.count ?? 0
	);
	const approvalRate = $derived(
		totalRequests > 0
			? Math.round(
					((report?.borrowRequests.statusBreakdown
						.filter((s) => !['rejected', 'cancelled'].includes(s.status))
						.reduce((s, i) => s + i.count, 0) ?? 0) /
						totalRequests) *
						100
				)
			: 0
	);

	// ── Heatmap helpers ───────────────────────────────────────────────────────

	const heatmapMax = $derived(
		Math.max(1, ...(report?.borrowRequests.peakHeatmap.map((p) => p.count) ?? [1]))
	);

	// Donation totals grouped by month (computed, not in template)
	const donationByMonth = $derived.by(() => {
		const map = new Map<string, { year: string; month: string; cash: number; cashCount: number; itemCount: number }>();
		for (const d of report?.financial.donationTotals ?? []) {
			const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
			const existing = map.get(key) ?? { year: String(d.year), month: String(d.month).padStart(2, '0'), cash: 0, cashCount: 0, itemCount: 0 };
			if (d.type === 'cash') {
				map.set(key, { ...existing, cash: existing.cash + d.totalAmount, cashCount: existing.cashCount + d.count });
			} else {
				map.set(key, { ...existing, itemCount: existing.itemCount + d.count });
			}
		}
		return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
	});

	function heatmapCell(day: number, hour: number): number {
		return (
			report?.borrowRequests.peakHeatmap.find(
				(p) => p.dayOfWeek === day && p.hour === hour
			)?.count ?? 0
		);
	}

	function heatmapColor(count: number): string {
		if (count === 0) return 'bg-gray-100';
		const ratio = count / heatmapMax;
		if (ratio < 0.2) return 'bg-pink-100';
		if (ratio < 0.4) return 'bg-pink-200';
		if (ratio < 0.6) return 'bg-pink-300';
		if (ratio < 0.8) return 'bg-pink-400';
		return 'bg-pink-600';
	}

	// ── Bar chart helper (CSS-based) ──────────────────────────────────────────

	function barWidth(value: number, max: number): string {
		if (max === 0) return '0%';
		return `${Math.round((value / max) * 100)}%`;
	}

	// ── Trust score badge ─────────────────────────────────────────────────────

	function trustBadge(score: number): string {
		if (score >= 90) return 'bg-emerald-100 text-emerald-800';
		if (score >= 70) return 'bg-yellow-100 text-yellow-800';
		return 'bg-red-100 text-red-800';
	}

	function trustLabel(score: number): string {
		if (score >= 90) return 'High';
		if (score >= 70) return 'Medium';
		return 'Low';
	}

	// ── Initials helper ───────────────────────────────────────────────────────

	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	// ── Data loading ──────────────────────────────────────────────────────────

	async function loadReport(forceRefresh = false): Promise<void> {
		if (!browser) return;
		isLoading = true;
		error = null;
		try {
			report = await fetchAnalytics({
				period,
				from: useCustomRange && customFrom ? customFrom : undefined,
				to: useCustomRange && customTo ? customTo : undefined,
				forceRefresh
			});
			lastRefreshed = new Date();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load analytics';
			toastStore.error(error, 'Analytics Error');
		} finally {
			isLoading = false;
		}
	}

	function handleRefresh(): void {
		clearAnalyticsCache();
		loadReport(true);
		toastStore.info('Refreshing analytics data…', 'Refresh');
	}

	onMount(() => {
		mounted = true;
		loadReport();

		unsubscribeSSE = subscribeToAnalyticsChanges(() => {
			loadReport(true);
		});

		return () => {
			unsubscribeSSE?.();
		};
	});

	// Reload when period changes — skip the initial run (handled by onMount)
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		period;
		if (mounted && browser) loadReport();
	});
</script>

<div class="p-6 space-y-6">

	<!-- ── Header ──────────────────────────────────────────────────────────── -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
			<p class="mt-1 text-sm text-gray-500">
				Operational insights across borrowing, inventory, financials, and student risk.
				{#if lastRefreshed}
					<span class="ml-1 text-gray-400">
						Last updated {lastRefreshed.toLocaleTimeString()}
					</span>
				{/if}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<!-- Period selector -->
			<div class="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
				{#each [['week','Week'],['month','Month'],['semester','Semester']] as [val, label]}
					<button
						onclick={() => { period = val as AnalyticsPeriod; useCustomRange = false; }}
						class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {period === val && !useCustomRange ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
					>
						{label}
					</button>
				{/each}
			</div>
			<button
				onclick={handleRefresh}
				disabled={isLoading}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
				title="Refresh data"
			>
				<svg class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Refresh
			</button>
		</div>
	</div>

	<!-- ── KPI Cards ───────────────────────────────────────────────────────── -->
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#if isLoading}
			{#each Array(4) as _}
				<div class="rounded-lg bg-white p-5 shadow space-y-3">
					<Skeleton class="h-3.5 w-28" />
					<Skeleton class="h-8 w-20" />
					<Skeleton class="h-3 w-16" />
				</div>
			{/each}
		{:else}
			<div class="rounded-lg bg-white p-5 shadow">
				<p class="text-sm font-medium text-gray-500">Total Requests</p>
				<p class="mt-1 text-3xl font-bold text-pink-600">{totalRequests.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-400">This {period}</p>
			</div>
			<div class="rounded-lg bg-white p-5 shadow">
				<p class="text-sm font-medium text-gray-500">Overdue Returns</p>
				<p class="mt-1 text-3xl font-bold {(report?.borrowRequests.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}">
					{report?.borrowRequests.overdueCount ?? 0}
				</p>
				<p class="mt-1 text-xs text-gray-400">Currently active</p>
			</div>
			<div class="rounded-lg bg-white p-5 shadow">
				<p class="text-sm font-medium text-gray-500">Outstanding Obligations</p>
				<p class="mt-1 text-3xl font-bold text-amber-600">
					₱{(report?.financial.summary.totalOutstanding ?? 0).toLocaleString()}
				</p>
				<p class="mt-1 text-xs text-gray-400">{report?.financial.summary.pendingCount ?? 0} pending</p>
			</div>
			<div class="rounded-lg bg-white p-5 shadow">
				<p class="text-sm font-medium text-gray-500">Stock Alerts</p>
				<p class="mt-1 text-3xl font-bold {(report?.inventory.stockAlerts.length ?? 0) > 0 ? 'text-orange-600' : 'text-emerald-600'}">
					{report?.inventory.stockAlerts.length ?? 0}
				</p>
				<p class="mt-1 text-xs text-gray-400">Low / out of stock</p>
			</div>
		{/if}
	</div>

	<!-- ── Tab Navigation ──────────────────────────────────────────────────── -->
	<div class="rounded-lg bg-white shadow">
		<div class="border-b border-gray-200">
			<nav class="-mb-px flex overflow-x-auto" aria-label="Analytics tabs">
				{#each [
					{ key: 'borrow', label: 'Borrow Operations' },
					{ key: 'inventory', label: 'Inventory Utilization' },
					{ key: 'financial', label: 'Financial Overview' },
					{ key: 'risk', label: 'Student Risk' }
				] as tab}
					<button
						onclick={() => (activeTab = tab.key as Tab)}
						class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === tab.key
							? 'border-pink-500 text-pink-600'
							: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>
						{tab.label}
					</button>
				{/each}
			</nav>
		</div>

		<div class="p-6">
			{#if isLoading}
				<div class="space-y-4" role="status" aria-label="Loading analytics">
					<div class="flex items-center justify-between">
						<Skeleton class="h-5 w-48" />
						<Skeleton class="h-8 w-24" />
					</div>
					{#each Array(5) as _}
						<div class="rounded-xl border border-gray-100 p-4 space-y-2">
							<div class="flex items-center gap-3">
								<Skeleton variant="circle" class="h-9 w-9" />
								<div class="flex-1 space-y-1.5">
									<Skeleton class="h-4 w-40" />
									<Skeleton class="h-3 w-24" />
								</div>
								<Skeleton class="h-6 w-16" />
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
						onclick={() => loadReport(true)}
						class="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
					>
						Try Again
					</button>
				</div>
			{:else if report}

			<!-- ══ BORROW OPERATIONS TAB ══════════════════════════════════════ -->
			{#if activeTab === 'borrow'}
				<div class="space-y-8">

					<!-- Requests over time (bar chart) -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Requests Over Time</h3>
						{#if report.borrowRequests.requestsOverTime.length === 0}
							<p class="text-sm text-gray-400">No data for this period.</p>
						{:else}
							{@const maxCount = Math.max(...report.borrowRequests.requestsOverTime.map((r) => r.count), 1)}
							<div class="overflow-x-auto">
								<div class="flex min-w-max items-end gap-1 h-40 pb-6 relative">
									{#each report.borrowRequests.requestsOverTime as point}
										<div class="flex flex-col items-center gap-1 group" style="min-width:28px">
											<span class="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">{point.count}</span>
											<div
												class="w-5 rounded-t bg-pink-400 hover:bg-pink-600 transition-colors cursor-default"
												style="height:{Math.max(4, Math.round((point.count / maxCount) * 120))}px"
												title="{point.date}: {point.count} requests"
											></div>
											<span class="text-[10px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">{point.date.slice(5)}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</section>

					<!-- Status breakdown -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Request Status Breakdown</h3>
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
							{#each report.borrowRequests.statusBreakdown as item}
								<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
									<p class="text-2xl font-bold text-gray-900">{item.count}</p>
									<span class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium {statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}">
										{statusLabels[item.status] ?? item.status}
									</span>
								</div>
							{/each}
						</div>
					</section>

					<!-- Turnaround times -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Average Turnaround Times</h3>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							{#each [
								{ label: 'Submission → Approval', value: report.borrowRequests.turnaround.avgApprovalHours, color: 'text-blue-600', bg: 'bg-blue-50' },
								{ label: 'Approval → Release', value: report.borrowRequests.turnaround.avgReleaseHours, color: 'text-indigo-600', bg: 'bg-indigo-50' },
								{ label: 'Release → Return', value: report.borrowRequests.turnaround.avgReturnHours, color: 'text-pink-600', bg: 'bg-pink-50' }
							] as stat}
								<div class="rounded-xl border border-gray-100 {stat.bg} p-5">
									<p class="text-xs font-medium text-gray-500">{stat.label}</p>
									<p class="mt-1 text-2xl font-bold {stat.color}">
										{stat.value > 0 ? `${stat.value}h` : '—'}
									</p>
									<p class="mt-0.5 text-xs text-gray-400">average hours</p>
								</div>
							{/each}
						</div>
					</section>

					<!-- Overdue returns -->
					<section>
						<div class="mb-4 flex items-center justify-between">
							<h3 class="text-base font-semibold text-gray-900">
								Overdue Returns
								{#if report.borrowRequests.overdueCount > 0}
									<span class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{report.borrowRequests.overdueCount}</span>
								{/if}
							</h3>
						</div>
						{#if report.borrowRequests.overdueRequests.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center">
								<svg class="mx-auto h-10 w-10 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
								<p class="mt-2 text-sm font-medium text-gray-500">No overdue returns</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Due Date</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Days Overdue</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Items</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each report.borrowRequests.overdueRequests as req}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3 text-sm font-medium text-gray-900">{req.studentName.trim() || 'Unknown'}</td>
												<td class="px-4 py-3 text-sm text-gray-600">{new Date(req.returnDate).toLocaleDateString()}</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
														{req.daysOverdue}d overdue
													</span>
												</td>
												<td class="px-4 py-3 text-sm text-gray-600">{req.itemCount}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>

					<!-- Peak borrowing heatmap -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Peak Borrowing Periods</h3>
						<p class="mb-3 text-xs text-gray-400">Darker = more requests. Hover for count.</p>
						<div class="overflow-x-auto">
							<div class="min-w-max">
								<!-- Hour labels -->
								<div class="flex ml-10 mb-1">
									{#each Array(24) as _, h}
										<div class="w-7 text-center text-[10px] text-gray-400">{h}</div>
									{/each}
								</div>
								{#each [1,2,3,4,5,6,7] as day}
									<div class="flex items-center mb-1">
										<span class="w-9 text-right pr-2 text-xs text-gray-500">{DAY_NAMES[day - 1]}</span>
										{#each Array(24) as _, h}
											{@const count = heatmapCell(day, h)}
											<div
												class="w-7 h-6 rounded-sm mx-px {heatmapColor(count)} cursor-default transition-colors"
												title="{DAY_NAMES[day-1]} {h}:00 — {count} requests"
											></div>
										{/each}
									</div>
								{/each}
								<!-- Legend -->
								<div class="flex items-center gap-2 mt-3 ml-10">
									<span class="text-xs text-gray-400">Less</span>
									{#each ['bg-gray-100','bg-pink-100','bg-pink-200','bg-pink-300','bg-pink-400','bg-pink-600'] as cls}
										<div class="w-5 h-4 rounded-sm {cls}"></div>
									{/each}
									<span class="text-xs text-gray-400">More</span>
								</div>
							</div>
						</div>
					</section>
				</div>
			{/if}

			<!-- ══ INVENTORY UTILIZATION TAB ══════════════════════════════════ -->
			{#if activeTab === 'inventory'}
				<div class="space-y-8">

					<!-- Most borrowed items -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Most Borrowed Items</h3>
						{#if report.inventory.mostBorrowedItems.length === 0}
							<p class="text-sm text-gray-400">No borrow data for this period.</p>
						{:else}
							{@const maxBorrows = Math.max(...report.inventory.mostBorrowedItems.map((i) => i.totalBorrows), 1)}
							<div class="space-y-3">
								{#each report.inventory.mostBorrowedItems as item, idx}
									<div class="flex items-center gap-3">
										<span class="w-5 shrink-0 text-right text-xs font-semibold text-gray-400">#{idx + 1}</span>
										<div class="flex-1">
											<div class="flex items-center justify-between mb-1">
												<span class="text-sm font-medium text-gray-900">{item.name}</span>
												<span class="text-xs text-gray-500">{item.totalBorrows} borrows</span>
											</div>
											<div class="h-2 w-full rounded-full bg-gray-100">
												<div
													class="h-2 rounded-full bg-pink-500 transition-all"
													style="width:{barWidth(item.totalBorrows, maxBorrows)}"
												></div>
											</div>
											<p class="mt-0.5 text-xs text-gray-400">{item.category} · {item.totalQuantity} units total</p>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<!-- Items currently out -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Items Currently Out</h3>
						{#if report.inventory.itemsCurrentlyOut.length === 0}
							<p class="text-sm text-gray-400">No items currently borrowed.</p>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Out</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">In Stock</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Utilization</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each report.inventory.itemsCurrentlyOut as item}
											{@const total = item.quantityOut + item.totalStock}
											{@const utilPct = total > 0 ? Math.round((item.quantityOut / total) * 100) : 0}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
												<td class="px-4 py-3 text-sm text-gray-500">{item.category}</td>
												<td class="px-4 py-3 text-sm font-semibold text-pink-600">{item.quantityOut}</td>
												<td class="px-4 py-3 text-sm text-gray-600">{item.totalStock}</td>
												<td class="px-4 py-3">
													<div class="flex items-center gap-2">
														<div class="h-1.5 w-20 rounded-full bg-gray-100">
															<div class="h-1.5 rounded-full bg-pink-400" style="width:{utilPct}%"></div>
														</div>
														<span class="text-xs text-gray-500">{utilPct}%</span>
													</div>
												</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {conditionColors[item.condition] ? conditionColors[item.condition].replace('bg-', 'bg-').replace('-500','-100').replace('-400','-100') + ' text-gray-700' : 'bg-gray-100 text-gray-600'}">
														{item.condition}
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>

					<!-- Damage / missing rate -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Items with Highest Incident Rate</h3>
						{#if report.inventory.damageRateItems.length === 0}
							<p class="text-sm text-gray-400">No inspection data for this period.</p>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Inspected</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Damaged</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Missing</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Incident Rate</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each report.inventory.damageRateItems as item}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3">
													<p class="text-sm font-medium text-gray-900">{item.name}</p>
													<p class="text-xs text-gray-400">{item.category}</p>
												</td>
												<td class="px-4 py-3 text-sm text-gray-600">{item.totalInspected}</td>
												<td class="px-4 py-3 text-sm font-medium text-rose-600">{item.damaged}</td>
												<td class="px-4 py-3 text-sm font-medium text-red-600">{item.missing}</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {item.incidentRate >= 50 ? 'bg-red-100 text-red-800' : item.incidentRate >= 25 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}">
														{item.incidentRate}%
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>

					<!-- EOM Variance -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">EOM Variance Tracking</h3>
						<p class="mb-3 text-xs text-gray-400">Negative variance = current stock below end-of-month count.</p>
						{#if report.inventory.eomVariance.length === 0}
							<p class="text-sm text-gray-400">No inventory data available.</p>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Current Qty</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">EOM Count</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Variance</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each report.inventory.eomVariance as item}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3">
													<p class="text-sm font-medium text-gray-900">{item.name}</p>
													<p class="text-xs text-gray-400">{item.category}</p>
												</td>
												<td class="px-4 py-3 text-sm text-gray-700">{item.quantity}</td>
												<td class="px-4 py-3 text-sm text-gray-700">{item.eomCount}</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {item.variance < 0 ? 'bg-red-100 text-red-800' : item.variance > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}">
														{item.variance > 0 ? '+' : ''}{item.variance}
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>

					<!-- Condition distribution + Stock alerts side by side -->
					<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
						<!-- Condition distribution -->
						<section>
							<h3 class="mb-4 text-base font-semibold text-gray-900">Condition Distribution</h3>
							{#if report.inventory.conditionDistribution.length >= 0}
								{@const totalItems = report.inventory.conditionDistribution.reduce((s, c) => s + c.count, 0)}
								<div class="space-y-3">
									{#each ['Excellent','Good','Fair','Poor','Damaged'] as cond}
										{@const item = report.inventory.conditionDistribution.find((c) => c.condition === cond)}
										{@const count = item?.count ?? 0}
										{@const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-xs text-gray-600">{cond}</span>
											<div class="flex-1 h-2 rounded-full bg-gray-100">
												<div class="h-2 rounded-full {conditionColors[cond] ?? 'bg-gray-400'} transition-all" style="width:{pct}%"></div>
											</div>
											<span class="w-12 text-right text-xs text-gray-500">{count} ({pct}%)</span>
										</div>
									{/each}
								</div>
							{/if}
						</section>

						<!-- Stock alerts -->
						<section>
							<h3 class="mb-4 text-base font-semibold text-gray-900">Stock Alerts</h3>
							{#if report.inventory.stockAlerts.length === 0}
								<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
									<p class="text-sm text-emerald-600 font-medium">All items adequately stocked</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each report.inventory.stockAlerts as alert}
										<div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
											<div>
												<p class="text-sm font-medium text-gray-900">{alert.name}</p>
												<p class="text-xs text-gray-400">{alert.category}</p>
											</div>
											<div class="flex items-center gap-2">
												<span class="text-sm font-semibold text-gray-700">Qty: {alert.quantity}</span>
												<span class="rounded-full px-2 py-0.5 text-xs font-semibold {alert.status === 'Out of Stock' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}">
													{alert.status}
												</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					</div>
				</div>
			{/if}

			<!-- ══ FINANCIAL OVERVIEW TAB ══════════════════════════════════════ -->
			{#if activeTab === 'financial'}
				<div class="space-y-8">

					<!-- Summary KPIs -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Financial Summary</h3>
						<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
							<div class="rounded-xl border border-gray-100 bg-amber-50 p-4">
								<p class="text-xs font-medium text-gray-500">Outstanding</p>
								<p class="mt-1 text-xl font-bold text-amber-600">₱{report.financial.summary.totalOutstanding.toLocaleString()}</p>
								<p class="mt-0.5 text-xs text-gray-400">{report.financial.summary.pendingCount} obligations</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-emerald-50 p-4">
								<p class="text-xs font-medium text-gray-500">Collected</p>
								<p class="mt-1 text-xl font-bold text-emerald-600">₱{report.financial.summary.totalCollected.toLocaleString()}</p>
								<p class="mt-0.5 text-xs text-gray-400">All time</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-blue-50 p-4">
								<p class="text-xs font-medium text-gray-500">Avg Resolution</p>
								<p class="mt-1 text-xl font-bold text-blue-600">{report.financial.avgResolutionDays > 0 ? `${report.financial.avgResolutionDays}d` : '—'}</p>
								<p class="mt-0.5 text-xs text-gray-400">Incident → resolved</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-pink-50 p-4">
								<p class="text-xs font-medium text-gray-500">Total Obligations</p>
								<p class="mt-1 text-xl font-bold text-pink-600">{report.financial.summary.totalObligations}</p>
								<p class="mt-0.5 text-xs text-gray-400">All time</p>
							</div>
						</div>
					</section>

					<!-- Outstanding vs Collected bar + Resolution breakdown side by side -->
					<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
						<!-- Resolution breakdown -->
						<section>
							<h3 class="mb-4 text-base font-semibold text-gray-900">Resolution Breakdown</h3>
							{#if report.financial.resolutionBreakdown.length === 0}
								<p class="text-sm text-gray-400">No resolved obligations yet.</p>
							{:else}
								{@const totalResolved = report.financial.resolutionBreakdown.reduce((s, r) => s + r.count, 0)}
								<div class="space-y-3">
									{#each report.financial.resolutionBreakdown as item}
										{@const pct = totalResolved > 0 ? Math.round((item.count / totalResolved) * 100) : 0}
										{@const colors: Record<string, string> = { payment: 'bg-emerald-500', replacement: 'bg-cyan-500', waiver: 'bg-slate-400' }}
										{@const labels: Record<string, string> = { payment: 'Cash Payment', replacement: 'Item Replaced', waiver: 'Waived' }}
										<div class="flex items-center gap-3">
											<span class="w-24 shrink-0 text-xs text-gray-600">{labels[item.type] ?? item.type}</span>
											<div class="flex-1 h-2.5 rounded-full bg-gray-100">
												<div class="h-2.5 rounded-full {colors[item.type] ?? 'bg-gray-400'}" style="width:{pct}%"></div>
											</div>
											<span class="w-20 text-right text-xs text-gray-500">{item.count} ({pct}%)</span>
										</div>
									{/each}
								</div>
							{/if}
						</section>

						<!-- Obligations by category -->
						<section>
							<h3 class="mb-4 text-base font-semibold text-gray-900">Obligations by Category</h3>
							{#if report.financial.obligationsByCategory.length === 0}
								<p class="text-sm text-gray-400">No obligation data.</p>
							{:else}
								{@const maxObl = Math.max(...report.financial.obligationsByCategory.map((o) => o.count), 1)}
								<div class="space-y-3">
									{#each report.financial.obligationsByCategory as cat}
										<div>
											<div class="flex items-center justify-between mb-1">
												<span class="text-sm text-gray-700">{cat.category}</span>
												<span class="text-xs text-gray-500">{cat.count} · ₱{cat.pendingAmount.toLocaleString()} pending</span>
											</div>
											<div class="h-2 w-full rounded-full bg-gray-100">
												<div class="h-2 rounded-full bg-pink-400" style="width:{barWidth(cat.count, maxObl)}"></div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					</div>

					<!-- Monthly revenue -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Monthly Revenue from Replacements</h3>
						{#if report.financial.monthlyRevenue.length === 0}
							<p class="text-sm text-gray-400">No revenue data for the last 6 months.</p>
						{:else}
							{@const maxRev = Math.max(...report.financial.monthlyRevenue.map((m) => m.collected), 1)}
							<div class="overflow-x-auto">
								<div class="flex min-w-max items-end gap-2 h-36 pb-6">
									{#each report.financial.monthlyRevenue as m}
										<div class="flex flex-col items-center gap-1 group" style="min-width:48px">
											<span class="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">₱{m.collected.toLocaleString()}</span>
											<div
												class="w-8 rounded-t bg-emerald-400 hover:bg-emerald-600 transition-colors cursor-default"
												style="height:{Math.max(4, Math.round((m.collected / maxRev) * 100))}px"
												title="{MONTH_NAMES[m.month - 1]} {m.year}: ₱{m.collected.toLocaleString()}"
											></div>
											<span class="text-xs text-gray-400">{MONTH_NAMES[m.month - 1]}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</section>

					<!-- Donation totals -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Donation Totals (Last 6 Months)</h3>
						{#if report.financial.donationTotals.length === 0}
							<p class="text-sm text-gray-400">No donation data for the last 6 months.</p>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Month</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Cash Donations</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item Donations</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each donationByMonth as val}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3 text-sm font-medium text-gray-900">{MONTH_NAMES[parseInt(val.month) - 1]} {val.year}</td>
												<td class="px-4 py-3 text-sm text-emerald-700 font-medium">₱{val.cash.toLocaleString()} <span class="text-gray-400 font-normal">({val.cashCount})</span></td>
												<td class="px-4 py-3 text-sm text-blue-700">{val.itemCount} items</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>
				</div>
			{/if}

			<!-- ══ STUDENT RISK TAB ════════════════════════════════════════════ -->
			{#if activeTab === 'risk'}
				<div class="space-y-8">

					<!-- Repeat offenders -->
					<section>
						<h3 class="mb-1 text-base font-semibold text-gray-900">Repeat Offenders</h3>
						<p class="mb-4 text-xs text-gray-400">Students with the most active (unpaid) financial obligations.</p>
						{#if report.studentRisk.repeatOffenders.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
								<p class="text-sm text-emerald-600 font-medium">No students with active obligations</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Active Obligations</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Total Balance</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each report.studentRisk.repeatOffenders as s}
											<tr class="hover:bg-gray-50">
												<td class="px-4 py-3">
													<div class="flex items-center gap-3">
														<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
															{#if s.profilePhotoUrl}
																<img src={s.profilePhotoUrl} alt={s.studentName} class="h-full w-full object-cover" loading="lazy" />
															{:else}
																{getInitials(s.studentName)}
															{/if}
														</div>
														<div>
															<p class="text-sm font-medium text-gray-900">{s.studentName.trim() || 'Unknown'}</p>
															<p class="text-xs text-gray-400">{s.studentEmail}</p>
														</div>
													</div>
												</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
														{s.activeObligations}
													</span>
												</td>
												<td class="px-4 py-3 text-sm font-semibold text-amber-600">₱{(s.totalBalance ?? 0).toLocaleString()}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</section>

					<!-- High incident rate -->
					<section>
						<h3 class="mb-1 text-base font-semibold text-gray-900">Highest Incident Rate</h3>
						<p class="mb-4 text-xs text-gray-400">Students with the most damage/missing incidents this period.</p>
						{#if report.studentRisk.highIncidentStudents.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
								<p class="text-sm text-emerald-600 font-medium">No incidents recorded this period</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each report.studentRisk.highIncidentStudents as s}
									<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
										<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
											{#if s.profilePhotoUrl}
												<img src={s.profilePhotoUrl} alt={s.studentName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{getInitials(s.studentName)}
											{/if}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-gray-900 truncate">{s.studentName.trim() || 'Unknown'}</p>
											<p class="text-xs text-gray-400 truncate">{s.studentEmail}</p>
										</div>
										<div class="flex items-center gap-2 shrink-0">
											{#if (s.missingCount ?? 0) > 0}
												<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{s.missingCount} missing</span>
											{/if}
											{#if (s.damagedCount ?? 0) > 0}
												<span class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">{s.damagedCount} damaged</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<!-- Overdue students -->
					<section>
						<h3 class="mb-1 text-base font-semibold text-gray-900">Students with Overdue Returns</h3>
						<p class="mb-4 text-xs text-gray-400">Currently borrowed items past their return date.</p>
						{#if report.studentRisk.overdueStudents.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
								<p class="text-sm text-emerald-600 font-medium">No overdue returns</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each report.studentRisk.overdueStudents as s}
									<div class="flex items-center gap-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
										<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
											{#if s.profilePhotoUrl}
												<img src={s.profilePhotoUrl} alt={s.studentName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{getInitials(s.studentName)}
											{/if}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-gray-900 truncate">{s.studentName.trim() || 'Unknown'}</p>
											<p class="text-xs text-gray-400 truncate">{s.studentEmail}</p>
										</div>
										<div class="flex items-center gap-2 shrink-0">
											<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{s.overdueCount} overdue</span>
											<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{s.daysOverdue}d late</span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<!-- Trust scores -->
					<section>
						<h3 class="mb-1 text-base font-semibold text-gray-900">Student Trust Scores</h3>
						<p class="mb-4 text-xs text-gray-400">
							Ratio of clean returns vs. total items returned this period. Minimum 3 items required.
							Showing lowest-trust students first.
						</p>
						{#if report.studentRisk.trustScores.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
								<p class="text-sm text-gray-400">Not enough return data to calculate trust scores.</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each report.studentRisk.trustScores as s}
									<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
										<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
											{#if s.profilePhotoUrl}
												<img src={s.profilePhotoUrl} alt={s.studentName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{getInitials(s.studentName)}
											{/if}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-gray-900 truncate">{s.studentName.trim() || 'Unknown'}</p>
											<p class="text-xs text-gray-400">{s.cleanItems ?? 0}/{s.totalItems ?? 0} clean returns</p>
										</div>
										<div class="flex items-center gap-3 shrink-0">
											<!-- Trust bar -->
											<div class="hidden sm:flex items-center gap-2">
												<div class="w-24 h-2 rounded-full bg-gray-100">
													<div
														class="h-2 rounded-full transition-all {(s.trustScore ?? 0) >= 90 ? 'bg-emerald-500' : (s.trustScore ?? 0) >= 70 ? 'bg-yellow-400' : 'bg-red-500'}"
														style="width:{s.trustScore ?? 0}%"
													></div>
												</div>
											</div>
											<span class="text-sm font-bold {(s.trustScore ?? 0) >= 90 ? 'text-emerald-600' : (s.trustScore ?? 0) >= 70 ? 'text-yellow-600' : 'text-red-600'}">
												{s.trustScore ?? 0}%
											</span>
											<span class="rounded-full px-2 py-0.5 text-xs font-semibold {trustBadge(s.trustScore ?? 0)}">
												{trustLabel(s.trustScore ?? 0)}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				</div>
			{/if}

			{/if} <!-- end else (not loading, no error) -->
		</div>
	</div>
</div>
