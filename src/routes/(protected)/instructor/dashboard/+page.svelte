<script lang="ts">
	import { onMount } from 'svelte';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { fetchAnalytics, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		ClipboardList, Clock, TriangleAlert, CheckCircle2,
		ArrowRight, PackageOpen,
		Activity, TrendingUp, Package, AlertCircle,
		ChevronRight
	} from 'lucide-svelte';

	// ── state ─────────────────────────────────────────────────────────────────
	let loading = $state(true);
	let report = $state<AnalyticsReport | null>(null);
	let liveRequests = $state<BorrowRequestRecord[]>([]);
	let requestsLoading = $state(true);
	let currentTime = $state(new Date());

	// ── greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	});

	// ── derived KPIs ──────────────────────────────────────────────────────────
	const pendingApprovalCount = $derived(
		liveRequests.filter(r => r.status === 'pending_instructor').length
	);
	const activeLoans = $derived(
		liveRequests.filter(r => r.status === 'borrowed' || r.status === 'pending_return').length
	);
	const overdueCount = $derived(
		liveRequests.filter(r =>
			(r.status === 'borrowed' || r.status === 'pending_return') &&
			new Date(r.returnDate) < new Date()
		).length
	);
	const fulfillmentCount = $derived(
		liveRequests.filter(r => r.status === 'approved_instructor' || r.status === 'ready_for_pickup').length
	);

	// request groups
	const requestsPending = $derived(liveRequests.filter(r => r.status === 'pending_instructor'));
	const requestsFulfillment = $derived(
		liveRequests.filter(r => r.status === 'approved_instructor' || r.status === 'ready_for_pickup')
	);
	const requestsActive = $derived(
		liveRequests.filter(r => r.status === 'borrowed' || r.status === 'pending_return')
	);
	const requestsOverdue = $derived(
		requestsActive.filter(r => new Date(r.returnDate) < new Date())
	);

	// analytics-derived
	const mostBorrowedItems = $derived(report?.inventory.mostBorrowedItems ?? []);
	const maxBorrows = $derived(Math.max(...(mostBorrowedItems.map(i => i.totalBorrows) ?? [1]), 1));
	const stockAlerts = $derived(report?.inventory.stockAlerts ?? []);
	const turnaround = $derived(report?.borrowRequests.turnaround);

	// ── helpers ───────────────────────────────────────────────────────────────
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	function studentName(r: BorrowRequestRecord): string {
		return r.student?.fullName ?? `Student ${r.studentId.slice(-6).toUpperCase()}`;
	}

	function studentInitials(r: BorrowRequestRecord): string {
		return getInitials(studentName(r));
	}

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function daysOverdue(r: BorrowRequestRecord): number {
		return Math.ceil((Date.now() - new Date(r.returnDate).getTime()) / 86_400_000);
	}

	function daysUntilDue(r: BorrowRequestRecord): number {
		return Math.ceil((new Date(r.returnDate).getTime() - Date.now()) / 86_400_000);
	}

	// ── lifecycle ─────────────────────────────────────────────────────────────
	async function loadRequests(force = false) {
		try {
			const res = await borrowRequestsAPI.list(
				{ statuses: ['pending_instructor', 'approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return'], limit: 50 },
				{ forceRefresh: force }
			);
			liveRequests = res.requests;
		} catch {
			// non-fatal
		} finally {
			requestsLoading = false;
		}
	}

	async function load(force = false) {
		try {
			report = await fetchAnalytics({ period: 'semester', forceRefresh: force });
		} catch {
			toastStore.error('Failed to load dashboard data.', 'Error');
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}
		await Promise.all([load(), loadRequests()]);
		const id = setInterval(() => { currentTime = new Date(); }, 60_000);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Dashboard - Instructor</title></svelte:head>

<div class="space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{greeting}, {$user?.firstName}</h1>
			<p class="mt-0.5 text-sm text-gray-500">Instructor Portal — Equipment & Request Overview</p>
		</div>
		<a
			href="/instructor/requests"
			class="hidden shrink-0 items-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-pink-700 transition-colors sm:flex"
		>
			<ClipboardList size={15} /> Review Requests
		</a>
	</div>

	{#if loading || requestsLoading}
		<!-- ── Skeleton ──────────────────────────────────────────────────── -->
		<div class="space-y-6" aria-busy="true">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#each Array(4) as _}
					<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-3">
						<Skeleton class="h-3 w-24" /><Skeleton class="h-8 w-14" /><Skeleton class="h-3 w-20" />
					</div>
				{/each}
			</div>
			<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-4">
				<Skeleton class="h-5 w-40" />
				{#each Array(3) as _}
					<div class="flex items-center gap-3">
						<Skeleton variant="circle" class="h-9 w-9" />
						<div class="flex-1 space-y-1.5"><Skeleton class="h-4 w-48" /><Skeleton class="h-3 w-32" /></div>
					</div>
				{/each}
			</div>
		</div>
	{:else}

		<!-- ── KPI Strip ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">

			<div class="rounded-xl border {pendingApprovalCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {pendingApprovalCount > 0 ? 'text-amber-700' : 'text-gray-600'}">
					<Clock size={12} /> Pending Approval
				</div>
				<p class="mt-2 text-3xl font-bold {pendingApprovalCount > 0 ? 'text-amber-700' : 'text-gray-700'}">{pendingApprovalCount}</p>
				<p class="mt-0.5 text-xs {pendingApprovalCount > 0 ? 'text-amber-500' : 'text-gray-500'}">Awaiting your review</p>
			</div>

			<div class="rounded-xl border {fulfillmentCount > 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {fulfillmentCount > 0 ? 'text-blue-700' : 'text-gray-600'}">
					<PackageOpen size={12} /> In Fulfillment
				</div>
				<p class="mt-2 text-3xl font-bold {fulfillmentCount > 0 ? 'text-blue-700' : 'text-gray-700'}">{fulfillmentCount}</p>
				<p class="mt-0.5 text-xs {fulfillmentCount > 0 ? 'text-blue-500' : 'text-gray-500'}">Approved / ready for pickup</p>
			</div>

			<div class="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
					<Package size={12} /> Active Loans
				</div>
				<p class="mt-2 text-3xl font-bold text-violet-700">{activeLoans}</p>
				<p class="mt-0.5 text-xs text-violet-500">Currently borrowed</p>
			</div>

			<div class="rounded-xl border {overdueCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {overdueCount > 0 ? 'text-red-700' : 'text-gray-600'}">
					<TriangleAlert size={12} /> Overdue
				</div>
				<p class="mt-2 text-3xl font-bold {overdueCount > 0 ? 'text-red-700' : 'text-gray-700'}">{overdueCount}</p>
				<p class="mt-0.5 text-xs {overdueCount > 0 ? 'text-red-500' : 'text-gray-500'}">Past return date</p>
			</div>
		</div>

		<!-- ── Requests Needing Action ────────────────────────────────────── -->
		<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div class="flex items-center gap-2">
					<ClipboardList size={16} class="text-pink-500" />
					<h2 class="text-sm font-semibold text-gray-900">Requests Needing Action</h2>
					{#if pendingApprovalCount + fulfillmentCount + activeLoans > 0}
						<span class="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700">{pendingApprovalCount + fulfillmentCount + activeLoans}</span>
					{/if}
				</div>
				<a href="/instructor/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					View all <ArrowRight size={13} />
				</a>
			</div>

			<div class="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">

				<!-- Pending Approval -->
				<div class="p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
							<Clock size={11} /> Pending Approval
						</span>
						<span class="text-xs font-bold text-amber-700">{requestsPending.length}</span>
					</div>
					{#if requestsPending.length === 0}
						<div class="space-y-2">
							{#each Array(2) as _}
								<div class="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5">
									<div class="h-8 w-8 shrink-0 rounded-full bg-gray-100"></div>
									<div class="flex-1 space-y-1.5">
										<div class="h-2.5 w-28 rounded-full bg-gray-100"></div>
										<div class="h-2 w-20 rounded-full bg-gray-100"></div>
									</div>
								</div>
							{/each}
							<p class="pt-1 text-center text-xs text-gray-400">No pending requests</p>
						</div>
					{:else}
						<ul class="space-y-2">
							{#each requestsPending.slice(0, 5) as req}
								<li class="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 hover:bg-amber-50 transition-colors">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-200 text-xs font-semibold text-amber-800">
										{#if req.student?.profilePhotoUrl}
											<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
										{:else}
											{studentInitials(req)}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
										<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · Due {formatDate(req.returnDate)}</p>
									</div>
									<a href="/instructor/requests" class="shrink-0 rounded-md bg-pink-600 px-2 py-1 text-xs font-semibold text-white hover:bg-pink-700 transition-colors">
										Review
									</a>
								</li>
							{/each}
							{#if requestsPending.length > 5}
								<p class="pt-1 text-center text-xs text-gray-400">+{requestsPending.length - 5} more</p>
							{/if}
						</ul>
					{/if}
				</div>

				<!-- In Fulfillment -->
				<div class="p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
							<PackageOpen size={11} /> In Fulfillment
						</span>
						<span class="text-xs font-bold text-blue-700">{requestsFulfillment.length}</span>
					</div>
					{#if requestsFulfillment.length === 0}
						<div class="space-y-2">
							{#each Array(2) as _}
								<div class="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5">
									<div class="h-8 w-8 shrink-0 rounded-full bg-gray-100"></div>
									<div class="flex-1 space-y-1.5">
										<div class="h-2.5 w-28 rounded-full bg-gray-100"></div>
										<div class="h-2 w-20 rounded-full bg-gray-100"></div>
									</div>
								</div>
							{/each}
							<p class="pt-1 text-center text-xs text-gray-400">All clear</p>
						</div>
					{:else}
						<ul class="space-y-2">
							{#each requestsFulfillment.slice(0, 5) as req}
								<li class="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 hover:bg-blue-50 transition-colors">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-200 text-xs font-semibold text-blue-800">
										{#if req.student?.profilePhotoUrl}
											<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
										{:else}
											{studentInitials(req)}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
										<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {req.status === 'ready_for_pickup' ? 'Ready for pickup' : 'Approved'}</p>
									</div>
									<a href="/instructor/requests" class="shrink-0">
										<ChevronRight size={14} class="text-gray-400" />
									</a>
								</li>
							{/each}
							{#if requestsFulfillment.length > 5}
								<p class="pt-1 text-center text-xs text-gray-400">+{requestsFulfillment.length - 5} more</p>
							{/if}
						</ul>
					{/if}
				</div>

				<!-- Active Loans (overdue highlighted) -->
				<div class="p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
							<Package size={11} /> Active Loans
						</span>
						<span class="text-xs font-bold text-violet-700">{requestsActive.length}</span>
					</div>
					{#if requestsActive.length === 0}
						<div class="space-y-2">
							{#each Array(2) as _}
								<div class="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5">
									<div class="h-8 w-8 shrink-0 rounded-full bg-gray-100"></div>
									<div class="flex-1 space-y-1.5">
										<div class="h-2.5 w-28 rounded-full bg-gray-100"></div>
										<div class="h-2 w-20 rounded-full bg-gray-100"></div>
									</div>
								</div>
							{/each}
							<p class="pt-1 text-center text-xs text-gray-400">No active loans</p>
						</div>
					{:else}
						<ul class="space-y-2">
							{#each requestsActive.slice(0, 5) as req}
								{@const overdue = new Date(req.returnDate) < new Date()}
								{@const days = overdue ? daysOverdue(req) : daysUntilDue(req)}
								<li class="flex items-center gap-3 rounded-lg border {overdue ? 'border-red-200 bg-red-50/50' : 'border-violet-100 bg-violet-50/50'} px-3 py-2.5 transition-colors">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full {overdue ? 'bg-red-200 text-red-800' : 'bg-violet-200 text-violet-800'} text-xs font-semibold">
										{#if req.student?.profilePhotoUrl}
											<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
										{:else}
											{studentInitials(req)}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
										<p class="text-xs {overdue ? 'text-red-500 font-medium' : 'text-gray-400'}">
											{overdue ? `${days}d overdue` : `Due in ${days}d`}
										</p>
									</div>
									{#if overdue}
										<span class="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">!</span>
									{/if}
								</li>
							{/each}
							{#if requestsActive.length > 5}
								<p class="pt-1 text-center text-xs text-gray-400">+{requestsActive.length - 5} more</p>
							{/if}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- ── Turnaround times ────────────────────────────────────────────── -->
		{#if turnaround}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{#each [
					{ label: 'Avg Approval Time',  value: turnaround.avgApprovalHours, color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-100'   },
					{ label: 'Avg Release Time',   value: turnaround.avgReleaseHours,  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100'   },
					{ label: 'Avg Return Time',    value: turnaround.avgReturnHours,   color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' }
				] as t}
					<div class="flex items-center gap-4 rounded-xl border {t.border} {t.bg} px-5 py-4 shadow-sm">
						<Activity size={20} class="{t.color} shrink-0" />
						<div>
							<p class="text-xs font-medium text-gray-500">{t.label}</p>
							<p class="text-xl font-bold {t.color}">{t.value > 0 ? `${t.value}h` : '—'}</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- ── 2-col: Most Borrowed + Stock Alerts ─────────────────────────── -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

			<!-- Most Borrowed Items -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<TrendingUp size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">Most Borrowed This Semester</h2>
					</div>
					<a href="/instructor/catalog" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Catalog <ArrowRight size={13} />
					</a>
				</div>
				{#if mostBorrowedItems.length === 0}
					<div class="flex h-48 items-center justify-center">
						<p class="text-sm text-gray-400">No borrow data for this period.</p>
					</div>
				{:else}
					<div class="divide-y divide-gray-50 px-5 py-2">
						{#each mostBorrowedItems.slice(0, 5) as item, idx}
							<div class="flex items-center gap-3 py-3">
								<span class="w-5 shrink-0 text-right text-xs font-bold text-gray-300">#{idx + 1}</span>
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between mb-1">
										<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
										<span class="ml-2 shrink-0 text-xs text-gray-500">{item.totalBorrows}</span>
									</div>
									<div class="h-1.5 w-full rounded-full bg-gray-100">
										<div class="h-1.5 rounded-full bg-pink-400 transition-all" style="width:{Math.round((item.totalBorrows / maxBorrows) * 100)}%"></div>
									</div>
									<p class="mt-0.5 text-xs text-gray-400">{item.category}</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Stock Alerts -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<AlertCircle size={16} class="text-orange-500" />
						<h2 class="text-sm font-semibold text-gray-900">Equipment Availability Alerts</h2>
						{#if stockAlerts.length > 0}
							<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{stockAlerts.length}</span>
						{/if}
					</div>
					<a href="/instructor/catalog" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						View catalog <ArrowRight size={13} />
					</a>
				</div>
				{#if stockAlerts.length === 0}
					<div class="flex h-48 items-center justify-center gap-2 text-sm text-gray-400">
						<CheckCircle2 size={16} class="text-emerald-400" /> All equipment is well-stocked
					</div>
				{:else}
					<div class="divide-y divide-gray-50">
						{#each stockAlerts.slice(0, 6) as alert}
							{@const isOut = alert.status === 'Out of Stock' || alert.quantity === 0}
							<div class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
								<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {isOut ? 'bg-red-100' : 'bg-orange-100'}">
									<Package size={14} class="{isOut ? 'text-red-600' : 'text-orange-600'}" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-xs font-semibold text-gray-900">{alert.name}</p>
									<p class="text-xs text-gray-400">{alert.category}</p>
								</div>
								<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold {isOut ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}">
									{isOut ? 'Out of Stock' : `${alert.quantity} left`}
								</span>
							</div>
						{/each}
						{#if stockAlerts.length > 6}
							<div class="px-5 py-3 text-center text-xs text-gray-400">+{stockAlerts.length - 6} more alerts</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

	{/if}
</div>
