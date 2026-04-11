<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		fetchAnalytics,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		clearAnalyticsCache,
		type AnalyticsReport,
		type AnalyticsPeriod,
		type OverdueRequest,
		type StudentRiskEntry
	} from '$lib/api/analyticsReports';
	import { toastStore } from '$lib/stores/toast';
	import {
		RefreshCw,
		TrendingUp,
		TrendingDown,
		Search,
		Download,
		Save,
		Share2,
		Filter,
		Expand,
		Rows3,
		Clock3,
		ChartNoAxesCombined
	} from 'lucide-svelte';

	type Tab = 'executive' | 'operations' | 'risk';
	type DatePreset = 'today' | 'last7' | 'mtd' | 'semester' | 'custom';
	type SortDirection = 'asc' | 'desc';
	type OverdueSortKey = 'studentName' | 'daysOverdue' | 'itemCount' | 'returnDate';

	type SavedView = {
		id: string;
		name: string;
		createdAt: string;
		state: {
			tab: Tab;
			period: AnalyticsPeriod;
			preset: DatePreset;
			customFrom: string;
			customTo: string;
			statusFilter: string;
			categoryFilter: string;
			trustTierFilter: string;
			searchQuery: string;
			metricThreshold: number;
		};
	};

	const SAVED_VIEWS_KEY = 'custodian-analytics-saved-views-v1';
	const HOME_PREF_KEY = 'custodian-homepage-report-v1';
	const initialReport = browser
		? peekCachedAnalytics({
				period: 'month',
				from: monthStartISO(),
				to: todayISO()
			})
		: null;

	let report = $state<AnalyticsReport | null>(initialReport);
	let loading = $state(!initialReport);
	let error = $state<string | null>(null);
	let lastUpdated = $state<Date | null>(initialReport ? new Date(initialReport.meta.generatedAt) : null);
	let unsubscribeSSE: (() => void) | null = null;
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	let hasMounted = false;

	let activeTab = $state<Tab>('executive');
	let period = $state<AnalyticsPeriod>('month');
	let datePreset = $state<DatePreset>('mtd');
	let customFrom = $state('');
	let customTo = $state('');

	let statusFilter = $state('all');
	let categoryFilter = $state('all');
	let trustTierFilter = $state('all');
	let searchQuery = $state('');
	let metricThreshold = $state(0);
	let chartStatusFilter = $state('all');

	let overdueSortKey = $state<OverdueSortKey>('daysOverdue');
	let overdueSortDirection = $state<SortDirection>('desc');
	let expandedStudentId = $state<string | null>(null);

	let autoRefreshMinutes = $state(0);
	let savedViews = $state<SavedView[]>([]);
	let selectedSavedViewId = $state('');
	let selectedTemplate = $state('operations-health');
	let dashboardAsHomepage = $state(false);

	const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const KPI_COLORS = {
		neutral: 'text-gray-900',
		good: 'text-emerald-600',
		warn: 'text-amber-600',
		risk: 'text-rose-600'
	};

	const numberFmt = new Intl.NumberFormat();

	function todayISO(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function monthStartISO(): string {
		const d = new Date();
		const start = new Date(d.getFullYear(), d.getMonth(), 1);
		return start.toISOString().slice(0, 10);
	}

	function semesterStartISO(): string {
		const d = new Date();
		const start = new Date(d);
		start.setMonth(start.getMonth() - 6);
		return start.toISOString().slice(0, 10);
	}

	function applyPreset(preset: DatePreset): void {
		datePreset = preset;
		if (preset === 'today') {
			period = 'week';
			customFrom = todayISO();
			customTo = todayISO();
			return;
		}
		if (preset === 'last7') {
			period = 'week';
			customFrom = '';
			customTo = '';
			return;
		}
		if (preset === 'mtd') {
			period = 'month';
			customFrom = monthStartISO();
			customTo = todayISO();
			return;
		}
		if (preset === 'semester') {
			period = 'semester';
			customFrom = semesterStartISO();
			customTo = todayISO();
			return;
		}
		customFrom = customFrom || monthStartISO();
		customTo = customTo || todayISO();
	}

	async function loadReport(forceRefresh = false): Promise<void> {
		if (!browser) return;
		if (forceRefresh || !report) {
			loading = true;
		}
		error = null;
		try {
			report = await fetchAnalytics({
				period,
				from: customFrom || undefined,
				to: customTo || undefined,
				forceRefresh
			});
			lastUpdated = new Date();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load analytics report';
			toastStore.error(error, 'Analytics');
		} finally {
			loading = false;
		}
	}

	function handleRefresh(): void {
		clearAnalyticsCache();
		loadReport(true);
		toastStore.info('Refreshing analytics dataset', 'Refresh');
	}

	function trendArrow(delta: number): 'up' | 'down' | 'flat' {
		if (delta > 0) return 'up';
		if (delta < 0) return 'down';
		return 'flat';
	}

	function trendText(delta: number): string {
		if (delta > 0) return `+${delta}% vs previous`;
		if (delta < 0) return `${delta}% vs previous`;
		return 'No change vs previous';
	}

	const requestsOverTime = $derived(report?.borrowRequests.requestsOverTime ?? []);
	const statusBreakdown = $derived(report?.borrowRequests.statusBreakdown ?? []);
	const trustScores = $derived(report?.studentRisk.trustScores ?? []);
	const inventorySummary = $derived(
		report?.inventory.summary ?? {
			currentCount: 0,
			eomCount: 0,
			variance: 0,
			donations: 0,
			constantCount: 0,
			lowStockCount: 0
		}
	);
	const eomVarianceRows = $derived.by(() => {
		return [...(report?.inventory.eomVariance ?? [])]
			.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
			.slice(0, 10);
	});
	const eomVarianceAbsMax = $derived.by(() =>
		Math.max(1, ...eomVarianceRows.map((row) => Math.abs(row.variance)))
	);
	const eomVarianceNegativeCount = $derived.by(
		() => (report?.inventory.eomVariance ?? []).filter((row) => row.variance < 0).length
	);
	const eomVariancePositiveCount = $derived.by(
		() => (report?.inventory.eomVariance ?? []).filter((row) => row.variance > 0).length
	);
	const eomVarianceRate = $derived.by(() => {
		const base = inventorySummary.eomCount;
		if (!base) return 0;
		return Math.round((inventorySummary.variance / base) * 1000) / 10;
	});
	const eomCategoryVariance = $derived.by(() => {
		const grouped = new Map<string, { category: string; variance: number }>();
		for (const row of report?.inventory.eomVariance ?? []) {
			const key = row.category || 'Uncategorized';
			const prev = grouped.get(key) ?? { category: key, variance: 0 };
			grouped.set(key, { ...prev, variance: prev.variance + row.variance });
		}
		return [...grouped.values()]
			.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
			.slice(0, 6);
	});

	const comparison = $derived.by(() => {
		const series = requestsOverTime;
		if (series.length < 4) return { current: 0, previous: 0, deltaPct: 0 };
		const half = Math.floor(series.length / 2);
		const previous = series.slice(0, half).reduce((s, p) => s + p.count, 0);
		const current = series.slice(half).reduce((s, p) => s + p.count, 0);
		const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
		return { current, previous, deltaPct };
	});

	const totalRequests = $derived(statusBreakdown.reduce((s, i) => s + i.count, 0));
	const returnedCount = $derived(statusBreakdown.find((s) => s.status === 'returned')?.count ?? 0);
	const overdueCount = $derived(report?.borrowRequests.overdueCount ?? 0);
	const replacementPending = $derived(report?.replacement.summary.pendingCount ?? 0);
	const stockAlerts = $derived(report?.inventory.stockAlerts.length ?? 0);
	const activeLoans = $derived.by(() => {
		const loanStatuses = ['ready_for_pickup', 'borrowed', 'pending_return'];
		return statusBreakdown
			.filter((s) => loanStatuses.includes(s.status))
			.reduce((sum, row) => sum + row.count, 0);
	});
	const approvalRate = $derived.by(() => {
		if (totalRequests === 0) return 0;
		const notRejected = statusBreakdown
			.filter((s) => !['rejected', 'cancelled'].includes(s.status))
			.reduce((sum, row) => sum + row.count, 0);
		return Math.round((notRejected / totalRequests) * 100);
	});
	const itemsCurrentlyOutTotal = $derived.by(() =>
		(report?.inventory.itemsCurrentlyOut ?? []).reduce((sum, item) => sum + item.quantityOut, 0)
	);
	const donatedItemTypes = $derived.by(() => {
		const names = new Set((report?.replacement.donationTotals ?? []).map((d) => d.itemName).filter(Boolean));
		return names.size;
	});
	const resolvedObligations = $derived.by(() => {
		const total = report?.replacement.summary.totalObligations ?? 0;
		const pending = report?.replacement.summary.pendingCount ?? 0;
		return Math.max(0, total - pending);
	});
	const recentActivityCount = $derived.by(() => requestsOverTime.slice(-7).reduce((sum, p) => sum + p.count, 0));
	const highIncidentItems = $derived.by(() =>
		(report?.inventory.damageRateItems ?? []).filter((item) => item.incidentRate >= 25).length
	);
	const averageTrustScore = $derived.by(() => {
		if (trustScores.length === 0) return 0;
		return Math.round(trustScores.reduce((sum, s) => sum + (s.trustScore ?? 0), 0) / trustScores.length);
	});
	const lowTrustStudents = $derived.by(() => trustScores.filter((s) => (s.trustScore ?? 0) < 70).length);
	const goodTrustStudents = $derived.by(() => trustScores.filter((s) => (s.trustScore ?? 0) >= 90).length);

	const returnRate = $derived(totalRequests > 0 ? Math.round((returnedCount / totalRequests) * 100) : 0);
	const operationalHealth = $derived(
		Math.max(0, Math.min(100, Math.round(100 - overdueCount * 2 - stockAlerts * 2 - replacementPending)))
	);

	const filteredStatusBreakdown = $derived.by(() => {
		if (statusFilter === 'all') return statusBreakdown;
		return statusBreakdown.filter((s) => s.status === statusFilter);
	});

	const inventoryCategories = $derived.by(() => {
		const src = report?.inventory.mostBorrowedItems ?? [];
		return [...new Set(src.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	});

	const filteredMostBorrowed = $derived.by(() => {
		const src = report?.inventory.mostBorrowedItems ?? [];
		return src
			.filter((i) => categoryFilter === 'all' || i.category === categoryFilter)
			.filter((i) => i.totalBorrows >= metricThreshold)
			.slice(0, 12);
	});

	const filteredOverdue = $derived.by(() => {
		const src = report?.borrowRequests.overdueRequests ?? [];
		const q = searchQuery.trim().toLowerCase();
		const scoped = src.filter((row) => {
			if (!q) return true;
			return row.studentName.toLowerCase().includes(q) || row._id.toLowerCase().includes(q);
		});

		const sorted = [...scoped].sort((a, b) => {
			const dir = overdueSortDirection === 'asc' ? 1 : -1;
			if (overdueSortKey === 'studentName') return a.studentName.localeCompare(b.studentName) * dir;
			if (overdueSortKey === 'daysOverdue') return (a.daysOverdue - b.daysOverdue) * dir;
			if (overdueSortKey === 'itemCount') return (a.itemCount - b.itemCount) * dir;
			return (new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime()) * dir;
		});

		return sorted;
	});

	const filteredTrustScores = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return trustScores
			.filter((s) => trustTierFilter === 'all' || (s.trustTier ?? 'unknown') === trustTierFilter)
			.filter((s) => {
				if (!q) return true;
				return s.studentName.toLowerCase().includes(q) || s.studentEmail.toLowerCase().includes(q) || s._id.toLowerCase().includes(q);
			})
			.slice(0, 50);
	});

	const movingAverage = $derived.by(() => {
		const src = requestsOverTime;
		if (src.length === 0) return [] as number[];
		return src.map((_, idx) => {
			const from = Math.max(0, idx - 2);
			const window = src.slice(from, idx + 1);
			const avg = window.reduce((s, p) => s + p.count, 0) / window.length;
			return Math.round(avg * 10) / 10;
		});
	});

	const anomalies = $derived.by(() => {
		const values = requestsOverTime.map((p) => p.count);
		if (values.length < 4) return [] as number[];
		const mean = values.reduce((s, v) => s + v, 0) / values.length;
		const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
		const std = Math.sqrt(variance) || 1;
		return values
			.map((v, i) => ({ v, i, z: Math.abs((v - mean) / std) }))
			.filter((x) => x.z >= 1.6)
			.map((x) => x.i);
	});

	const trendForecast = $derived.by(() => {
		const points = requestsOverTime.map((p, i) => ({ x: i + 1, y: p.count }));
		if (points.length < 3) return null;
		const n = points.length;
		const sumX = points.reduce((s, p) => s + p.x, 0);
		const sumY = points.reduce((s, p) => s + p.y, 0);
		const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
		const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX ** 2 || 1);
		const intercept = (sumY - slope * sumX) / n;
		const nextX = n + 1;
		return Math.max(0, Math.round(slope * nextX + intercept));
	});

	const gaugeStyle = $derived(`conic-gradient(#10b981 ${returnRate * 3.6}deg, #e5e7eb 0deg)`);

	const heatmapMax = $derived(
		Math.max(1, ...(report?.borrowRequests.peakHeatmap.map((p) => p.count) ?? [1]))
	);

	const funnel = $derived.by(() => {
		const src = statusBreakdown;
		const get = (status: string) => src.find((s) => s.status === status)?.count ?? 0;
		return [
			{ label: 'Pending', value: get('pending_instructor') },
			{ label: 'Approved', value: get('approved_instructor') },
			{ label: 'Released', value: get('borrowed') + get('ready_for_pickup') },
			{ label: 'Returned', value: get('returned') }
		];
	});

	const funnelMax = $derived(Math.max(...funnel.map((f) => f.value), 1));
	const statusBreakdownMax = $derived(Math.max(...filteredStatusBreakdown.map((s) => s.count), 1));
	const mostBorrowedMax = $derived(Math.max(...filteredMostBorrowed.map((i) => i.totalBorrows), 1));

	const resolutionPie = $derived.by(() => {
		const src = report?.replacement.resolutionBreakdown ?? [];
		const total = src.reduce((s, r) => s + r.count, 0) || 1;
		let acc = 0;
		const palette = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
		return src.map((row, idx) => {
			const pct = row.count / total;
			const start = acc;
			acc += pct;
			return {
				label: row.type,
				count: row.count,
				pct,
				start,
				color: palette[idx % palette.length]
			};
		});
	});

	const treemapBlocks = $derived.by(() => {
		const src = (report?.replacement.obligationsByCategory ?? []).slice(0, 6);
		const total = src.reduce((s, r) => s + r.count, 0) || 1;
		return src.map((row) => ({
			...row,
			w: Math.max(15, Math.round((row.count / total) * 100))
		}));
	});

	const scatterData = $derived.by(() => {
		return filteredTrustScores
			.map((s) => ({
				id: s._id,
				label: s.studentName,
				x: Math.min(100, Math.max(0, s.trustScore ?? 0)),
				y: Math.min(100, Math.max(0, ((s.missingCount ?? 0) + (s.damagedCount ?? 0)) * 10))
			}))
			.slice(0, 30);
	});

	function heatmapCell(day: number, hour: number): number {
		return report?.borrowRequests.peakHeatmap.find((p) => p.dayOfWeek === day && p.hour === hour)?.count ?? 0;
	}

	function heatmapClass(value: number): string {
		if (value === 0) return 'bg-gray-100';
		const ratio = value / heatmapMax;
		if (ratio < 0.2) return 'bg-pink-100';
		if (ratio < 0.4) return 'bg-pink-200';
		if (ratio < 0.6) return 'bg-pink-300';
		if (ratio < 0.8) return 'bg-pink-400';
		return 'bg-pink-600';
	}

	function toggleOverdueSort(key: OverdueSortKey): void {
		if (overdueSortKey === key) {
			overdueSortDirection = overdueSortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		overdueSortKey = key;
		overdueSortDirection = 'desc';
	}

	function sortCaret(key: OverdueSortKey): string {
		if (overdueSortKey !== key) return ' '; 
		return overdueSortDirection === 'asc' ? '↑' : '↓';
	}

	function toCSV(rows: Record<string, string | number | null | undefined>[]): string {
		if (rows.length === 0) return '';
		const headers = Object.keys(rows[0]);
		const esc = (v: unknown): string => `"${String(v ?? '').replaceAll('"', '""')}"`;
		const body = rows.map((row) => headers.map((h) => esc(row[h])).join(','));
		return [headers.join(','), ...body].join('\n');
	}

	function downloadFile(name: string, text: string, mime = 'text/csv;charset=utf-8'): void {
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportOverdueCSV(): void {
		const csv = toCSV(
			filteredOverdue.map((r) => ({
				student: r.studentName,
				dueDate: new Date(r.returnDate).toISOString().slice(0, 10),
				daysOverdue: r.daysOverdue,
				itemCount: r.itemCount,
				requestId: r._id
			}))
		);
		downloadFile(`overdue-requests-${todayISO()}.csv`, csv);
	}

	async function exportOverdueExcel(): Promise<void> {
		try {
			const mod = await import('xlsx');
			const ws = mod.utils.json_to_sheet(
				filteredOverdue.map((r) => ({
					Student: r.studentName,
					DueDate: new Date(r.returnDate).toISOString().slice(0, 10),
					DaysOverdue: r.daysOverdue,
					ItemCount: r.itemCount,
					RequestId: r._id
				}))
			);
			const wb = mod.utils.book_new();
			mod.utils.book_append_sheet(wb, ws, 'Overdue');
			mod.writeFile(wb, `overdue-requests-${todayISO()}.xlsx`);
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Excel export failed', 'Export');
		}
	}

	function exportAsPDF(): void {
		window.print();
	}

	function copyShareLink(): void {
		const url = new URL(window.location.href);
		url.searchParams.set('tab', activeTab);
		url.searchParams.set('period', period);
		url.searchParams.set('preset', datePreset);
		url.searchParams.set('status', statusFilter);
		url.searchParams.set('category', categoryFilter);
		url.searchParams.set('tier', trustTierFilter);
		url.searchParams.set('q', searchQuery);
		url.searchParams.set('min', String(metricThreshold));
		url.searchParams.set('from', customFrom);
		url.searchParams.set('to', customTo);
		navigator.clipboard.writeText(url.toString());
		toastStore.success('Shareable report link copied', 'Share');
	}

	function copyApiEndpoint(): void {
		const qp = new URLSearchParams({ period });
		if (customFrom) qp.set('from', customFrom);
		if (customTo) qp.set('to', customTo);
		navigator.clipboard.writeText(`/api/reports/analytics?${qp.toString()}`);
		toastStore.success('Analytics API endpoint copied', 'API');
	}

	function saveView(saveAs = false): void {
		const name = saveAs
			? prompt('Save report view as:', `View ${savedViews.length + 1}`)?.trim()
			: selectedSavedViewId
				? savedViews.find((v) => v.id === selectedSavedViewId)?.name
				: prompt('Name this report view:', `View ${savedViews.length + 1}`)?.trim();
		if (!name) return;

		const state = {
			tab: activeTab,
			period,
			preset: datePreset,
			customFrom,
			customTo,
			statusFilter,
			categoryFilter,
			trustTierFilter,
			searchQuery,
			metricThreshold
		};

		const existing = saveAs ? null : savedViews.find((v) => v.name === name || v.id === selectedSavedViewId);
		if (existing) {
			existing.state = state;
			existing.createdAt = new Date().toISOString();
			savedViews = [...savedViews];
			selectedSavedViewId = existing.id;
		} else {
			const next: SavedView = {
				id: crypto.randomUUID(),
				name,
				createdAt: new Date().toISOString(),
				state
			};
			savedViews = [next, ...savedViews];
			selectedSavedViewId = next.id;
		}
		localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
		toastStore.success('Report view saved', 'Saved View');
	}

	function applySavedView(id: string): void {
		const view = savedViews.find((v) => v.id === id);
		if (!view) return;
		selectedSavedViewId = id;
		activeTab = view.state.tab;
		period = view.state.period;
		datePreset = view.state.preset;
		customFrom = view.state.customFrom;
		customTo = view.state.customTo;
		statusFilter = view.state.statusFilter;
		categoryFilter = view.state.categoryFilter;
		trustTierFilter = view.state.trustTierFilter;
		searchQuery = view.state.searchQuery;
		metricThreshold = view.state.metricThreshold;
		loadReport(true);
	}

	function deleteSavedView(): void {
		if (!selectedSavedViewId) return;
		savedViews = savedViews.filter((v) => v.id !== selectedSavedViewId);
		selectedSavedViewId = '';
		localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
		toastStore.info('Saved view removed', 'Saved View');
	}

	function applyTemplate(id: string): void {
		selectedTemplate = id;
		if (id === 'operations-health') {
			activeTab = 'operations';
			statusFilter = 'all';
			categoryFilter = 'all';
			metricThreshold = 2;
			return;
		}
		if (id === 'risk-watchlist') {
			activeTab = 'risk';
			trustTierFilter = 'poor';
			metricThreshold = 0;
			return;
		}
		activeTab = 'executive';
		statusFilter = 'all';
		categoryFilter = 'all';
		trustTierFilter = 'all';
		metricThreshold = 0;
	}

	function setDashboardAsHomepage(): void {
		dashboardAsHomepage = !dashboardAsHomepage;
		localStorage.setItem(HOME_PREF_KEY, dashboardAsHomepage ? '1' : '0');
		toastStore.success(
			dashboardAsHomepage ? 'Reports set as your homepage preference' : 'Homepage preference removed',
			'Preference'
		);
	}

	function setFullscreen(): void {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
			return;
		}
		document.exitFullscreen();
	}

	function syncUrlState(): void {
		if (!browser) return;
		const url = new URL(window.location.href);
		url.searchParams.set('tab', activeTab);
		url.searchParams.set('period', period);
		url.searchParams.set('preset', datePreset);
		url.searchParams.set('status', statusFilter);
		url.searchParams.set('category', categoryFilter);
		url.searchParams.set('tier', trustTierFilter);
		url.searchParams.set('q', searchQuery);
		url.searchParams.set('min', String(metricThreshold));
		if (customFrom) url.searchParams.set('from', customFrom);
		if (customTo) url.searchParams.set('to', customTo);
		history.replaceState({}, '', url);
	}

	function hydrateFromUrl(): void {
		if (!browser) return;
		const url = new URL(window.location.href);
		const t = url.searchParams.get('tab') as Tab | null;
		if (t && ['executive', 'operations', 'risk'].includes(t)) activeTab = t;
		const p = url.searchParams.get('period') as AnalyticsPeriod | null;
		if (p && ['week', 'month', 'semester'].includes(p)) period = p;
		const preset = url.searchParams.get('preset') as DatePreset | null;
		if (preset && ['today', 'last7', 'mtd', 'semester', 'custom'].includes(preset)) datePreset = preset;
		statusFilter = url.searchParams.get('status') || statusFilter;
		categoryFilter = url.searchParams.get('category') || categoryFilter;
		trustTierFilter = url.searchParams.get('tier') || trustTierFilter;
		searchQuery = url.searchParams.get('q') || searchQuery;
		metricThreshold = Number(url.searchParams.get('min') || metricThreshold);
		customFrom = url.searchParams.get('from') || customFrom;
		customTo = url.searchParams.get('to') || customTo;
	}

	onMount(() => {
		applyPreset('mtd');
		hydrateFromUrl();
		void loadReport();
		hasMounted = true;
		unsubscribeSSE = subscribeToAnalyticsChanges(() => loadReport(true));

		try {
			savedViews = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]') as SavedView[];
		} catch {
			savedViews = [];
		}
		dashboardAsHomepage = localStorage.getItem(HOME_PREF_KEY) === '1';

		return () => {
			unsubscribeSSE?.();
			if (refreshTimer) clearInterval(refreshTimer);
		};
	});

	$effect(() => {
		period;
		customFrom;
		customTo;
		if (!hasMounted) return;
		void loadReport();
	});

	$effect(() => {
		autoRefreshMinutes;
		if (refreshTimer) clearInterval(refreshTimer);
		if (autoRefreshMinutes > 0) {
			refreshTimer = setInterval(() => loadReport(true), autoRefreshMinutes * 60 * 1000);
		}
	});

	$effect(() => {
		activeTab;
		period;
		datePreset;
		statusFilter;
		categoryFilter;
		trustTierFilter;
		searchQuery;
		metricThreshold;
		customFrom;
		customTo;
		syncUrlState();
	});

	function lineX(index: number, total: number): number {
		if (total <= 1) return 0;
		return Math.round((index / (total - 1)) * 100);
	}

	function lineY(value: number, max: number): number {
		if (max <= 0) return 100;
		return 100 - Math.round((value / max) * 100);
	}

	function linePath(values: number[]): string {
		if (values.length === 0) return '';
		const max = Math.max(...values, 1);
		return values
			.map((v, i) => `${lineX(i, values.length)},${lineY(v, max)}`)
			.join(' ');
	}

	const overdueAggregates = $derived.by(() => {
		const rows = filteredOverdue;
		if (rows.length === 0) return { totalItems: 0, avgDays: 0 };
		const totalItems = rows.reduce((s, r) => s + r.itemCount, 0);
		const avgDays = Math.round((rows.reduce((s, r) => s + r.daysOverdue, 0) / rows.length) * 10) / 10;
		return { totalItems, avgDays };
	});

	function trustBadge(entry: StudentRiskEntry): string {
		const score = entry.trustScore ?? 0;
		if (score >= 90) return 'bg-emerald-100 text-emerald-700';
		if (score >= 70) return 'bg-amber-100 text-amber-700';
		return 'bg-rose-100 text-rose-700';
	}

	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return 'NA';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}
</script>

<svelte:head>
	<title>Reports & Analytics - Custodian</title>
</svelte:head>

<div class="space-y-6">
	<div class="p-5 sm:p-6">
		<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-start">
			<div class="min-w-0">
				<h1 class="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Reports & Analytics</h1>
				<p class="mt-1 text-sm text-gray-500">Track borrowing activity, inventory posture, and replacement risk from one operational view.</p>
				{#if lastUpdated}
					<p class="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">Updated {lastUpdated.toLocaleTimeString()}</p>
				{/if}
			</div>

			<div class="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
				<label class="text-xs font-semibold uppercase tracking-wide text-gray-500">Date Range</label>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each [
						{ id: 'today', label: 'Today' },
						{ id: 'last7', label: 'Last 7 days' },
						{ id: 'mtd', label: 'Month-to-date' },
						{ id: 'custom', label: 'Custom' }
					] as option}
						<button
							onclick={() => applyPreset(option.id as DatePreset)}
							class="rounded-md px-2.5 py-1.5 text-xs font-medium transition {datePreset === option.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
				{#if datePreset === 'custom' || customFrom || customTo}
					<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
						<input class="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700" type="date" bind:value={customFrom} />
						<input class="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700" type="date" bind:value={customTo} />
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-sm font-semibold text-gray-700">Total Requests</p>
					<p class="mt-2 text-4xl font-bold text-gray-900">{numberFmt.format(totalRequests)}</p>
					<p class="mt-1 text-sm text-gray-500">{trendText(comparison.deltaPct)}</p>
				</div>
				<div class="grid h-12 w-12 place-items-center rounded-full bg-pink-100 text-pink-600">
					<ChartNoAxesCombined size={22} />
				</div>
			</div>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-sm font-semibold text-gray-700">Return Rate</p>
					<p class="mt-2 text-4xl font-bold {returnRate >= 85 ? KPI_COLORS.good : KPI_COLORS.warn}">{returnRate}%</p>
					<p class="mt-1 text-sm text-gray-500">Goal: 90%</p>
				</div>
				<div class="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
					<TrendingUp size={22} />
				</div>
			</div>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-sm font-semibold text-gray-700">Active Risk Signals</p>
					<p class="mt-2 text-4xl font-bold {overdueCount + stockAlerts > 0 ? KPI_COLORS.risk : KPI_COLORS.good}">{overdueCount + stockAlerts + replacementPending}</p>
					<p class="mt-1 text-sm text-gray-500">Overdue, stock, and replacement pending</p>
				</div>
				<div class="grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
					<Clock3 size={22} />
				</div>
			</div>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-sm font-semibold text-gray-700">Operational Health</p>
					<p class="mt-2 text-4xl font-bold {operationalHealth >= 80 ? KPI_COLORS.good : operationalHealth >= 60 ? KPI_COLORS.warn : KPI_COLORS.risk}">{operationalHealth}</p>
					<p class="mt-1 text-sm text-gray-500">Composite service score</p>
				</div>
				<div class="grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-700">
					<Rows3 size={22} />
				</div>
			</div>
		</div>
	</div>

	<div class="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
		<div class="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
			<nav class="flex overflow-x-auto" aria-label="Report tabs">
				{#each [
					{ id: 'executive', label: 'Executive Dashboard' },
					{ id: 'operations', label: 'Operations Deep Dive' },
					{ id: 'risk', label: 'Risk & Behavior' }
				] as tab}
					<button
						onclick={() => (activeTab = tab.id as Tab)}
						class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium {activeTab === tab.id ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
					>
						{tab.label}
					</button>
				{/each}
			</nav>
			<div class="flex flex-wrap items-center gap-2">
				<select bind:value={selectedTemplate} onchange={(e) => applyTemplate((e.currentTarget as HTMLSelectElement).value)} class="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700">
					<option value="operations-health">Template: Operations Health</option>
					<option value="risk-watchlist">Template: Risk Watchlist</option>
					<option value="executive-overview">Template: Executive Overview</option>
				</select>
				<select bind:value={selectedSavedViewId} onchange={(e) => applySavedView((e.currentTarget as HTMLSelectElement).value)} class="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700">
					<option value="">Saved filter sets</option>
					{#each savedViews as view}
						<option value={view.id}>{view.name}</option>
					{/each}
				</select>
				<button onclick={() => saveView(false)} class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
					<Save size={13} /> Save
				</button>
				<button onclick={() => saveView(true)} class="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Save As</button>
				<button onclick={deleteSavedView} class="rounded-md border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">Delete</button>
			</div>
		</div>

		{#if loading}
			<div class="px-5 py-10 text-sm text-gray-500">Loading analytics dashboard...</div>
		{:else if error}
			<div class="px-5 py-10">
				<div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
			</div>
		{:else if report}
			<div class="space-y-6 p-4 sm:p-5">
				{#if activeTab === 'executive'}
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-xl border border-gray-200 p-4 lg:col-span-2">
							<h3 class="text-sm font-semibold text-gray-900">Inventory Baseline (Real Data)</h3>
							<p class="mt-1 text-xs text-gray-500">Core inventory indicators required for CHTM laboratory reporting.</p>
							<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">Current Count</p><p class="mt-1 text-lg font-semibold text-gray-900">{numberFmt.format(inventorySummary.currentCount)}</p></div>
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">EOM Count</p><p class="mt-1 text-lg font-semibold text-gray-900">{numberFmt.format(inventorySummary.eomCount)}</p></div>
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">Variance</p><p class="mt-1 text-lg font-semibold {inventorySummary.variance < 0 ? 'text-rose-700' : inventorySummary.variance > 0 ? 'text-emerald-700' : 'text-gray-900'}">{inventorySummary.variance > 0 ? '+' : ''}{numberFmt.format(inventorySummary.variance)}</p></div>
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">Donations</p><p class="mt-1 text-lg font-semibold text-pink-700">{numberFmt.format(inventorySummary.donations)}</p></div>
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">Constant Items</p><p class="mt-1 text-lg font-semibold text-indigo-700">{numberFmt.format(inventorySummary.constantCount)}</p></div>
								<div class="rounded-lg bg-gray-50 p-3"><p class="text-xs text-gray-500">Low Stock</p><p class="mt-1 text-lg font-semibold {inventorySummary.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">{numberFmt.format(inventorySummary.lowStockCount)}</p></div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Requests and Loans Analytics</h3>
							<div class="mt-3 space-y-2 text-sm">
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Total requests</span><span class="font-semibold text-gray-900">{numberFmt.format(totalRequests)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Active loans</span><span class="font-semibold text-pink-700">{numberFmt.format(activeLoans)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Approval rate</span><span class="font-semibold text-indigo-700">{approvalRate}%</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Overdue count</span><span class="font-semibold {overdueCount > 0 ? 'text-rose-700' : 'text-emerald-700'}">{numberFmt.format(overdueCount)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Avg return cycle</span><span class="font-semibold text-gray-900">{Math.round(report.borrowRequests.turnaround.avgReturnHours || 0)}h</span></div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Student Trust Score Analytics</h3>
							<p class="mt-1 text-xs text-gray-500">Trust profile derived from return quality, incidents, and obligations.</p>
							<div class="mt-3 space-y-2 text-sm">
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Tracked students</span><span class="font-semibold text-gray-900">{numberFmt.format(trustScores.length)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Average trust score</span><span class="font-semibold {averageTrustScore >= 80 ? 'text-emerald-700' : averageTrustScore >= 70 ? 'text-amber-700' : 'text-rose-700'}">{averageTrustScore}%</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">High trust students (>=90)</span><span class="font-semibold text-emerald-700">{numberFmt.format(goodTrustStudents)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">At-risk students (&lt;70)</span><span class="font-semibold {lowTrustStudents > 0 ? 'text-rose-700' : 'text-emerald-700'}">{numberFmt.format(lowTrustStudents)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Overdue students</span><span class="font-semibold text-amber-700">{numberFmt.format(report.studentRisk.overdueStudents.length)}</span></div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Operational Risk Snapshot</h3>
							<p class="mt-1 text-xs text-gray-500">A compact view of replacement pressure, stock exposure, and incident-heavy items.</p>
							<div class="mt-3 space-y-2 text-sm">
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Pending obligations</span><span class="font-semibold text-orange-600">{numberFmt.format(report.replacement.summary.pendingCount)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Resolved obligations</span><span class="font-semibold text-emerald-700">{numberFmt.format(resolvedObligations)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Low stock items</span><span class="font-semibold {inventorySummary.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">{numberFmt.format(inventorySummary.lowStockCount)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">High incident items</span><span class="font-semibold {highIncidentItems > 0 ? 'text-rose-700' : 'text-emerald-700'}">{numberFmt.format(highIncidentItems)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Recent activity</span><span class="font-semibold text-pink-700">{numberFmt.format(recentActivityCount)}</span></div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h3 class="text-sm font-semibold text-gray-900">Activity Trend Pulse</h3>
									<p class="mt-1 text-xs text-gray-500">Rolling request volume and service pressure across the latest operational window.</p>
								</div>
								<span class="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700">Last 7 days</span>
							</div>
							<div class="mt-4 grid grid-cols-7 gap-1.5">
								{#each requestsOverTime.slice(-7) as point}
									<div class="flex flex-col items-center gap-2">
										<div class="flex h-20 w-full items-end rounded-lg bg-gray-50 px-1.5">
											<div class="w-full rounded-t-md bg-pink-500" style="height:{Math.max(8, Math.round((point.count / Math.max(1, ...requestsOverTime.slice(-7).map((p) => p.count))) * 100))}%"></div>
										</div>
										<p class="text-[11px] font-medium text-gray-500">{point.date.slice(5)}</p>
									</div>
								{/each}
							</div>
							<div class="mt-4 grid grid-cols-3 gap-3 text-sm">
								<div class="rounded-md bg-gray-50 p-2.5">
									<p class="text-xs text-gray-500">7-day activity</p>
									<p class="mt-1 font-semibold text-gray-900">{numberFmt.format(recentActivityCount)}</p>
								</div>
								<div class="rounded-md bg-gray-50 p-2.5">
									<p class="text-xs text-gray-500">Trend forecast</p>
									<p class="mt-1 font-semibold text-gray-900">{trendForecast ?? 0}</p>
								</div>
								<div class="rounded-md bg-gray-50 p-2.5">
									<p class="text-xs text-gray-500">Anomaly points</p>
									<p class="mt-1 font-semibold text-rose-700">{anomalies.filter((index) => index >= Math.max(0, requestsOverTime.length - 7)).length}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-3">
						<div class="rounded-xl border border-gray-200 p-4 lg:col-span-2">
							<h3 class="text-sm font-semibold text-gray-900">EOM and Variance Report</h3>
							<p class="mt-1 text-xs text-gray-500">Industry-standard reconciliation view using actual records from inventory EOM variance data.</p>
							<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
								<div class="rounded-md bg-gray-50 p-2.5 text-xs"><p class="text-gray-500">EOM Baseline</p><p class="mt-1 text-base font-semibold text-gray-900">{numberFmt.format(inventorySummary.eomCount)}</p></div>
								<div class="rounded-md bg-gray-50 p-2.5 text-xs"><p class="text-gray-500">Current Total</p><p class="mt-1 text-base font-semibold text-gray-900">{numberFmt.format(inventorySummary.currentCount)}</p></div>
								<div class="rounded-md bg-gray-50 p-2.5 text-xs"><p class="text-gray-500">Net Variance</p><p class="mt-1 text-base font-semibold {inventorySummary.variance < 0 ? 'text-rose-700' : inventorySummary.variance > 0 ? 'text-emerald-700' : 'text-gray-900'}">{inventorySummary.variance > 0 ? '+' : ''}{numberFmt.format(inventorySummary.variance)}</p></div>
								<div class="rounded-md bg-gray-50 p-2.5 text-xs"><p class="text-gray-500">Variance Rate</p><p class="mt-1 text-base font-semibold {eomVarianceRate < 0 ? 'text-rose-700' : eomVarianceRate > 0 ? 'text-emerald-700' : 'text-gray-900'}">{eomVarianceRate > 0 ? '+' : ''}{eomVarianceRate}%</p></div>
							</div>
							<div class="mt-3 overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Category</th>
											<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Current</th>
											<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">EOM</th>
											<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Variance</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#if eomVarianceRows.length === 0}
											<tr><td colspan="5" class="px-3 py-4 text-sm text-gray-500">No EOM variance rows available for this date range.</td></tr>
										{:else}
											{#each eomVarianceRows as row}
												<tr class="hover:bg-gray-50">
													<td class="px-3 py-2 text-sm text-gray-800">{row.name}</td>
													<td class="px-3 py-2 text-sm text-gray-600">{row.category}</td>
													<td class="px-3 py-2 text-right text-sm text-gray-700">{numberFmt.format(row.quantity)}</td>
													<td class="px-3 py-2 text-right text-sm text-gray-700">{numberFmt.format(row.eomCount)}</td>
													<td class="px-3 py-2 text-right text-sm font-semibold {row.variance < 0 ? 'text-rose-700' : row.variance > 0 ? 'text-emerald-700' : 'text-gray-700'}">
														{row.variance > 0 ? '+' : ''}{numberFmt.format(row.variance)}
													</td>
												</tr>
											{/each}
										{/if}
									</tbody>
								</table>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Variance Analytics</h3>
							<div class="mt-3 space-y-2 text-sm">
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Negative variance items</span><span class="font-semibold {eomVarianceNegativeCount > 0 ? 'text-rose-700' : 'text-emerald-700'}">{numberFmt.format(eomVarianceNegativeCount)}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span class="text-gray-600">Positive variance items</span><span class="font-semibold text-emerald-700">{numberFmt.format(eomVariancePositiveCount)}</span></div>
							</div>
							<div class="mt-3 space-y-2">
								{#each eomCategoryVariance as bucket}
									<div>
										<div class="mb-1 flex items-center justify-between text-xs text-gray-600">
											<span>{bucket.category}</span>
											<span class="font-semibold {bucket.variance < 0 ? 'text-rose-700' : bucket.variance > 0 ? 'text-emerald-700' : 'text-gray-700'}">{bucket.variance > 0 ? '+' : ''}{numberFmt.format(bucket.variance)}</span>
										</div>
										<div class="h-2 rounded bg-gray-100">
											<div class="h-2 rounded {bucket.variance < 0 ? 'bg-rose-500' : 'bg-emerald-500'}" style="width:{Math.max(8, Math.round((Math.abs(bucket.variance) / eomVarianceAbsMax) * 100))}%"></div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-3">
						<div class="rounded-xl border border-gray-200 p-4 lg:col-span-2">
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-sm font-semibold text-gray-900">Requests Trend (Line + Area + Forecast)</h3>
								<span class="text-xs text-gray-500">Moving average + anomaly markers</span>
							</div>
							{#if requestsOverTime.length === 0}
								<p class="text-sm text-gray-500">No trend data for this period.</p>
							{:else}
								{@const values = requestsOverTime.map((p) => p.count)}
								{@const maxVal = Math.max(...values, 1)}
								<svg viewBox="0 0 100 100" class="h-56 w-full rounded-lg bg-gray-50">
									<polyline fill="none" stroke="#06b6d4" stroke-width="1.8" points={linePath(values)} />
									<polyline fill="none" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="2 2" points={linePath(movingAverage)} />
									<polygon points={`0,100 ${linePath(values)} 100,100`} fill="rgba(6,182,212,0.12)" />
									{#each values as v, i}
										{#if anomalies.includes(i)}
											<circle cx={lineX(i, values.length)} cy={lineY(v, maxVal)} r="1.8" fill="#ef4444">
												<title>Anomaly: {requestsOverTime[i].date} ({v})</title>
											</circle>
										{/if}
									{/each}
								</svg>
								<div class="mt-2 flex items-center justify-between text-xs text-gray-500">
									<span>Comparison Period Delta: {comparison.deltaPct}%</span>
									<span>Forecast next point: {trendForecast ?? 'N/A'} requests</span>
								</div>
							{/if}
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Funnel Analysis</h3>
							<div class="mt-3 space-y-2">
								{#each funnel as step}
									<div>
										<div class="mb-1 flex items-center justify-between text-xs text-gray-500">
											<span>{step.label}</span>
											<span>{step.value}</span>
										</div>
										<div class="h-3 rounded bg-gray-100">
											<div class="h-3 rounded bg-pink-500" style="width:{Math.max(8, Math.round((step.value / funnelMax) * 100))}%"></div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-3">
						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Status Distribution (Cross-filter)</h3>
							<div class="mt-3 space-y-2">
								{#each filteredStatusBreakdown as item}
									<button
										onclick={() => (chartStatusFilter = chartStatusFilter === item.status ? 'all' : item.status)}
										class="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
									>
										<div class="mb-1 flex items-center justify-between text-xs text-gray-500">
											<span>{item.status}</span>
											<span>{item.count}</span>
										</div>
										<div class="h-2 rounded bg-gray-100">
											<div class="h-2 rounded bg-indigo-500" style="width:{Math.max(8, Math.round((item.count / statusBreakdownMax) * 100))}%"></div>
										</div>
									</button>
								{/each}
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Resolution Pie</h3>
							<svg viewBox="0 0 42 42" class="mx-auto mt-3 h-40 w-40 -rotate-90">
								<circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#e5e7eb" stroke-width="7"></circle>
								{#each resolutionPie as seg}
									<circle
										cx="21"
										cy="21"
										r="15.9155"
										fill="transparent"
										stroke={seg.color}
										stroke-width="7"
										stroke-dasharray={`${seg.pct * 100} ${100 - seg.pct * 100}`}
										stroke-dashoffset={-seg.start * 100}
									>
										<title>{seg.label}: {seg.count}</title>
									</circle>
								{/each}
							</svg>
							<div class="mt-2 space-y-1 text-xs text-gray-600">
								{#each resolutionPie as seg}
									<div class="flex items-center justify-between">
										<span class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full" style="background:{seg.color}"></span>{seg.label}</span>
										<span>{seg.count}</span>
									</div>
								{/each}
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Treemap by Category</h3>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each treemapBlocks as block}
									<div class="min-h-16 rounded-md bg-gradient-to-br from-pink-100 to-pink-300 p-2 text-xs text-pink-900" style="width:{Math.min(100, block.w)}%">
										<div class="font-semibold">{block.category || 'Uncategorized'}</div>
										<div>{block.count} obligations</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'operations'}
					<div class="grid gap-4 lg:grid-cols-3">
						<div class="rounded-xl border border-gray-200 p-4 lg:col-span-2">
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-sm font-semibold text-gray-900">Overdue Requests Table</h3>
								<div class="flex items-center gap-2">
									<button onclick={exportOverdueCSV} class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><Download size={12} /> CSV</button>
									<button onclick={exportOverdueExcel} class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">Excel</button>
									<button onclick={exportAsPDF} class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">PDF</button>
									<button onclick={copyApiEndpoint} class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">API</button>
								</div>
							</div>

							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><button onclick={() => toggleOverdueSort('studentName')}>Student {sortCaret('studentName')}</button></th>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><button onclick={() => toggleOverdueSort('returnDate')}>Due Date {sortCaret('returnDate')}</button></th>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><button onclick={() => toggleOverdueSort('daysOverdue')}>Days Overdue {sortCaret('daysOverdue')}</button></th>
											<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><button onclick={() => toggleOverdueSort('itemCount')}>Items {sortCaret('itemCount')}</button></th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 bg-white">
										{#if filteredOverdue.length === 0}
											<tr><td colspan="4" class="px-3 py-4 text-sm text-gray-500">No overdue records for the current filter set.</td></tr>
										{:else}
											{#each filteredOverdue as row}
												<tr class="hover:bg-gray-50" title="Click-through ready row for detail views">
													<td class="px-3 py-2 text-sm text-gray-800">{row.studentName}</td>
													<td class="px-3 py-2 text-sm text-gray-600">{new Date(row.returnDate).toLocaleDateString()}</td>
													<td class="px-3 py-2 text-sm font-medium text-rose-700">{row.daysOverdue}</td>
													<td class="px-3 py-2 text-sm text-gray-700">{row.itemCount}</td>
												</tr>
											{/each}
										{/if}
									</tbody>
									<tfoot class="bg-gray-50">
										<tr class="text-xs font-semibold text-gray-600">
											<td class="px-3 py-2">Inline Aggregates</td>
											<td class="px-3 py-2">Rows: {filteredOverdue.length}</td>
											<td class="px-3 py-2">Avg days: {overdueAggregates.avgDays}</td>
											<td class="px-3 py-2">Total items: {overdueAggregates.totalItems}</td>
										</tr>
									</tfoot>
								</table>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Peak Hours Heatmap</h3>
							<div class="mt-3 overflow-x-auto">
								<div class="min-w-max">
									<div class="mb-1 ml-10 flex">
										{#each Array(24) as _, h}
											<div class="w-4 text-center text-[10px] text-gray-400">{h}</div>
										{/each}
									</div>
									{#each [1, 2, 3, 4, 5, 6, 7] as day}
										<div class="mb-1 flex items-center">
											<span class="w-9 text-right pr-2 text-[10px] text-gray-500">{DAY_NAMES[day - 1]}</span>
											{#each Array(24) as _, h}
												{@const value = heatmapCell(day, h)}
												<div class="mx-px h-4 w-4 rounded-sm {heatmapClass(value)}" title="{DAY_NAMES[day - 1]} {h}:00 -> {value}"></div>
											{/each}
										</div>
									{/each}
								</div>
							</div>
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Most Borrowed (Widget-level Filter)</h3>
							<p class="text-xs text-gray-500">Widget status filter: {chartStatusFilter === 'all' ? 'none' : chartStatusFilter}</p>
							<div class="mt-3 space-y-2">
								{#each filteredMostBorrowed as item}
									<div class="rounded-lg border border-gray-200 p-2">
										<div class="mb-1 flex items-center justify-between text-xs text-gray-600">
											<span>{item.name}</span>
											<span>{item.totalBorrows}</span>
										</div>
										<div class="h-2 rounded bg-gray-100">
											<div class="h-2 rounded bg-teal-500" style="width:{Math.max(8, Math.round((item.totalBorrows / mostBorrowedMax) * 100))}%"></div>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Geospatial Placeholder</h3>
							<p class="mt-2 text-sm text-gray-600">No location fields are present in the current analytics payload. Add region/campus coordinates to enable map tiles and geo-clustering.</p>
							<div class="mt-3 grid h-36 place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500">
								Map widget ready
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'risk'}
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-xl border border-gray-200 p-4">
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-sm font-semibold text-gray-900">Trust vs Incident Scatter</h3>
								<span class="text-xs text-gray-500">Cohort-style behavior view</span>
							</div>
							<svg viewBox="0 0 100 100" class="h-64 w-full rounded-lg bg-gray-50">
								{#each scatterData as p}
									<circle cx={p.x} cy={100 - p.y} r="1.6" fill="#0ea5e9">
										<title>{p.label}: trust {p.x}, incident index {p.y}</title>
									</circle>
								{/each}
							</svg>
							<p class="mt-2 text-xs text-gray-500">Lower-left indicates healthier behavior cohorts.</p>
						</div>

						<div class="rounded-xl border border-gray-200 p-4">
							<h3 class="text-sm font-semibold text-gray-900">Path / Retention Proxy</h3>
							<div class="mt-3 space-y-2 text-sm text-gray-700">
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span>Students with trust score</span><span>{trustScores.length}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span>Students with overdue signals</span><span>{report.studentRisk.overdueStudents.length}</span></div>
								<div class="flex items-center justify-between rounded-md bg-gray-50 p-2"><span>Repeat offenders</span><span>{report.studentRisk.repeatOffenders.length}</span></div>
							</div>
							<p class="mt-3 text-xs text-gray-500">For true cohort retention analysis, add event timestamps keyed by cohort anchor date.</p>
						</div>
					</div>

					<div class="rounded-xl border border-gray-200 p-4">
						<div class="mb-3 flex items-center justify-between">
							<h3 class="text-sm font-semibold text-gray-900">Risk Table (Row Expansion Drill-down)</h3>
							<span class="text-xs text-gray-500">Click a row for sub-metrics</span>
						</div>
						<div class="space-y-2">
							{#if filteredTrustScores.length === 0}
								<p class="text-sm text-gray-500">No students match current filters.</p>
							{:else}
								{#each filteredTrustScores as s}
									<div class="rounded-lg border border-gray-200">
										<button class="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50" onclick={() => (expandedStudentId = expandedStudentId === s._id ? null : s._id)}>
											<div class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
												{#if s.profilePhotoUrl}
													<img src={s.profilePhotoUrl} alt={s.studentName} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{getInitials(s.studentName)}
												{/if}
											</div>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-medium text-gray-900">{s.studentName}</p>
												<p class="truncate text-xs text-gray-500">{s.studentEmail}</p>
											</div>
											<span class="rounded-full px-2 py-0.5 text-xs font-semibold {trustBadge(s)}">{s.trustScore ?? 0}%</span>
										</button>
										{#if expandedStudentId === s._id}
											<div class="grid grid-cols-2 gap-2 border-t border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 sm:grid-cols-4">
												<div><p class="text-gray-500">Missing</p><p class="font-semibold">{s.missingCount ?? 0}</p></div>
												<div><p class="text-gray-500">Damaged</p><p class="font-semibold">{s.damagedCount ?? 0}</p></div>
												<div><p class="text-gray-500">Active obligations</p><p class="font-semibold">{s.activeObligations ?? 0}</p></div>
												<div><p class="text-gray-500">Overdue</p><p class="font-semibold">{s.overdueCount ?? 0}</p></div>
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><Rows3 size={12} /> URL-state enabled</span>
			<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><ChartNoAxesCombined size={12} /> Drill-down and cross-filter enabled</span>
			<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><Clock3 size={12} /> Scheduled email reports require backend scheduler endpoint</span>
		</div>
	</div>
</div>


