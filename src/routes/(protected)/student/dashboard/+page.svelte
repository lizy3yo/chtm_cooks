<script lang="ts">
	import { onMount } from 'svelte';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { statisticsAPI, type StudentStatisticsData } from '$lib/api/statistics';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		ClipboardList, Clock, PackageOpen, TriangleAlert,
		CheckCircle2, CalendarDays, TrendingUp, Package,
		ArrowRight, CircleCheck, CornerDownLeft, CircleAlert,
		PackageCheck, CircleX, PackageX,
		ChevronDown, ChevronUp, Award, ShieldCheck, BellRing
	} from 'lucide-svelte';

	// ── types ────────────────────────────────────────────────────────────────
	interface DashboardRequest {
		rawId: string;
		id: string;
		status: string;
		statusLabel: string;
		items: { name: string; picture?: string }[];
		itemCount: number;
		borrowDate: string;
		returnDate: string;
		createdAt: string;
		instructor: string;
		daysUntilDue: number | null;
		isOverdue: boolean;
	}

	// ── state ─────────────────────────────────────────────────────────────────
	let loading = $state(true);
	let allRequests = $state<DashboardRequest[]>([]);
	let performanceStats = $state<StudentStatisticsData | null>(null);
	let showScoreBreakdown = $state(false);
	let currentTime = $state(new Date());

	// ── helpers ───────────────────────────────────────────────────────────────
	function formatRequestCode(id: string) {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	// Removed currency formatting - system now tracks item replacement only

	function isCancelledRequest(raw: BorrowRequestRecord['status'], rejectionReason?: string): boolean {
		return raw === 'cancelled' || (raw === 'rejected' && rejectionReason === 'Request cancelled by student');
	}

	function toUiStatus(raw: BorrowRequestRecord['status'], rejectionReason?: string): string {
		const map: Record<string, string> = {
			pending_instructor: 'pending',
			approved_instructor: 'approved',
			ready_for_pickup: 'ready',
			borrowed: 'picked-up',
			pending_return: 'pending-return',
			missing: 'missing',
			returned: 'returned',
			cancelled: 'cancelled',
			rejected: 'rejected'
		};
		if (isCancelledRequest(raw, rejectionReason)) return 'cancelled';
		return map[raw] ?? raw;
	}

	function toStatusLabel(s: string): string {
		const labels: Record<string, string> = {
			'pending': 'Pending Review',
			'approved': 'Instructor Approved',
			'ready': 'Ready for Pickup',
			'picked-up': 'Active Loan',
			'pending-return': 'Return Initiated',
			'missing': 'Item Missing',
			'returned': 'Returned',
			'cancelled': 'Cancelled',
			'rejected': 'Rejected'
		};
		return labels[s] ?? s;
	}

	function calcDaysUntilDue(returnDate: string): number {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const due = new Date(returnDate);
		due.setHours(0, 0, 0, 0);
		return Math.round((due.getTime() - now.getTime()) / 86_400_000);
	}

	function mapToCard(r: BorrowRequestRecord): DashboardRequest {
		const status = toUiStatus(r.status, r.rejectReason);
		const days = ['picked-up', 'pending-return', 'missing'].includes(status)
			? calcDaysUntilDue(r.returnDate)
			: null;
		return {
			rawId: r.id,
			id: formatRequestCode(r.id),
			status,
			statusLabel: toStatusLabel(status),
			items: r.items.map((i) => ({ name: i.name, picture: i.picture })),
			itemCount: r.items.length,
			borrowDate: r.borrowDate,
			returnDate: r.returnDate,
			createdAt: r.createdAt,
			instructor: r.instructor?.fullName ?? 'Pending Assignment',
			daysUntilDue: days,
			isOverdue: days !== null && days < 0
		};
	}

	async function loadDashboard(force = false) {
		const [requestsResult, statsResult] = await Promise.allSettled([
			borrowRequestsAPI.list({ limit: 100 }, { forceRefresh: force }),
			statisticsAPI.get({ forceRefresh: force, period: '180d' })
		]);

		if (requestsResult.status === 'fulfilled') {
			allRequests = requestsResult.value.requests.map(mapToCard);
		} else {
			toastStore.error('Failed to load dashboard data', 'Error');
		}

		if (statsResult.status === 'fulfilled') {
			performanceStats = statsResult.value;
		} else {
			performanceStats = null;
		}

		loading = false;
	}

	// ── derived metrics ───────────────────────────────────────────────────────
	const metrics = $derived({
		totalRequests: allRequests.length,
		activeLoans: allRequests.filter((r) => ['picked-up', 'pending-return'].includes(r.status)).length,
		pendingCount: allRequests.filter((r) => ['pending', 'approved', 'ready'].includes(r.status)).length,
		overdueCount: allRequests.filter((r) => r.isOverdue).length,
		returnedCount: allRequests.filter((r) => r.status === 'returned').length,
		cancelledCount: allRequests.filter((r) => r.status === 'cancelled').length,
		rejectedCount: allRequests.filter((r) => r.status === 'rejected').length
	});

	// Active request in best next-action priority
	const activeRequests = $derived(
		allRequests.filter((r) => ['picked-up', 'pending-return', 'missing'].includes(r.status))
	);

	// Requests pending action (need attention from student or admin)
	const pendingRequests = $derived(
		allRequests.filter((r) => ['pending', 'approved', 'ready'].includes(r.status))
	);

	// Items due within 7 days, sorted by urgency
	const dueSoon = $derived(
		allRequests
			.filter((r) => r.daysUntilDue !== null && r.daysUntilDue <= 7)
			.sort((a, b) => (a.daysUntilDue ?? 99) - (b.daysUntilDue ?? 99))
	);

	// Recent history (last 5 terminal requests)
	const recentHistory = $derived(
		allRequests
			.filter((r) => ['returned', 'rejected'].includes(r.status))
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
			.slice(0, 5)
	);

	const requestOverview = $derived.by(() => {
		const missingCount = allRequests.filter((r) => r.status === 'missing').length;
		const rows = [
			{ label: 'Returned', value: metrics.returnedCount, dot: 'bg-emerald-500', text: 'text-emerald-700', bar: 'bg-emerald-500' },
			{ label: 'Active', value: metrics.activeLoans, dot: 'bg-violet-500', text: 'text-violet-700', bar: 'bg-violet-500' },
			{ label: 'Pending review', value: metrics.pendingCount, dot: 'bg-amber-500', text: 'text-amber-700', bar: 'bg-amber-500' },
			{ label: 'Cancelled', value: metrics.cancelledCount, dot: 'bg-slate-500', text: 'text-slate-700', bar: 'bg-slate-500' },
			{ label: 'Rejected', value: metrics.rejectedCount, dot: 'bg-red-500', text: 'text-red-700', bar: 'bg-red-500' },
			{ label: 'Missing', value: missingCount, dot: 'bg-rose-600', text: 'text-rose-700', bar: 'bg-rose-600' }
		] as const;

		const max = Math.max(...rows.map((r) => r.value), 1);
		return { rows, max };
	});

	// ── greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good Morning';
		if (h < 18) return 'Good Afternoon';
		return 'Good Evening';
	});

	// ── status badge helpers ──────────────────────────────────────────────────
	function statusColor(s: string): string {
		const map: Record<string, string> = {
			'pending': 'bg-yellow-100 text-yellow-800',
			'approved': 'bg-blue-100 text-blue-800',
			'ready': 'bg-emerald-100 text-emerald-800',
			'picked-up': 'bg-violet-100 text-violet-800',
			'pending-return': 'bg-orange-100 text-orange-800',
			'missing': 'bg-rose-100 text-rose-800',
			'returned': 'bg-teal-100 text-teal-800',
			'cancelled': 'bg-slate-100 text-slate-800',
			'rejected': 'bg-red-100 text-red-800'
		};
		return map[s] ?? 'bg-gray-100 text-gray-700';
	}

	function statusIcon(s: string) {
		const map: Record<string, unknown> = {
			'pending': Clock,
			'approved': CheckCircle2,
			'ready': PackageCheck,
			'picked-up': PackageCheck,
			'pending-return': CornerDownLeft,
			'missing': CircleAlert,
			'returned': CircleCheck,
			'cancelled': CircleX,
			'rejected': CircleX
		};
		return map[s] ?? Clock;
	}

	function dueBadge(days: number): { label: string; color: string } {
		if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'bg-red-100 text-red-700' };
		if (days === 0) return { label: 'Due today', color: 'bg-rose-100 text-rose-700' };
		if (days === 1) return { label: 'Due tomorrow', color: 'bg-orange-100 text-orange-700' };
		if (days <= 3) return { label: `${days}d left`, color: 'bg-amber-100 text-amber-700' };
		return { label: `${days}d left`, color: 'bg-green-100 text-green-700' };
	}

	function relativeTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const min = Math.floor(diff / 60_000);
		const hr = Math.floor(diff / 3_600_000);
		const day = Math.floor(diff / 86_400_000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		if (hr < 24) return `${hr}h ago`;
		if (day < 7) return `${day}d ago`;
		return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function trustTierConfig(tier: StudentStatisticsData['trustScore']['tier']): {
		label: string;
		description: string;
		text: string;
		bg: string;
		border: string;
		ring: string;
		stroke: string;
	} {
		const cfg = {
			excellent: {
				label: 'Excellent',
				description: 'Outstanding borrowing history. Keep this strong record going.',
				text: 'text-emerald-700',
				bg: 'bg-emerald-50',
				border: 'border-emerald-200',
				ring: 'bg-emerald-500',
				stroke: 'stroke-emerald-500'
			},
			good: {
				label: 'Good Standing',
				description: 'Good borrowing history. Keep up the responsible use of equipment.',
				text: 'text-pink-700',
				bg: 'bg-pink-50',
				border: 'border-pink-200',
				ring: 'bg-pink-500',
				stroke: 'stroke-pink-500'
			},
			fair: {
				label: 'Fair',
				description: 'You are doing okay. Focus on timely returns and item care.',
				text: 'text-amber-700',
				bg: 'bg-amber-50',
				border: 'border-amber-200',
				ring: 'bg-amber-500',
				stroke: 'stroke-amber-500'
			},
			poor: {
				label: 'Poor',
				description: 'Multiple issues were detected. Resolve obligations and improve handling.',
				text: 'text-orange-700',
				bg: 'bg-orange-50',
				border: 'border-orange-200',
				ring: 'bg-orange-500',
				stroke: 'stroke-orange-500'
			},
			critical: {
				label: 'Critical',
				description: 'High risk profile. Immediate improvement is needed.',
				text: 'text-red-700',
				bg: 'bg-red-50',
				border: 'border-red-200',
				ring: 'bg-red-500',
				stroke: 'stroke-red-500'
			}
		} as const;

		return cfg[tier] ?? cfg.fair;
	}

	function trustTierBadgeClass(tier: StudentStatisticsData['trustScore']['tier']): string {
		const badgeMap: Record<StudentStatisticsData['trustScore']['tier'], string> = {
			excellent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
			good: 'text-pink-700 bg-pink-50 border-pink-200',
			fair: 'text-amber-700 bg-amber-50 border-amber-200',
			poor: 'text-orange-700 bg-orange-50 border-orange-200',
			critical: 'text-red-700 bg-red-50 border-red-200'
		};

		return badgeMap[tier] ?? badgeMap.fair;
	}

	// ── lifecycle ─────────────────────────────────────────────────────────────
	onMount(async () => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}

		await loadDashboard();

		const clockId = setInterval(() => { currentTime = new Date(); }, 60_000);
		return () => clearInterval(clockId);
	});
</script>

<svelte:head>
	<title>Dashboard - Student Portal</title>
</svelte:head>

<div class="space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-bold text-gray-900 sm:text-2xl lg:text-3xl">
				{greeting}, {$user?.firstName}
			</h1>
			<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">
				{#if $user?.yearLevel && $user?.block}
					{$user.yearLevel} · Block {$user.block}
				{:else}
					Student Portal
				{/if}
			</p>
		</div>
		<a
			href="/student/request"
			class="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-pink-700 transition-colors sm:px-4 sm:text-sm"
		>
			<ClipboardList size={13} />
			New Request
		</a>
	</div>

	{#if loading}
		<!-- ── Skeleton ────────────────────────────────────────────────────── -->
		<div class="space-y-6" aria-busy="true">
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
				{#each Array(4) as _}
					<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-3">
						<Skeleton class="h-3.5 w-28" />
						<Skeleton class="h-9 w-16" />
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div class="lg:col-span-2 rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-4">
					<Skeleton class="h-5 w-40" />
					{#each Array(3) as _}
						<div class="space-y-2">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-3.5 w-3/4" />
						</div>
					{/each}
				</div>
				<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-4">
					<Skeleton class="h-5 w-32" />
					{#each Array(4) as _}
						<Skeleton class="h-10 w-full rounded-lg" />
					{/each}
				</div>
			</div>
		</div>

	{:else}

		{#if performanceStats}
			{@const trust = trustTierConfig(performanceStats.trustScore.tier)}
			{@const score = performanceStats.trustScore.score}
			<!-- ── Trust Score Hero ───────────────────────────────────────── -->
			<div class="rounded-xl border {trust.border} {trust.bg} p-4 shadow-sm sm:p-6">
				<div class="flex items-start gap-4">
					<!-- Gauge — smaller on mobile -->
					<div class="flex shrink-0 flex-col items-center gap-1.5">
						<div class="relative flex h-20 w-20 items-center justify-center sm:h-28 sm:w-28">
							<svg viewBox="0 0 120 120" class="h-full w-full -rotate-90">
								<circle cx="60" cy="60" r="50" fill="none" stroke="#d1d5db" stroke-width="10" />
								<circle
									cx="60"
									cy="60"
									r="50"
									fill="none"
									stroke-width="10"
									stroke-linecap="round"
									class="{trust.stroke}"
									stroke-dasharray="{Math.PI * 2 * 50}"
									stroke-dashoffset="{Math.PI * 2 * 50 * (1 - score / 100)}"
									style="transition: stroke-dashoffset 700ms ease;"
								/>
							</svg>
							<div class="absolute inset-0 flex flex-col items-center justify-center">
								<p class="text-2xl font-bold {trust.text} sm:text-4xl">{score}</p>
								<p class="text-[10px] text-gray-500 sm:text-xs">/ 100</p>
							</div>
						</div>
						<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {trustTierBadgeClass(performanceStats.trustScore.tier)}">
							<ShieldCheck class="h-3 w-3" />
							{trust.label}
						</span>
					</div>

					<!-- Text content -->
					<div class="min-w-0 flex-1 space-y-1.5">
						<h2 class="text-lg font-semibold {trust.text} sm:text-2xl">Trust Score</h2>
						<p class="text-xs text-gray-600 sm:text-sm">{trust.description}</p>

						<div class="pt-1">
							<div class="mb-1 flex justify-between text-xs text-gray-400">
								<span>0 - Critical</span>
								<span>100 - Excellent</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
								<div class="h-2 rounded-full {trust.ring}" style="width: {score}%"></div>
							</div>
						</div>

						<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
							<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500"></span>Critical &lt;40</span>
							<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500"></span>Poor 40-59</span>
							<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>Fair 60-74</span>
							<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-pink-500"></span>Good 75-89</span>
							<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Excellent 90+</span>
						</div>

						<button
							onclick={() => (showScoreBreakdown = !showScoreBreakdown)}
							class="inline-flex items-center gap-1 text-sm font-semibold {trust.text} hover:underline"
						>
							{#if showScoreBreakdown}
								<ChevronUp class="h-3.5 w-3.5" />Hide breakdown
							{:else}
								<ChevronDown class="h-3.5 w-3.5" />View breakdown
							{/if}
						</button>

						{#if showScoreBreakdown}
							<div class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
								<div class="rounded-lg border border-red-100 bg-white p-3">
									<p class="text-xs font-semibold uppercase tracking-wide text-red-600">Penalties</p>
									<div class="mt-2 space-y-1 text-xs text-gray-700">
										<div class="flex justify-between"><span>Missing items</span><span class="font-semibold text-red-600">-{performanceStats.trustScore.breakdown.missingItemPenalty}</span></div>
										<div class="flex justify-between"><span>Damaged items</span><span class="font-semibold text-red-600">-{performanceStats.trustScore.breakdown.damagedItemPenalty}</span></div>
										<div class="flex justify-between"><span>Late returns</span><span class="font-semibold text-red-600">-{performanceStats.trustScore.breakdown.lateReturnPenalty}</span></div>
										<div class="flex justify-between"><span>Cancelled after approval</span><span class="font-semibold text-red-600">-{performanceStats.trustScore.breakdown.cancelledAfterApprovalPenalty}</span></div>
										<div class="flex justify-between"><span>Pending obligations</span><span class="font-semibold text-red-600">-{performanceStats.trustScore.breakdown.pendingObligationPenalty}</span></div>
									</div>
									<div class="mt-2 border-t border-red-100 pt-2 text-xs font-bold text-red-700">
										Total penalties: -{performanceStats.trustScore.totalPenalties}
									</div>
								</div>
								<div class="rounded-lg border border-emerald-100 bg-white p-3">
									<p class="text-xs font-semibold uppercase tracking-wide text-emerald-600">Bonuses</p>
									<div class="mt-2 space-y-1 text-xs text-gray-700">
										<div class="flex justify-between"><span>Clean returns</span><span class="font-semibold text-emerald-600">+{performanceStats.trustScore.breakdown.cleanReturnBonus}</span></div>
										<div class="flex justify-between"><span>Resolved obligations</span><span class="font-semibold text-emerald-600">+{performanceStats.trustScore.breakdown.resolvedObligationBonus}</span></div>
									</div>
									<div class="mt-2 border-t border-emerald-100 pt-2 text-xs font-bold text-emerald-700">
										Total bonuses: +{performanceStats.trustScore.totalBonuses}
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- ── KPI cards ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">

			<div class="rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-sm sm:p-4">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
					<Package size={12} />
					<span>Active Loans</span>
				</div>
				<p class="mt-2 text-3xl font-bold text-violet-700 sm:text-4xl">{metrics.activeLoans}</p>
				<p class="mt-0.5 text-xs text-violet-500">Borrowed or returning</p>
			</div>

			<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm sm:p-4">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
					<CheckCircle2 size={12} />
					<span>Completed</span>
				</div>
				<p class="mt-2 text-3xl font-bold text-emerald-700 sm:text-4xl">{metrics.returnedCount}</p>
				<p class="mt-0.5 text-xs text-emerald-500">Successfully returned</p>
			</div>

			<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm sm:p-4">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
					<Clock size={12} />
					<span>Pending</span>
				</div>
				<p class="mt-2 text-3xl font-bold text-amber-700 sm:text-4xl">{metrics.pendingCount}</p>
				<p class="mt-0.5 text-xs text-amber-500">Awaiting action</p>
			</div>

			<div class="rounded-xl border {metrics.overdueCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'} p-3 shadow-sm sm:p-4">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {metrics.overdueCount > 0 ? 'text-red-700' : 'text-gray-600'}">
					<TriangleAlert size={12} />
					<span>Overdue</span>
				</div>
				<p class="mt-2 text-3xl font-bold {metrics.overdueCount > 0 ? 'text-red-700' : 'text-gray-700'} sm:text-4xl">{metrics.overdueCount}</p>
				<p class="mt-0.5 text-xs {metrics.overdueCount > 0 ? 'text-red-500' : 'text-gray-500'}">Past return date</p>
			</div>
		</div>

		{#if performanceStats}
			<!-- ── Performance Snapshot Cards ──────────────────────────────── -->
			<div class="grid gap-4 md:grid-cols-3">
				<!-- Return Performance -->
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
					<div class="mb-4 flex items-center gap-2">
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
							<TrendingUp class="h-4 w-4 text-blue-600" />
						</div>
						<h3 class="font-semibold text-gray-900">Return Performance</h3>
					</div>
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-500">On-time rate</span>
							<span class="text-sm font-bold {performanceStats.returnPerformance.onTimeRate === null ? 'text-gray-500' : performanceStats.returnPerformance.onTimeRate >= 80 ? 'text-emerald-600' : performanceStats.returnPerformance.onTimeRate >= 60 ? 'text-amber-600' : 'text-red-600'}">
								{performanceStats.returnPerformance.onTimeRate === null ? 'N/A' : `${performanceStats.returnPerformance.onTimeRate}%`}
							</span>
						</div>
						<div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
							<div
								class="h-2 rounded-full {performanceStats.returnPerformance.onTimeRate === null ? 'bg-gray-300' : performanceStats.returnPerformance.onTimeRate >= 80 ? 'bg-emerald-500' : performanceStats.returnPerformance.onTimeRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}"
								style="width: {performanceStats.returnPerformance.onTimeRate ?? 0}%"
							></div>
						</div>
						<div class="grid grid-cols-3 gap-2 pt-1">
							<div class="rounded-lg bg-emerald-50 p-2 text-center">
								<p class="text-2xl font-bold text-emerald-700">{performanceStats.returnPerformance.onTime}</p>
								<p class="text-xs text-emerald-500">On time</p>
							</div>
							<div class="rounded-lg bg-red-50 p-2 text-center">
								<p class="text-2xl font-bold text-red-700">{performanceStats.returnPerformance.late}</p>
								<p class="text-xs text-red-500">Late</p>
							</div>
							<div class="rounded-lg bg-gray-100 p-2 text-center">
								<p class="text-2xl font-bold text-gray-700">{performanceStats.returnPerformance.unknown}</p>
								<p class="text-xs text-gray-500">Unknown</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Item Health -->
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
					<div class="mb-4 flex items-center gap-2">
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50">
							<PackageCheck class="h-4 w-4 text-pink-600" />
						</div>
						<h3 class="font-semibold text-gray-900">Item Health</h3>
					</div>
					{#if performanceStats.itemHealth.totalInspected === 0}
						<p class="text-sm text-gray-400 italic">No inspections recorded yet.</p>
					{:else}
						<div class="space-y-3">
							<div class="flex items-center justify-between text-sm">
								<span class="text-gray-500">Good condition rate</span>
								<span class="font-bold {performanceStats.itemHealth.goodRate === null ? 'text-gray-500' : performanceStats.itemHealth.goodRate >= 90 ? 'text-emerald-600' : performanceStats.itemHealth.goodRate >= 70 ? 'text-amber-600' : 'text-red-600'}">
									{performanceStats.itemHealth.goodRate === null ? 'N/A' : `${performanceStats.itemHealth.goodRate}%`}
								</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
								<div class="h-2 rounded-full bg-emerald-500" style="width: {performanceStats.itemHealth.goodRate ?? 0}%"></div>
							</div>
							<div class="grid grid-cols-3 gap-2 pt-1">
								<div class="rounded-lg bg-emerald-50 p-2 text-center">
									<p class="text-2xl font-bold text-emerald-700">{performanceStats.itemHealth.goodCondition}</p>
									<p class="text-xs text-emerald-500">Good</p>
								</div>
								<div class="rounded-lg bg-orange-50 p-2 text-center">
									<p class="text-2xl font-bold text-orange-700">{performanceStats.itemHealth.damaged}</p>
									<p class="text-xs text-orange-500">Damaged</p>
								</div>
								<div class="rounded-lg bg-red-50 p-2 text-center">
									<p class="text-2xl font-bold text-red-700">{performanceStats.itemHealth.missing}</p>
									<p class="text-xs text-red-500">Missing</p>
								</div>
							</div>
							<p class="text-xs text-gray-400">{performanceStats.itemHealth.totalInspected} items inspected</p>
						</div>
					{/if}
				</div>

				<!-- Replacement Record -->
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
					<div class="mb-4 flex items-center gap-2">
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
							<PackageX class="h-4 w-4 text-emerald-600" />
						</div>
						<h3 class="font-semibold text-gray-900">Replacement Record</h3>
					</div>
					{#if performanceStats.replacement.totalObligations === 0}
						<p class="text-sm text-gray-400 italic">No replacement records yet.</p>
					{:else}
						<div class="space-y-3">
							<div class="flex items-center justify-between text-sm">
								<span class="text-gray-500">Outstanding items</span>
								<span class="font-bold {performanceStats.replacement.balance > 0 ? 'text-red-600' : 'text-emerald-600'}">
									{performanceStats.replacement.balance} item{performanceStats.replacement.balance !== 1 ? 's' : ''}
								</span>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div class="rounded-lg bg-red-50 p-2 text-center">
									<p class="text-2xl font-bold text-red-700">{performanceStats.replacement.pendingCount}</p>
									<p class="text-xs text-red-500">Pending cases</p>
								</div>
								<div class="rounded-lg bg-emerald-50 p-2 text-center">
									<p class="text-2xl font-bold text-emerald-700">{performanceStats.replacement.resolvedCount}</p>
									<p class="text-xs text-emerald-500">Resolved cases</p>
								</div>
							</div>
							<div class="space-y-1 text-xs text-gray-400">
								<div class="flex justify-between">
									<span>Recorded ({performanceStats.periodLabel})</span>
									<span>{performanceStats.replacement.periodIncurredAmount} item{performanceStats.replacement.periodIncurredAmount !== 1 ? 's' : ''}</span>
								</div>
								<div class="flex justify-between">
									<span>Total items affected</span>
									<span>{performanceStats.replacement.totalAmount} item{performanceStats.replacement.totalAmount !== 1 ? 's' : ''}</span>
								</div>
								<div class="flex justify-between">
									<span>Items replaced</span>
									<span class="text-emerald-600">{performanceStats.replacement.amountPaid} item{performanceStats.replacement.amountPaid !== 1 ? 's' : ''}</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── Main 2-col grid ─────────────────────────────────────────────── -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">

			<!-- LEFT col ────────────────────────────────────────────────────── -->
			<div class="space-y-6 lg:col-span-2">

				<!-- Active Loans -->
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
						<div class="flex items-center gap-2">
							<PackageOpen size={18} class="text-violet-600" />
							<h2 class="text-sm font-semibold text-gray-900">Active Loans</h2>
						</div>
						<a href="/student/borrowed" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
							View all <ArrowRight size={13} />
						</a>
					</div>

					{#if activeRequests.length === 0}
						<div class="px-5 py-10 text-center">
							<PackageCheck size={32} class="mx-auto text-gray-300" />
							<p class="mt-2 text-sm text-gray-500">No active loans</p>
						</div>
					{:else}
						<ul class="max-h-64 divide-y divide-gray-50 overflow-y-auto lg:h-[252px]">
							{#each activeRequests as req}
								{@const Icon = statusIcon(req.status)}
								{@const badge = req.daysUntilDue !== null ? dueBadge(req.daysUntilDue) : null}
								<li class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
									<div class="flex -space-x-2 shrink-0">
										{#each req.items.slice(0, 3) as item}
											{#if item.picture}
												<img src={item.picture} alt={item.name} class="h-9 w-9 rounded-full object-cover ring-2 ring-white" />
											{:else}
												<div class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white">
													<Package size={14} class="text-gray-400" />
												</div>
											{/if}
										{/each}
										{#if req.items.length > 3}
											<div class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 ring-2 ring-white text-xs font-medium text-gray-600">
												+{req.items.length - 3}
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900">
											{req.items.slice(0, 2).map((i) => i.name).join(', ')}{req.items.length > 2 ? ` +${req.items.length - 2} more` : ''}
										</p>
										<div class="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
											<span class="font-mono">{req.id}</span>
											<span>·</span>
											<span>Due {new Date(req.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
										</div>
									</div>
									<div class="flex shrink-0 flex-col items-end gap-1.5">
										<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {statusColor(req.status)}">
											<Icon size={10} />
											{req.statusLabel}
										</span>
										{#if badge}
											<span class="rounded-full px-2 py-0.5 text-xs font-semibold {badge.color}">
												{badge.label}
											</span>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Pending Requests -->
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
						<div class="flex items-center gap-2">
							<Clock size={18} class="text-yellow-500" />
							<h2 class="text-sm font-semibold text-gray-900">Pending Requests</h2>
						</div>
						<a href="/student/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
							View all <ArrowRight size={13} />
						</a>
					</div>

					{#if pendingRequests.length === 0}
						<div class="px-5 py-10 text-center">
							<CheckCircle2 size={32} class="mx-auto text-gray-300" />
							<p class="mt-2 text-sm text-gray-500">No pending requests</p>
						</div>
					{:else}
						<ul class="max-h-64 divide-y divide-gray-50 overflow-y-auto lg:h-[252px]">
							{#each pendingRequests as req}
								{@const Icon = statusIcon(req.status)}
								<li class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900">
											{req.items.slice(0, 2).map((i) => i.name).join(', ')}{req.items.length > 2 ? ` +${req.items.length - 2}` : ''}
										</p>
										<div class="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
											<span class="font-mono">{req.id}</span>
											<span>·</span>
											<CalendarDays size={11} />
											<span>{new Date(req.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(req.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
										</div>
										</div>
										<span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {statusColor(req.status)}">
											<Icon size={10} />
											{req.statusLabel}
										</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Recent History -->
				{#if recentHistory.length > 0}
					<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
						<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
							<div class="flex items-center gap-2">
								<CheckCircle2 size={18} class="text-teal-500" />
								<h2 class="text-sm font-semibold text-gray-900">Recent History</h2>
							</div>
							<a href="/student/account/history" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
								View all <ArrowRight size={13} />
							</a>
						</div>
						<ul class="divide-y divide-gray-50">
							{#each recentHistory as req}
								{@const Icon = statusIcon(req.status)}
								<li class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-gray-800">
											{req.items.slice(0, 2).map((i) => i.name).join(', ')}{req.items.length > 2 ? ` +${req.items.length - 2}` : ''}
										</p>
										<p class="mt-0.5 font-mono text-xs text-gray-400">{req.id}</p>
									</div>
									<div class="flex shrink-0 flex-col items-end gap-1">
										<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {statusColor(req.status)}">
											<Icon size={10} />
											{req.statusLabel}
										</span>
										<span class="text-xs text-gray-400">{relativeTime(req.createdAt)}</span>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

			</div>

			<!-- RIGHT sidebar ─────────────────────────────────────────────── -->
			<div class="space-y-6 lg:sticky lg:top-6 lg:self-start">

				<!-- Notifications -->
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
						<div class="flex items-center gap-2">
							<BellRing size={17} class="text-orange-500" />
							<h2 class="text-sm font-semibold text-gray-900">Notifications</h2>
						</div>
						{#if dueSoon.length > 0}
							<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{dueSoon.length}</span>
						{/if}
					</div>

					{#if dueSoon.length === 0}
						<div class="px-5 py-8 text-center">
							<BellRing size={28} class="mx-auto text-gray-300" />
							<p class="mt-2 text-xs text-gray-400">No notifications at the moment</p>
						</div>
					{:else}
						<ul class="max-h-56 divide-y divide-gray-50 overflow-y-auto lg:h-[212px]">
							{#each dueSoon as req}
								{@const badge = dueBadge(req.daysUntilDue!)}
								<li class="px-5 py-3.5">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-800">
												Return alert: {req.items[0]?.name ?? '—'}{req.items.length > 1 ? ` +${req.items.length - 1}` : ''}
											</p>
											<p class="mt-0.5 font-mono text-[11px] text-gray-400">{req.id}</p>
										</div>
										<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold {badge.color}">{badge.label}</span>
									</div>
								</li>
							{/each}
						</ul>
						<div class="border-t border-gray-100 px-5 py-3">
							<a href="/student/borrowed" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
								Review notifications <ArrowRight size={12} />
							</a>
						</div>
					{/if}
				</div>

				<!-- Performance -->
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
					<div class="mb-4 flex items-center gap-2">
						<TrendingUp size={17} class="text-pink-600" />
						<h2 class="text-sm font-semibold text-gray-900">Performance</h2>
					</div>
					<div class="space-y-3">
						{#each requestOverview.rows as row}
							<div class="grid grid-cols-[auto_1fr_auto_80px] items-center gap-3">
								<span class="h-2.5 w-2.5 rounded-full {row.dot}"></span>
								<p class="text-sm text-gray-600">{row.label}</p>
								<p class="text-lg font-semibold {row.text}">{row.value}</p>
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
									<div
										class="h-1.5 rounded-full {row.bar}"
										style="width: {(row.value / requestOverview.max) * 100}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>

			</div>
		</div>

	{/if}
</div>
