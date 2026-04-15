<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		fetchAnalytics,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		type AnalyticsReport,
		type AnalyticsPeriod
	} from '$lib/api/analyticsReports';
	import { toastStore } from '$lib/stores/toast';
	import ReportsSkeletonLoader from '$lib/components/ui/ReportsSkeletonLoader.svelte';
	import {
		TrendingUp,
		AlertTriangle,
		Users,
		Package,
		BarChart3,
		Download,
		FileText
	} from 'lucide-svelte';

	type Tab = 'overview' | 'borrowing' | 'loss-damage' | 'inventory' | 'students';
	type DatePreset = 'today' | 'last7' | 'mtd' | 'custom';

		const initialTo = todayISO();
		const initialFrom = monthStartISO();
		const initialReport = browser ? peekCachedAnalytics({ period: 'month', from: initialFrom, to: initialTo }) : null;

		let report = $state<AnalyticsReport | null>(initialReport);
		let loading = $state(!initialReport);
		let error = $state<string | null>(null);
		let unsubscribeSSE: (() => void) | null = null;
		let hasMounted = false;
		let pendingLoadTimer: ReturnType<typeof setTimeout> | null = null;

		let activeTab = $state<Tab>('overview');
		let period = $state<AnalyticsPeriod>('month');
		let datePreset = $state<DatePreset>('mtd');
		let customFrom = $state(initialFrom);
		let customTo = $state(initialTo);

		const numberFmt = new Intl.NumberFormat();

		function todayISO(): string {
			return new Date().toISOString().slice(0, 10);
		}

		function monthStartISO(): string {
			const d = new Date();
			return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
		}

		function formatRangeLabel(): string {
			if (datePreset === 'today') return 'Today';
			if (datePreset === 'last7') return 'Last 7 Days';
			if (datePreset === 'mtd') return 'Month-to-Date';
			if (customFrom && customTo) {
				const fromLabel = new Date(customFrom).toLocaleDateString();
				const toLabel = new Date(customTo).toLocaleDateString();
				return `${fromLabel} to ${toLabel}`;
			}
			return 'Custom Range';
		}

		function applyPreset(preset: DatePreset): void {
			datePreset = preset;
			if (preset === 'today') {
				period = 'week';
				customFrom = todayISO();
				customTo = todayISO();
			} else if (preset === 'last7') {
				period = 'week';
				customFrom = '';
				customTo = '';
			} else if (preset === 'mtd') {
				period = 'month';
				customFrom = monthStartISO();
				customTo = todayISO();
			} else {
				customFrom = customFrom || monthStartISO();
				customTo = customTo || todayISO();
			}
			scheduleLoad();
		}

		function scheduleLoad(forceRefresh = false): void {
			if (!hasMounted) return;
			if (pendingLoadTimer) clearTimeout(pendingLoadTimer);
			pendingLoadTimer = setTimeout(() => {
				pendingLoadTimer = null;
				void loadReport(forceRefresh);
			}, 150);
		}

		async function loadReport(forceRefresh = false): Promise<void> {
			if (!browser) return;
			if (forceRefresh || !report) loading = true;
			error = null;
			try {
				const startTime = Date.now();
				report = await fetchAnalytics({ period, from: customFrom || undefined, to: customTo || undefined, forceRefresh });
				console.log('[Reports] Report loaded successfully in', Date.now() - startTime, 'ms');
			} catch (err) {
				console.error('[Reports] Failed to load report:', err);
				error = err instanceof Error ? err.message : 'Failed to load analytics';
				toastStore.error(error, 'Analytics');
			} finally {
				loading = false;
			}
		}

		const totalRequests = $derived(report?.borrowRequests.statusBreakdown.reduce((s, i) => s + i.count, 0) ?? 0);
		const returnedCount = $derived(report?.borrowRequests.statusBreakdown.find((s) => s.status === 'returned')?.count ?? 0);
		const overdueCount = $derived(report?.borrowRequests.overdueCount ?? 0);
		const returnRate = $derived(totalRequests > 0 ? Math.round((returnedCount / totalRequests) * 100) : 0);
		const borrowingAvg = $derived(report?.borrowRequests.borrowingAverages ?? { avgItemsPerRequest: 0, avgQuantityPerRequest: 0, totalRequests: 0 });
		const inventorySummary = $derived(report?.inventory.summary ?? {
			currentCount: 0,
			eomCount: 0,
			variance: 0,
			donations: 0,
			constantCount: 0,
			lowStockCount: 0
		});
		const inventoryVarianceRows = $derived(
			(report?.inventory.eomVariance ?? [])
				.filter((item) => item.variance !== 0)
				.slice()
				.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || b.variance - a.variance)
		);
		const inventoryOverTotal = $derived(
			inventoryVarianceRows.reduce((sum, item) => (item.variance > 0 ? sum + item.variance : sum), 0)
		);
		const inventoryShortTotal = $derived(
			inventoryVarianceRows.reduce((sum, item) => (item.variance < 0 ? sum + item.variance : sum), 0)
		);
		const lossAndDamageSummary = $derived(report?.lossAndDamage.summary ?? {
			todayTotal: 0, todayMissing: 0, todayDamaged: 0,
			last7DaysTotal: 0, last7DaysMissing: 0, last7DaysDamaged: 0,
			mtdTotal: 0, mtdMissing: 0, mtdDamaged: 0,
			periodTotal: 0, periodMissing: 0, periodDamaged: 0
		});
		const studentTrustScores = $derived(
			(report?.studentRisk.trustScores ?? [])
				.filter((student) => typeof student.trustScore === 'number')
				.slice()
				.sort((a, b) => (a.trustScore ?? 0) - (b.trustScore ?? 0))
		);
		const averageTrustScore = $derived(
			studentTrustScores.length > 0
				? Math.round(studentTrustScores.reduce((sum, student) => sum + (student.trustScore ?? 0), 0) / studentTrustScores.length)
				: 0
		);
		const topBorrowedOverview = $derived((report?.borrowRequests.itemsBorrowed ?? []).slice(0, 6));
		const topBorrowedMax = $derived(
			topBorrowedOverview.length > 0
				? Math.max(...topBorrowedOverview.map((item) => item.totalQuantity), 1)
				: 1
		);
		const lossDamageTotal = $derived(lossAndDamageSummary.periodMissing + lossAndDamageSummary.periodDamaged);
		const trustTierBreakdown = $derived.by(() => {
			const tiers: Array<{ key: string; label: string; count: number; color: string }> = [
				{ key: 'excellent', label: 'Excellent', count: 0, color: 'bg-emerald-500' },
				{ key: 'good', label: 'Good', count: 0, color: 'bg-pink-500' },
				{ key: 'fair', label: 'Fair', count: 0, color: 'bg-amber-500' },
				{ key: 'poor', label: 'Poor', count: 0, color: 'bg-orange-500' },
				{ key: 'critical', label: 'Critical', count: 0, color: 'bg-rose-500' }
			];
			for (const student of studentTrustScores) {
				const idx = tiers.findIndex((tier) => tier.key === (student.trustTier ?? ''));
				if (idx >= 0) tiers[idx].count += 1;
			}
			return tiers;
		});
		const trustTierMax = $derived(
			trustTierBreakdown.length > 0
				? Math.max(...trustTierBreakdown.map((tier) => tier.count), 1)
				: 1
		);
		const inventoryCompareMax = $derived(
			Math.max(
				inventorySummary.currentCount,
				inventorySummary.eomCount,
				inventoryOverTotal,
				Math.abs(inventoryShortTotal),
				1
			)
		);

		function getBorrowStatusColor(status: string): string {
			const key = status.toLowerCase();
			if (key === 'returned') return '#10b981';
			if (key === 'borrowed' || key === 'active') return '#ec4899';
			if (key === 'approved' || key === 'ready') return '#3b82f6';
			if (key === 'cancelled' || key === 'rejected') return '#94a3b8';
			if (key === 'missing') return '#f43f5e';
			return '#a855f7';
		}

		const statusChartSeries = $derived.by(() => {
			const rows = report?.borrowRequests.statusBreakdown ?? [];
			const total = rows.reduce((sum, row) => sum + row.count, 0);
			if (total === 0) return [] as Array<{ status: string; count: number; pct: number; color: string }>;
			return rows
				.map((row) => ({
					status: row.status,
					count: row.count,
					pct: (row.count / total) * 100,
					color: getBorrowStatusColor(row.status)
				}))
				.sort((a, b) => b.count - a.count);
		});

		const statusDonutStyle = $derived.by(() => {
			if (statusChartSeries.length === 0) return 'conic-gradient(#e5e7eb 0 360deg)';
			let offset = 0;
			const parts: string[] = [];
			for (const slice of statusChartSeries) {
				const next = offset + slice.pct;
				parts.push(`${slice.color} ${offset}% ${next}%`);
				offset = next;
			}
			return `conic-gradient(${parts.join(', ')})`;
		});

		const lossDamageDonutStyle = $derived.by(() => {
			if (lossDamageTotal === 0) return 'conic-gradient(#e5e7eb 0 360deg)';
			const missingPct = (lossAndDamageSummary.periodMissing / lossDamageTotal) * 100;
			return `conic-gradient(#f43f5e 0% ${missingPct}%, #f59e0b ${missingPct}% 100%)`;
		});

		function getTrustTierClasses(tier?: string): string {
			if (tier === 'excellent') return 'bg-emerald-100 text-emerald-700';
			if (tier === 'good') return 'bg-green-100 text-green-700';
			if (tier === 'fair') return 'bg-amber-100 text-amber-700';
			if (tier === 'poor') return 'bg-orange-100 text-orange-700';
			if (tier === 'critical') return 'bg-rose-100 text-rose-700';
			return 'bg-gray-100 text-gray-700';
		}

		function getTrustBarClasses(score?: number): string {
			if ((score ?? 0) >= 90) return 'bg-emerald-500';
			if ((score ?? 0) >= 75) return 'bg-green-500';
			if ((score ?? 0) >= 60) return 'bg-amber-500';
			if ((score ?? 0) >= 40) return 'bg-orange-500';
			return 'bg-rose-500';
		}

		function getTrustScoreTextClass(tier?: string): string {
			if (tier === 'excellent') return 'text-emerald-700';
			if (tier === 'good') return 'text-pink-700';
			if (tier === 'fair') return 'text-amber-700';
			if (tier === 'poor') return 'text-orange-700';
			if (tier === 'critical') return 'text-red-700';
			return 'text-gray-900';
		}

		onMount(() => {
			hasMounted = true;
			if (!initialReport) {
				void loadReport();
			}
			unsubscribeSSE = subscribeToAnalyticsChanges(() => scheduleLoad(true));
			return () => {
				if (pendingLoadTimer) clearTimeout(pendingLoadTimer);
				unsubscribeSSE?.();
			};
		});
	</script>

	<div class="space-y-6">
		<!-- Header -->
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Reports & Analytics</h1>
			<p class="mt-1 text-sm text-gray-500">Professional borrowing, loss/damage, and inventory analytics</p>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-wrap items-center gap-3">
				<span class="text-sm font-semibold text-gray-700">Date Range:</span>
				{#each [
					{ id: 'today', label: 'Today' },
					{ id: 'last7', label: 'Last 7 Days' },
					{ id: 'mtd', label: 'Month-to-Date' },
					{ id: 'custom', label: 'Custom' }
				] as option}
					<button onclick={() => applyPreset(option.id as DatePreset)} class="rounded-lg px-4 py-2 text-sm font-medium transition {datePreset === option.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
						{option.label}
					</button>
				{/each}
			</div>
			{#if datePreset === 'custom'}
				<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div>
						<label for="custom-from" class="block text-xs font-medium text-gray-700">From</label>
						<input id="custom-from" type="date" bind:value={customFrom} onchange={() => scheduleLoad()} class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
					</div>
					<div>
						<label for="custom-to" class="block text-xs font-medium text-gray-700">To</label>
						<input id="custom-to" type="date" bind:value={customTo} onchange={() => scheduleLoad()} class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
					</div>
				</div>
			{/if}
		</div>

	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-4">
			<nav class="flex gap-4 overflow-x-auto" aria-label="Report tabs">
				{#each [
					{ id: 'overview', label: 'Overview', icon: BarChart3 },
					{ id: 'borrowing', label: 'Borrowing Analytics', icon: Package },
					{ id: 'loss-damage', label: 'Loss & Damage', icon: AlertTriangle },
					{ id: 'inventory', label: 'Inventory', icon: Package },
					{ id: 'students', label: 'Student Risk', icon: Users }
				] as tab}
					<button onclick={() => (activeTab = tab.id as Tab)} class="flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}">
						<tab.icon size={16} />
						{tab.label}
					</button>
				{/each}
			</nav>
		</div>

		{#if loading}
			<div class="p-6">
				<ReportsSkeletonLoader view={activeTab} />
			</div>
		{:else if error}
			<div class="px-6 py-12">
				<div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
			</div>
		{:else if report}
			<div class="p-6 space-y-6">

				{#if activeTab === 'overview'}
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div class="rounded-xl border border-gray-200 bg-linear-to-br from-pink-50 to-white p-5">
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Total Requests</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">{numberFmt.format(totalRequests)}</p>
									<p class="mt-1 text-xs text-gray-600">Period total</p>
								</div>
								<div class="rounded-full bg-pink-100 p-3"><BarChart3 size={20} class="text-pink-600" /></div>
							</div>
						</div>
						<div class="rounded-xl border border-gray-200 bg-linear-to-br from-emerald-50 to-white p-5">
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Return Rate</p>
									<p class="mt-2 text-3xl font-bold {returnRate >= 85 ? 'text-emerald-600' : 'text-amber-600'}">{returnRate}%</p>
									<p class="mt-1 text-xs text-gray-600">Target: 90%</p>
								</div>
								<div class="rounded-full bg-emerald-100 p-3"><TrendingUp size={20} class="text-emerald-600" /></div>
							</div>
						</div>
						<div class="rounded-xl border border-gray-200 bg-linear-to-br from-rose-50 to-white p-5">
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Overdue Items</p>
									<p class="mt-2 text-3xl font-bold {overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}">{numberFmt.format(overdueCount)}</p>
									<p class="mt-1 text-xs text-gray-600">Requires attention</p>
								</div>
								<div class="rounded-full bg-rose-100 p-3"><AlertTriangle size={20} class="text-rose-600" /></div>
							</div>
						</div>
						<div class="rounded-xl border border-gray-200 bg-linear-to-br from-amber-50 to-white p-5">
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-semibold text-gray-700">Loss/Damage (MTD)</p>
									<p class="mt-2 text-3xl font-bold text-amber-600">{numberFmt.format(lossAndDamageSummary.mtdTotal)}</p>
									<p class="mt-1 text-xs text-gray-600">{lossAndDamageSummary.mtdMissing} missing, {lossAndDamageSummary.mtdDamaged} damaged</p>
								</div>
								<div class="rounded-full bg-amber-100 p-3"><AlertTriangle size={20} class="text-amber-600" /></div>
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-xl border border-gray-200 bg-white p-5">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-semibold text-gray-900">Borrowing Status Mix</h3>
								<p class="text-xs text-gray-500">{numberFmt.format(totalRequests)} requests</p>
							</div>
							{#if statusChartSeries.length === 0}
								<div class="mt-4 flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
									<div class="max-w-sm">
										<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
											<BarChart3 size={32} class="text-pink-600" />
										</div>
										<h4 class="mt-6 text-base font-semibold text-gray-900">No status data</h4>
										<p class="mt-2 text-sm leading-6 text-gray-600">Borrowing status distribution will appear here once requests are recorded in the selected range.</p>
									</div>
								</div>
							{:else}
								<div class="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
									<div class="mx-auto h-40 w-40 rounded-full" style={`background: ${statusDonutStyle}`}>
										<div class="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-white text-center">
											<div>
												<p class="text-xl font-bold text-gray-900">{numberFmt.format(totalRequests)}</p>
												<p class="text-[11px] uppercase tracking-wide text-gray-500">Total</p>
											</div>
										</div>
									</div>
									<div class="space-y-2">
										{#each statusChartSeries as row}
											<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
												<div class="flex items-center gap-2">
													<span class="h-2.5 w-2.5 rounded-full" style={`background:${row.color}`}></span>
													<span class="text-sm font-medium capitalize text-gray-700">{row.status.replace(/_/g, ' ')}</span>
												</div>
												<span class="text-sm font-semibold text-gray-900">{row.count} ({row.pct.toFixed(0)}%)</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-semibold text-gray-900">Top Borrowed Items</h3>
								<p class="text-xs text-gray-500">By quantity</p>
							</div>
							<div class="mt-4 space-y-3">
								{#if topBorrowedOverview.length === 0}
									<div class="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
										<div class="max-w-sm">
											<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
												<Package size={32} class="text-pink-600" />
											</div>
											<h4 class="mt-6 text-base font-semibold text-gray-900">No borrowed items</h4>
											<p class="mt-2 text-sm leading-6 text-gray-600">Top borrowed item trends will appear here once requests are recorded in the selected range.</p>
										</div>
									</div>
								{:else}
									{#each topBorrowedOverview as item}
										<div>
											<div class="mb-1 flex items-center justify-between">
												<p class="truncate text-sm font-medium text-gray-800">{item.name}</p>
												<p class="text-xs font-semibold text-pink-700">{item.totalQuantity}</p>
											</div>
											<div class="h-2.5 rounded-full bg-gray-100">
												<div class="h-2.5 rounded-full bg-pink-500" style={`width: ${(item.totalQuantity / topBorrowedMax) * 100}%`}></div>
											</div>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-xl border border-gray-200 bg-white p-5">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-semibold text-gray-900">Loss vs Damage</h3>
								<p class="text-xs text-gray-500">Selected range</p>
							</div>
							<div class="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
								<div class="mx-auto h-40 w-40 rounded-full" style={`background: ${lossDamageDonutStyle}`}>
									<div class="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-white text-center">
										<div>
											<p class="text-xl font-bold text-gray-900">{numberFmt.format(lossDamageTotal)}</p>
											<p class="text-[11px] uppercase tracking-wide text-gray-500">Incidents</p>
										</div>
									</div>
								</div>
								<div class="space-y-2">
									<div class="rounded-lg bg-rose-50 px-3 py-2">
										<p class="text-sm font-semibold text-rose-700">Missing: {numberFmt.format(lossAndDamageSummary.periodMissing)}</p>
									</div>
									<div class="rounded-lg bg-amber-50 px-3 py-2">
										<p class="text-sm font-semibold text-amber-700">Damaged: {numberFmt.format(lossAndDamageSummary.periodDamaged)}</p>
									</div>
									<p class="text-xs text-gray-500">This chart complements the detailed Loss & Damage tab.</p>
								</div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-semibold text-gray-900">Inventory & Risk Signals</h3>
								<p class="text-xs text-gray-500">Cross-tab snapshot</p>
							</div>

							<div class="mt-4 space-y-4">
								<div>
									<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Inventory Compare</p>
									<div class="space-y-2">
										{#each [
											{ label: 'Current', value: inventorySummary.currentCount, color: 'bg-gray-700' },
											{ label: 'EOM', value: inventorySummary.eomCount, color: 'bg-slate-500' },
											{ label: 'Over (+)', value: inventoryOverTotal, color: 'bg-emerald-500' },
											{ label: 'Variance (-)', value: Math.abs(inventoryShortTotal), color: 'bg-rose-500' }
										] as row}
											<div class="flex items-center gap-2">
												<p class="w-24 text-xs font-medium text-gray-600">{row.label}</p>
												<div class="h-2.5 flex-1 rounded-full bg-gray-100">
													<div class={`h-2.5 rounded-full ${row.color}`} style={`width: ${(row.value / inventoryCompareMax) * 100}%`}></div>
												</div>
												<p class="w-16 text-right text-xs font-semibold text-gray-700">{numberFmt.format(row.value)}</p>
											</div>
										{/each}
									</div>
								</div>

								<div>
									<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Student Trust Tiers</p>
									<div class="space-y-2">
										{#each trustTierBreakdown as tier}
											<div class="flex items-center gap-2">
												<p class="w-24 text-xs font-medium text-gray-600">{tier.label}</p>
												<div class="h-2.5 flex-1 rounded-full bg-gray-100">
													<div class={`h-2.5 rounded-full ${tier.color}`} style={`width: ${(tier.count / trustTierMax) * 100}%`}></div>
												</div>
												<p class="w-8 text-right text-xs font-semibold text-gray-700">{tier.count}</p>
											</div>
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'borrowing'}
					<div class="space-y-6">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Borrowing Analytics</h3>
									<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()}</p>
								</div>
								<p class="text-xs text-gray-500">All borrowed items and borrowers in the selected period</p>
							</div>

							<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Total Requests</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">{numberFmt.format(borrowingAvg.totalRequests)}</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Avg Items / Request</p>
									<p class="mt-2 text-2xl font-bold text-pink-700">{borrowingAvg.avgItemsPerRequest.toFixed(1)}</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Avg Quantity / Request</p>
									<p class="mt-2 text-2xl font-bold text-purple-700">{borrowingAvg.avgQuantityPerRequest.toFixed(1)}</p>
								</div>
							</div>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<h3 class="text-lg font-semibold text-gray-900">Borrowed Items</h3>
								<p class="mt-1 text-xs text-gray-600">{report.borrowRequests.itemsBorrowed.length} unique items in the selected range</p>
								<div class="mt-4 min-h-80">
									{#if report.borrowRequests.itemsBorrowed.length === 0}
										<div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
											<div class="max-w-sm">
												<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
													<FileText size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">No borrowed items</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600">Borrowed items for the selected range will appear here once requests are recorded.</p>
											</div>
										</div>
									{:else}
										<div class="max-h-80 space-y-2 overflow-y-auto">
											{#each report.borrowRequests.itemsBorrowed as item}
												<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
													<div class="flex items-center justify-between">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
															<p class="text-xs text-gray-600">{item.category}</p>
														</div>
														<div class="ml-3 text-right">
															<p class="text-sm font-bold text-pink-600">{item.totalQuantity}</p>
															<p class="text-xs text-gray-500">{item.borrowCount} req</p>
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>

							<div class="rounded-xl border border-gray-200 bg-white p-5">
								<h3 class="text-lg font-semibold text-gray-900">Borrowers</h3>
								<p class="mt-1 text-xs text-gray-600">{report.borrowRequests.borrowers.length} students in the selected range</p>
								<div class="mt-4 min-h-80">
									{#if report.borrowRequests.borrowers.length === 0}
										<div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
											<div class="max-w-sm">
												<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
													<FileText size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">No borrowers</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600">Borrower records for the selected range will appear here once requests are logged.</p>
											</div>
										</div>
									{:else}
										<div class="max-h-80 space-y-2 overflow-y-auto">
											{#each report.borrowRequests.borrowers as borrower}
												<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
													<p class="text-sm font-medium text-gray-900">{borrower.studentName}</p>
													<p class="text-xs text-gray-600">{borrower.studentEmail}</p>
													<div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
														<span>{borrower.requestCount} requests</span>
														<span>•</span>
														<span>{borrower.totalItems} items</span>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'loss-damage'}
					<div class="space-y-6">
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<div class="rounded-xl border border-gray-200 bg-linear-to-br from-rose-50 to-white p-5">
								<p class="text-sm font-semibold text-gray-700">Missing</p>
								<p class="mt-2 text-3xl font-bold text-rose-700">{lossAndDamageSummary.periodMissing}</p>
								<p class="mt-2 text-xs text-gray-500">Items marked missing in selected range</p>
							</div>
							<div class="rounded-xl border border-gray-200 bg-linear-to-br from-amber-50 to-white p-5">
								<p class="text-sm font-semibold text-gray-700">Damaged</p>
								<p class="mt-2 text-3xl font-bold text-amber-700">{lossAndDamageSummary.periodDamaged}</p>
								<p class="mt-2 text-xs text-gray-500">Items marked damaged in selected range</p>
							</div>
							<div class="rounded-xl border border-gray-200 bg-linear-to-br from-gray-50 to-white p-5">
								<p class="text-sm font-semibold text-gray-700">Total Incidents</p>
								<p class="mt-2 text-3xl font-bold text-gray-900">{lossAndDamageSummary.periodTotal}</p>
								<p class="mt-2 text-xs text-gray-500">Missing + Damaged combined in selected range</p>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="text-lg font-semibold text-gray-900">Loss & Damage Tracking</h3>
								<p class="text-sm text-gray-600">{report.lossAndDamage.tracking.length} incidents</p>
							</div>
							<div class="overflow-x-auto">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Type</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Item</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Student</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Incident Date</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Days to Resolve</th>
											<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Request Status</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#if report.lossAndDamage.tracking.length === 0}
											<tr>
												<td colspan="7" class="px-4 py-6">
													<div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
														<div class="max-w-sm">
															<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
																<FileText size={32} class="text-pink-600" />
															</div>
															<h4 class="mt-6 text-base font-semibold text-gray-900">No loss or damage incidents</h4>
															<p class="mt-2 text-sm leading-6 text-gray-600">
																Items reported as missing or damaged will appear here in the selected period.
															</p>
														</div>
													</div>
												</td>
											</tr>
										{:else}
											{#each report.lossAndDamage.tracking as item}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3">
														<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium {item.type === 'missing' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">
															{item.type}
														</span>
													</td>
													<td class="px-4 py-3">
														<p class="text-sm font-medium text-gray-900">{item.itemName}</p>
														<p class="text-xs text-gray-600">{item.itemCategory}</p>
													</td>
													<td class="px-4 py-3 text-sm text-gray-900">{item.studentName}</td>
													<td class="px-4 py-3">
														<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium {item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
															{item.status}
														</span>
													</td>
													<td class="px-4 py-3 text-sm text-gray-700">{new Date(item.incidentDate).toLocaleDateString()}</td>
													<td class="px-4 py-3 text-sm font-medium {item.daysToResolve ? 'text-gray-900' : 'text-gray-400'}">
														{item.daysToResolve ? `${item.daysToResolve} days` : 'Pending'}
													</td>
													<td class="px-4 py-3 text-sm text-gray-700">{item.requestStatus || 'N/A'}</td>
												</tr>
											{/each}
										{/if}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'inventory'}
					<div class="space-y-6">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Inventory Analytics</h3>
									<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()} (scoped to inventory activity in this period)</p>
								</div>
								<p class="text-xs text-gray-500">{inventoryVarianceRows.length} items with variance or overage</p>
							</div>

							<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Current Count</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">{numberFmt.format(inventorySummary.currentCount)}</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">EOM Count</p>
									<p class="mt-2 text-2xl font-bold text-gray-900">{numberFmt.format(inventorySummary.eomCount)}</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Over</p>
									<p class="mt-2 text-2xl font-bold {inventoryOverTotal > 0 ? 'text-emerald-700' : 'text-gray-900'}">
										{inventoryOverTotal > 0 ? '+' : ''}{numberFmt.format(inventoryOverTotal)}
									</p>
								</div>
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
									<p class="text-sm text-gray-600">Variance</p>
									<p class="mt-2 text-2xl font-bold {inventoryShortTotal < 0 ? 'text-rose-700' : 'text-gray-900'}">
										{numberFmt.format(inventoryShortTotal)}
									</p>
								</div>
							</div>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<div class="flex items-center justify-between gap-4">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">Variance Items</h3>
										<p class="mt-1 text-xs text-gray-600">Items where current count differs from EOM count</p>
									</div>
									<p class="text-xs text-gray-500">{inventoryVarianceRows.length} items</p>
								</div>

								<div class="mt-4 space-y-2">
									{#if inventoryVarianceRows.length === 0}
										<div class="flex min-h-70 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
											<div>
												<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
													<Package size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">No inventory variance</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600 max-w-sm">
													All tracked items are aligned with their EOM counts in the selected range.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-104 space-y-2 overflow-y-auto pr-1">
											{#each inventoryVarianceRows as item}
												<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
													<div class="flex items-start justify-between gap-4">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
															<p class="text-xs text-gray-600">{item.category}</p>
															<div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
																<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200">Current {item.quantity}</span>
																<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200">EOM {item.eomCount}</span>
															</div>
														</div>
														<div class="text-right">
															<p class="text-lg font-bold {item.variance > 0 ? 'text-emerald-700' : 'text-rose-700'}">{item.variance > 0 ? '+' : ''}{numberFmt.format(item.variance)}</p>
															<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium {item.variance > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
																{item.variance > 0 ? 'Over' : 'Short'}
															</span>
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>

							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<div class="flex items-center justify-between gap-4">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">Related Requests</h3>
										<p class="mt-1 text-xs text-gray-600">Latest request linked to each variance item</p>
									</div>
									<p class="text-xs text-gray-500">{inventoryVarianceRows.length} records</p>
								</div>

								<div class="mt-4 space-y-2">
									{#if inventoryVarianceRows.length === 0}
										<div class="flex min-h-70 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
											<div>
												<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
													<Package size={32} class="text-pink-600" />
												</div>
												<h4 class="mt-6 text-base font-semibold text-gray-900">No request context</h4>
												<p class="mt-2 text-sm leading-6 text-gray-600 max-w-sm">
													Request context will appear here once inventory items are linked to borrowing activity.
												</p>
											</div>
										</div>
									{:else}
										<div class="max-h-104 space-y-2 overflow-y-auto pr-1">
											{#each inventoryVarianceRows as item}
												{@const driver = report.inventory.varianceDrivers.find((row) => row.id === item._id)}
												<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
													<div class="flex items-start justify-between gap-4">
														<div class="min-w-0 flex-1">
															<p class="truncate text-sm font-semibold text-gray-900">{driver?.latestRequestId ? `REQ-${driver.latestRequestId.slice(-6).toUpperCase()}` : 'N/A'}</p>
															<p class="text-xs text-gray-600">{driver?.studentName || 'Unknown student'}</p>
															<p class="mt-2 text-xs text-gray-500">{driver?.latestRequestDate ? new Date(driver.latestRequestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No request date'} · {driver?.latestRequestStatus || 'N/A'}</p>
														</div>
														<div class="text-right">
															<p class="text-sm font-medium text-gray-900">{item.name}</p>
															<p class="text-xs text-gray-600">{driver?.requestCount ?? 0} requests</p>
															<p class="mt-1 text-xs text-gray-500">{driver?.totalBorrowedQuantity ?? 0} total borrowed</p>
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'students'}
					<div class="space-y-6">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Student Risk Overview</h3>
									<p class="mt-1 text-sm text-gray-600">Selected range: {formatRangeLabel()}</p>
								</div>
								<p class="text-xs text-gray-500">Trust score visibility for all tracked students</p>
							</div>

							{#if studentTrustScores.length === 0}
								<div class="mt-4 flex min-h-55 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
									<div class="max-w-sm">
										<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
											<Users size={32} class="text-pink-600" />
										</div>
										<h4 class="mt-6 text-base font-semibold text-gray-900">No student risk data</h4>
										<p class="mt-2 text-sm leading-6 text-gray-600">Summary metrics will appear here once student activity exists in the selected range.</p>
									</div>
								</div>
							{:else}
								<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">Students</p>
										<p class="mt-2 text-2xl font-bold text-gray-900">{numberFmt.format(studentTrustScores.length)}</p>
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">Average Trust Score</p>
										<p class="mt-2 text-2xl font-bold text-pink-700">{averageTrustScore}</p>
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
										<p class="text-sm text-gray-600">High Incident Students</p>
										<p class="mt-2 text-2xl font-bold text-amber-700">{numberFmt.format(report.studentRisk.highIncidentStudents.length)}</p>
									</div>
								</div>
							{/if}
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<div class="flex items-center justify-between gap-4">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">Student Trust Scores</h3>
									<p class="mt-1 text-xs text-gray-600">Sorted from highest risk to strongest standing</p>
								</div>
								<p class="text-xs text-gray-500">{studentTrustScores.length} students</p>
							</div>

							<div class="mt-4 space-y-2">
								{#if studentTrustScores.length === 0}
									<div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
										<div class="max-w-sm">
											<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
												<Users size={32} class="text-pink-600" />
											</div>
											<h4 class="mt-6 text-base font-semibold text-gray-900">No trust score data</h4>
											<p class="mt-2 text-sm leading-6 text-gray-600">Student trust scores will appear here once activity exists in the selected date range.</p>
										</div>
									</div>
								{:else}
									<div class="max-h-120 space-y-2 overflow-y-auto pr-1">
										{#each studentTrustScores as student}
											<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
												<div class="flex items-start justify-between gap-4">
													<div class="min-w-0 flex-1">
														<div class="flex flex-wrap items-center gap-2">
															<p class="truncate text-sm font-semibold text-gray-900">{student.studentName || 'Unknown Student'}</p>
															<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium {getTrustTierClasses(student.trustTier)}">{student.trustTierLabel || 'Unrated'}</span>
														</div>
														<p class="text-xs text-gray-600">{student.studentEmail || 'N/A'}</p>
														<div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
															<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200">Requests {student.requestsTotal ?? 0}</span>
															<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200">Returned {student.requestsReturned ?? 0}</span>
															<span class="rounded-full bg-white px-2 py-1 ring-1 ring-gray-200">Obligations {student.activeObligations ?? 0}</span>
														</div>
													</div>
													<div class="w-28 shrink-0 text-right">
														<p class="text-2xl font-bold {getTrustScoreTextClass(student.trustTier)}">{Math.round(student.trustScore ?? 0)}</p>
														<p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Trust Score</p>
													</div>
												</div>
												<div class="mt-3 h-2 rounded-full bg-gray-200">
													<div class="h-2 rounded-full {getTrustBarClasses(student.trustScore)}" style={`width: ${Math.max(0, Math.min(100, student.trustScore ?? 0))}%`}></div>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>


