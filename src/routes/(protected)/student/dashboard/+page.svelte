<script lang="ts">
	import { onMount } from 'svelte';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		ClipboardList, Clock, PackageOpen, TriangleAlert,
		CheckCircle2, CalendarDays, TrendingUp, Package,
		ArrowRight, CircleCheck, CornerDownLeft, CircleAlert,
		PackageCheck, CircleX, RefreshCw
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
	let currentTime = $state(new Date());

	// ── helpers ───────────────────────────────────────────────────────────────
	function formatRequestCode(id: string) {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	function toUiStatus(raw: BorrowRequestRecord['status']): string {
		const map: Record<string, string> = {
			pending_instructor: 'pending',
			approved_instructor: 'approved',
			ready_for_pickup: 'ready',
			borrowed: 'picked-up',
			pending_return: 'pending-return',
			missing: 'missing',
			returned: 'returned',
			rejected: 'rejected'
		};
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
		const status = toUiStatus(r.status);
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
		try {
			const res = await borrowRequestsAPI.list({ limit: 100 }, { forceRefresh: force });
			allRequests = res.requests.map(mapToCard);
		} catch {
			toastStore.error('Failed to load dashboard data', 'Error');
		} finally {
			loading = false;
		}
	}

	// ── derived metrics ───────────────────────────────────────────────────────
	const metrics = $derived({
		totalRequests: allRequests.length,
		activeLoans: allRequests.filter((r) => ['picked-up', 'pending-return'].includes(r.status)).length,
		pendingCount: allRequests.filter((r) => ['pending', 'approved', 'ready'].includes(r.status)).length,
		overdueCount: allRequests.filter((r) => r.isOverdue).length,
		returnedCount: allRequests.filter((r) => r.status === 'returned').length,
		rejectedCount: allRequests.filter((r) => r.status === 'rejected').length
	});

	// Approval rate — out of resolved (returned + rejected)
	const approvalRate = $derived.by(() => {
		const resolved = metrics.returnedCount + metrics.rejectedCount;
		if (resolved === 0) return null;
		return Math.round((metrics.returnedCount / resolved) * 100);
	});

	// On-time return rate — returned requests where returnedAt <= returnDate
	const onTimeRate = $derived.by(() => {
		const returned = allRequests.filter((r) => r.status === 'returned');
		if (returned.length === 0) return null;
		// We don't have returnedAt here, so use a proxy: non-overdue at time of return
		// We'll surface this as "completed loan rate" instead
		return metrics.returnedCount;
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

	// ── greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
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
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">
				{greeting}, {$user?.firstName}
			</h1>
			<p class="mt-1 text-sm text-gray-500">
				{#if $user?.yearLevel && $user?.block}
					{$user.yearLevel} · Block {$user.block}
				{:else}
					Student Portal
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				onclick={() => loadDashboard(true)}
				class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
			>
				<RefreshCw size={15} />
				Refresh
			</button>
			<a
				href="/student/request"
				class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 transition-colors"
			>
				<ClipboardList size={15} />
				New Request
			</a>
		</div>
	</div>

	{#if loading}
		<!-- ── Skeleton ────────────────────────────────────────────────────── -->
		<div class="space-y-6" aria-busy="true">
			<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

		<!-- ── KPI cards ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">

			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Active Loans</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
						<Package size={18} class="text-violet-600" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-bold text-gray-900">{metrics.activeLoans}</p>
				<p class="mt-1 text-xs text-gray-400">Currently borrowed</p>
			</div>

			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">In Progress</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100">
						<Clock size={18} class="text-yellow-600" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-bold text-gray-900">{metrics.pendingCount}</p>
				<p class="mt-1 text-xs text-gray-400">Awaiting action</p>
			</div>

			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Overdue</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-lg {metrics.overdueCount > 0 ? 'bg-red-100' : 'bg-gray-100'}">
						<TriangleAlert size={18} class="{metrics.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-bold {metrics.overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}">{metrics.overdueCount}</p>
				<p class="mt-1 text-xs text-gray-400">Past return date</p>
			</div>

			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Completion Rate</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-100">
						<TrendingUp size={18} class="text-pink-600" />
					</div>
				</div>
				{#if approvalRate !== null}
					<p class="mt-3 text-3xl font-bold text-gray-900">{approvalRate}%</p>
					<p class="mt-1 text-xs text-gray-400">Returned vs resolved</p>
				{:else}
					<p class="mt-3 text-3xl font-bold text-gray-400">—</p>
					<p class="mt-1 text-xs text-gray-400">No history yet</p>
				{/if}
			</div>
		</div>

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
						<ul class="divide-y divide-gray-50">
							{#each activeRequests as req}
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
											<svelte:component this={statusIcon(req.status)} size={10} />
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
						<ul class="divide-y divide-gray-50">
							{#each pendingRequests as req}
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
										<svelte:component this={statusIcon(req.status)} size={10} />
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
							<a href="/student/history" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
								View all <ArrowRight size={13} />
							</a>
						</div>
						<ul class="divide-y divide-gray-50">
							{#each recentHistory as req}
								<li class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-gray-800">
											{req.items.slice(0, 2).map((i) => i.name).join(', ')}{req.items.length > 2 ? ` +${req.items.length - 2}` : ''}
										</p>
										<p class="mt-0.5 font-mono text-xs text-gray-400">{req.id}</p>
									</div>
									<div class="flex shrink-0 flex-col items-end gap-1">
										<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {statusColor(req.status)}">
											<svelte:component this={statusIcon(req.status)} size={10} />
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
			<div class="space-y-6">

				<!-- Performance -->
				<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
					<div class="mb-4 flex items-center gap-2">
						<TrendingUp size={17} class="text-pink-600" />
						<h2 class="text-sm font-semibold text-gray-900">Performance</h2>
					</div>
					<dl class="space-y-3">
						<div class="flex items-center justify-between">
							<dt class="text-xs text-gray-500">Total Requests</dt>
							<dd class="text-sm font-semibold text-gray-900">{metrics.totalRequests}</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-xs text-gray-500">Successfully Returned</dt>
							<dd class="text-sm font-semibold text-teal-600">{metrics.returnedCount}</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-xs text-gray-500">Rejected</dt>
							<dd class="text-sm font-semibold {metrics.rejectedCount > 0 ? 'text-red-600' : 'text-gray-400'}">{metrics.rejectedCount}</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-xs text-gray-500">Overdue</dt>
							<dd class="text-sm font-semibold {metrics.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}">{metrics.overdueCount}</dd>
						</div>
						{#if approvalRate !== null}
							<div class="border-t border-gray-100 pt-3">
								<div class="mb-1.5 flex items-center justify-between">
									<dt class="text-xs text-gray-500">Completion Rate</dt>
									<dd class="text-xs font-bold text-gray-700">{approvalRate}%</dd>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
									<div
										class="h-2 rounded-full transition-all {approvalRate >= 80 ? 'bg-teal-500' : approvalRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}"
										style="width: {approvalRate}%"
									></div>
								</div>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Due Soon -->
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
						<div class="flex items-center gap-2">
							<CalendarDays size={17} class="text-orange-500" />
							<h2 class="text-sm font-semibold text-gray-900">Due Soon</h2>
						</div>
						{#if dueSoon.length > 0}
							<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{dueSoon.length}</span>
						{/if}
					</div>

					{#if dueSoon.length === 0}
						<div class="px-5 py-8 text-center">
							<CalendarDays size={28} class="mx-auto text-gray-300" />
							<p class="mt-2 text-xs text-gray-400">Nothing due soon</p>
						</div>
					{:else}
						<ul class="divide-y divide-gray-50">
							{#each dueSoon as req}
								{@const badge = dueBadge(req.daysUntilDue!)}
								<li class="px-5 py-3.5">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-800">
												{req.items[0]?.name ?? '—'}{req.items.length > 1 ? ` +${req.items.length - 1}` : ''}
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
								Manage returns <ArrowRight size={12} />
							</a>
						</div>
					{/if}
				</div>

				<!-- Quick Actions -->
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="border-b border-gray-100 px-5 py-4">
						<h2 class="text-sm font-semibold text-gray-900">Quick Actions</h2>
					</div>
					<div class="divide-y divide-gray-50">
						<a href="/student/request" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-100">
								<ClipboardList size={15} class="text-pink-600" />
							</div>
							<div>
								<p class="text-xs font-semibold text-gray-800">New Request</p>
								<p class="text-[11px] text-gray-400">Borrow equipment</p>
							</div>
						</a>
						<a href="/student/requests" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-100">
								<Clock size={15} class="text-yellow-600" />
							</div>
							<div>
								<p class="text-xs font-semibold text-gray-800">My Requests</p>
								<p class="text-[11px] text-gray-400">Track all requests</p>
							</div>
						</a>
						<a href="/student/borrowed" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
								<Package size={15} class="text-violet-600" />
							</div>
							<div>
								<p class="text-xs font-semibold text-gray-800">Borrowed Items</p>
								<p class="text-[11px] text-gray-400">Monitor active loans</p>
							</div>
						</a>
						<a href="/student/catalog" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100">
								<PackageOpen size={15} class="text-teal-600" />
							</div>
							<div>
								<p class="text-xs font-semibold text-gray-800">Browse Catalog</p>
								<p class="text-[11px] text-gray-400">View available items</p>
							</div>
						</a>
					</div>
				</div>

			</div>
		</div>

	{/if}
</div>
