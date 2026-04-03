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
	import { FileText, AlertCircle, DollarSign, PackageX } from 'lucide-svelte';

	// ── State ─────────────────────────────────────────────────────────────────

	type Tab = 'borrow' | 'inventory' | 'conditions' | 'risk';

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

	const conditionOrder = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'] as const;

	const conditionMeta: Record<string, { label: string; bar: string; badge: string }> = {
		Excellent: { label: 'Excellent', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
		Good:      { label: 'Good',      bar: 'bg-green-400',   badge: 'bg-green-100 text-green-800'   },
		Fair:      { label: 'Fair',      bar: 'bg-yellow-400',  badge: 'bg-yellow-100 text-yellow-800' },
		Poor:      { label: 'Poor',      bar: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-800' },
		Damaged:   { label: 'Damaged',   bar: 'bg-red-500',     badge: 'bg-red-100 text-red-800'       }
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

	// ── Condition overview derived values ─────────────────────────────────────

	const totalConditionItems = $derived(
		report?.inventory.conditionDistribution.reduce((s, c) => s + c.count, 0) ?? 0
	);

	const needsAttention = $derived(
		report?.inventory.conditionDistribution
			.filter((c) => c.condition === 'Poor' || c.condition === 'Damaged')
			.reduce((s, c) => s + c.count, 0) ?? 0
	);

	// ── Item Conditions tab derived values ────────────────────────────────────

	const conditionItemRows = $derived(
		report?.inventory.eomVariance ?? []
	);

	const conditionSummary = $derived({
		good:    conditionItemRows.filter(i => i.condition === 'Good' || i.condition === 'Excellent').length,
		fair:    conditionItemRows.filter(i => i.condition === 'Fair').length,
		poor:    conditionItemRows.filter(i => i.condition === 'Poor').length,
		damaged: conditionItemRows.filter(i => i.condition === 'Damaged').length
	});

	// Donation totals grouped by month (computed, not in template)
	const donationByMonth = $derived.by(() => {
		const map = new Map<string, { year: string; month: string; itemCount: number; totalQuantity: number }>();
		for (const d of report?.replacement.donationTotals ?? []) {
			const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
			const existing = map.get(key) ?? { year: String(d.year), month: String(d.month).padStart(2, '0'), itemCount: 0, totalQuantity: 0 };
			map.set(key, { 
				...existing, 
				itemCount: existing.itemCount + d.count,
				totalQuantity: existing.totalQuantity + d.totalQuantity
			});
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

	// ── Item condition badge helpers ──────────────────────────────────────────

	function conditionBadge(condition: string): string {
		switch (condition) {
			case 'Excellent': return 'bg-emerald-100 text-emerald-800';
			case 'Good':      return 'bg-green-100 text-green-800';
			case 'Fair':      return 'bg-yellow-100 text-yellow-800';
			case 'Poor':      return 'bg-orange-100 text-orange-800';
			case 'Damaged':   return 'bg-red-100 text-red-800';
			default:          return 'bg-gray-100 text-gray-600';
		}
	}

	function conditionDot(condition: string): string {
		switch (condition) {
			case 'Excellent': return 'bg-emerald-500';
			case 'Good':      return 'bg-green-400';
			case 'Fair':      return 'bg-yellow-400';
			case 'Poor':      return 'bg-orange-400';
			case 'Damaged':   return 'bg-red-500';
			default:          return 'bg-gray-400';
		}
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

<div class="space-y-6">

	<!-- ── Header ──────────────────────────────────────────────────────────── -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Reports & Analytics</h1>
			<p class="mt-1 text-sm text-gray-500">
				Operational insights across borrowing, inventory, and student risk.
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
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#if isLoading}
			{#each Array(4) as _}
				<div class="rounded-lg bg-white p-3 shadow sm:p-5">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 space-y-2">
							<Skeleton class="h-3.5 w-28" />
							<Skeleton class="h-8 w-20" />
							<Skeleton class="h-3 w-16" />
						</div>
						<Skeleton class="h-9 w-9 rounded-full sm:h-12 sm:w-12" />
					</div>
				</div>
			{/each}
		{:else}
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Requests</p>
						<p class="mt-1 text-2xl font-semibold text-pink-600 sm:mt-2 sm:text-3xl">{totalRequests.toLocaleString()}</p>
						<p class="text-xs text-gray-500 mt-0.5">This {period}</p>
					</div>
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 sm:h-12 sm:w-12">
						<FileText size={18} class="text-pink-600 sm:hidden" />
						<FileText size={24} class="hidden text-pink-600 sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Overdue Returns</p>
						<p class="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl {(report?.borrowRequests.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}">
							{report?.borrowRequests.overdueCount ?? 0}
						</p>
						<p class="text-xs text-gray-500 mt-0.5">Currently active</p>
					</div>
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {(report?.borrowRequests.overdueCount ?? 0) > 0 ? 'bg-red-100' : 'bg-emerald-100'} sm:h-12 sm:w-12">
						<AlertCircle size={18} class="{(report?.borrowRequests.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'} sm:hidden" />
						<AlertCircle size={24} class="hidden {(report?.borrowRequests.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'} sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Outstanding</p>
						<p class="mt-1 text-2xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">
							₱{(report?.replacement.summary.totalOutstanding ?? 0).toLocaleString()}
						</p>
						<p class="text-xs text-gray-500 mt-0.5">{report?.replacement.summary.pendingCount ?? 0} pending</p>
					</div>
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12">
						<DollarSign size={18} class="text-amber-600 sm:hidden" />
						<DollarSign size={24} class="hidden text-amber-600 sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Stock Alerts</p>
						<p class="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl {(report?.inventory.stockAlerts.length ?? 0) > 0 ? 'text-orange-600' : 'text-emerald-600'}">
							{report?.inventory.stockAlerts.length ?? 0}
						</p>
						<p class="text-xs text-gray-500 mt-0.5">Low / out of stock</p>
					</div>
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {(report?.inventory.stockAlerts.length ?? 0) > 0 ? 'bg-orange-100' : 'bg-emerald-100'} sm:h-12 sm:w-12">
						<PackageX size={18} class="{(report?.inventory.stockAlerts.length ?? 0) > 0 ? 'text-orange-600' : 'text-emerald-600'} sm:hidden" />
						<PackageX size={24} class="hidden {(report?.inventory.stockAlerts.length ?? 0) > 0 ? 'text-orange-600' : 'text-emerald-600'} sm:block" />
					</div>
				</div>
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
					{ key: 'conditions', label: 'Item Conditions' },
					{ key: 'risk', label: 'Student Risk' }
				] as tab}
					<button
						onclick={() => {
							activeTab = tab.key as Tab;
						}}
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

					<!-- Item Condition Overview -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Item Condition Overview</h3>

						<!-- KPI strip -->
						<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
							{#each conditionOrder as cond}
								{@const item = report.inventory.conditionDistribution.find(c => c.condition === cond)}
								{@const count = item?.count ?? 0}
								{@const meta = conditionMeta[cond]}
								<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
									<p class="text-2xl font-bold text-gray-900">{count}</p>
									<span class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium {meta.badge}">{meta.label}</span>
								</div>
							{/each}
						</div>

						<!-- Distribution bar -->
						{#if totalConditionItems > 0}
							<div class="mb-2 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
								{#each conditionOrder as cond}
									{@const item = report.inventory.conditionDistribution.find(c => c.condition === cond)}
									{@const pct = item ? Math.round((item.count / totalConditionItems) * 100) : 0}
									{#if pct > 0}
										<div
											class="{conditionMeta[cond].bar} transition-all"
											style="width:{pct}%"
											title="{cond}: {item?.count} ({pct}%)"
										></div>
									{/if}
								{/each}
							</div>
							<div class="mb-6 flex flex-wrap gap-3">
								{#each conditionOrder as cond}
									{@const item = report.inventory.conditionDistribution.find(c => c.condition === cond)}
									{@const pct = item && totalConditionItems > 0 ? Math.round((item.count / totalConditionItems) * 100) : 0}
									<div class="flex items-center gap-1.5">
										<div class="h-2.5 w-2.5 rounded-full {conditionMeta[cond].bar}"></div>
										<span class="text-xs text-gray-500">{cond} {pct}%</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Needs-attention callout -->
						{#if needsAttention > 0}
							<div class="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
								<svg class="mt-0.5 h-4 w-4 shrink-0 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
								<p class="text-sm text-orange-800">
									<span class="font-semibold">{needsAttention} item{needsAttention !== 1 ? 's' : ''}</span> in Poor or Damaged condition require immediate attention.
								</p>
							</div>
						{:else if totalConditionItems > 0}
							<div class="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
								<svg class="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
								<p class="text-sm font-medium text-emerald-800">All items are in acceptable condition.</p>
							</div>
						{/if}
					</section>

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

					<!-- Stock Alerts -->
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
			{/if}

			<!-- ══ ITEM CONDITIONS TAB ════════════════════════════════════════ -->
			{#if activeTab === 'conditions'}
				<div class="space-y-8">

					<!-- Summary KPI strip -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Condition Summary</h3>
						<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
							<div class="rounded-xl border border-gray-100 bg-green-50 p-5">
								<p class="text-xs font-medium text-gray-500">Good / Excellent</p>
								<p class="mt-1 text-3xl font-bold text-green-600">{conditionSummary.good}</p>
								<p class="mt-0.5 text-xs text-gray-400">Ready to use</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-yellow-50 p-5">
								<p class="text-xs font-medium text-gray-500">Fair</p>
								<p class="mt-1 text-3xl font-bold text-yellow-600">{conditionSummary.fair}</p>
								<p class="mt-0.5 text-xs text-gray-400">Monitor closely</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-orange-50 p-5">
								<p class="text-xs font-medium text-gray-500">Poor</p>
								<p class="mt-1 text-3xl font-bold text-orange-600">{conditionSummary.poor}</p>
								<p class="mt-0.5 text-xs text-gray-400">Needs attention</p>
							</div>
							<div class="rounded-xl border border-gray-100 bg-red-50 p-5">
								<p class="text-xs font-medium text-gray-500">Damaged</p>
								<p class="mt-1 text-3xl font-bold text-red-600">{conditionSummary.damaged}</p>
								<p class="mt-0.5 text-xs text-gray-400">Out of service</p>
							</div>
						</div>
					</section>

					<!-- Per-item condition table -->
					<section>
						<div class="mb-4 flex items-center justify-between">
							<h3 class="text-base font-semibold text-gray-900">Item Condition Tracking</h3>
							{#if conditionSummary.poor + conditionSummary.damaged > 0}
								<span class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
									<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
									{conditionSummary.poor + conditionSummary.damaged} item{conditionSummary.poor + conditionSummary.damaged !== 1 ? 's' : ''} require attention
								</span>
							{/if}
						</div>

						{#if conditionItemRows.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
								<svg class="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
								</svg>
								<p class="text-sm text-gray-400">No inventory data available for this period.</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Qty in Stock</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">EOM Count</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Variance</th>
											<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#each conditionItemRows as item}
											<tr class="hover:bg-gray-50 {item.condition === 'Damaged' || item.condition === 'Poor' ? 'bg-red-50/30' : ''}">
												<td class="px-4 py-3">
													<div class="flex items-center gap-2">
														<span class="h-2 w-2 shrink-0 rounded-full {conditionDot(item.condition)}"></span>
														<span class="text-sm font-medium text-gray-900">{item.name}</span>
													</div>
												</td>
												<td class="px-4 py-3 text-sm text-gray-500">{item.category}</td>
												<td class="px-4 py-3 text-sm text-gray-700">{item.quantity}</td>
												<td class="px-4 py-3 text-sm text-gray-700">{item.eomCount}</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {item.variance < 0 ? 'bg-red-100 text-red-800' : item.variance > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}">
														{item.variance > 0 ? '+' : ''}{item.variance}
													</span>
												</td>
												<td class="px-4 py-3">
													<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {conditionBadge(item.condition)}">
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

					<!-- Condition distribution bar (reused from inventory tab) -->
					<section>
						<h3 class="mb-4 text-base font-semibold text-gray-900">Fleet Condition Distribution</h3>
						{#if totalConditionItems === 0}
							<p class="text-sm text-gray-400">No condition data available.</p>
						{:else}
							<div class="mb-2 flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
								{#each conditionOrder as cond}
									{@const entry = report.inventory.conditionDistribution.find(c => c.condition === cond)}
									{@const pct = entry ? Math.round((entry.count / totalConditionItems) * 100) : 0}
									{#if pct > 0}
										<div
											class="{conditionMeta[cond].bar} transition-all"
											style="width:{pct}%"
											title="{cond}: {entry?.count} ({pct}%)"
										></div>
									{/if}
								{/each}
							</div>
							<div class="mt-3 flex flex-wrap gap-4">
								{#each conditionOrder as cond}
									{@const entry = report.inventory.conditionDistribution.find(c => c.condition === cond)}
									{@const count = entry?.count ?? 0}
									{@const pct = totalConditionItems > 0 ? Math.round((count / totalConditionItems) * 100) : 0}
									<div class="flex items-center gap-2">
										<div class="h-3 w-3 rounded-full {conditionMeta[cond].bar}"></div>
										<span class="text-sm text-gray-600">{cond}</span>
										<span class="text-sm font-semibold text-gray-900">{count}</span>
										<span class="text-xs text-gray-400">({pct}%)</span>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<!-- Items with highest incident rate (damage/missing) -->
					<section>
						<h3 class="mb-1 text-base font-semibold text-gray-900">Highest Incident Rate</h3>
						<p class="mb-4 text-xs text-gray-400">Items with the most damage or missing reports this period.</p>
						{#if report.inventory.damageRateItems.length === 0}
							<div class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
								<p class="text-sm text-emerald-600 font-medium">No incidents recorded this period.</p>
							</div>
						{:else}
							{@const maxRate = Math.max(...report.inventory.damageRateItems.map(i => i.incidentRate), 1)}
							<div class="space-y-3">
								{#each report.inventory.damageRateItems as item}
									<div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
										<div class="flex items-center justify-between mb-2">
											<div>
												<p class="text-sm font-medium text-gray-900">{item.name}</p>
												<p class="text-xs text-gray-400">{item.category} · {item.totalInspected} inspected</p>
											</div>
											<div class="flex items-center gap-2 shrink-0">
												{#if item.damaged > 0}
													<span class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">{item.damaged} damaged</span>
												{/if}
												{#if item.missing > 0}
													<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{item.missing} missing</span>
												{/if}
												<span class="rounded-full px-2.5 py-0.5 text-xs font-bold {item.incidentRate >= 50 ? 'bg-red-100 text-red-800' : item.incidentRate >= 25 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}">
													{item.incidentRate}%
												</span>
											</div>
										</div>
										<div class="h-1.5 w-full rounded-full bg-gray-200">
											<div
												class="h-1.5 rounded-full transition-all {item.incidentRate >= 50 ? 'bg-red-500' : item.incidentRate >= 25 ? 'bg-orange-400' : 'bg-yellow-400'}"
												style="width:{barWidth(item.incidentRate, maxRate)}"
											></div>
										</div>
									</div>
								{/each}
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
						<p class="mb-4 text-xs text-gray-400">Students with the most active (unresolved) replacement obligations.</p>
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
