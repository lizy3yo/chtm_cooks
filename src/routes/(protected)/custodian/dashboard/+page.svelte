<script lang="ts">
	import { onMount } from 'svelte';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { fetchAnalytics, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { confirmStore } from '$lib/stores/confirm';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		Package, ClipboardList, TriangleAlert, Clock,
		CheckCircle2, ArrowRight, TrendingUp, Users,
		ShieldAlert, PackageOpen,
		AlertCircle, Activity
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
	const activeLoans = $derived(
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'borrowed')?.count ?? 0) +
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'pending_return')?.count ?? 0)
	);
	const overdueCount  = $derived(report?.borrowRequests.overdueCount ?? 0);
	const pendingCount  = $derived(
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'pending_instructor')?.count ?? 0) +
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'approved_instructor')?.count ?? 0) +
		(report?.borrowRequests.statusBreakdown.find(s => s.status === 'ready_for_pickup')?.count ?? 0)
	);
	const stockAlertCount   = $derived(report?.inventory.stockAlerts.length ?? 0);
	const pendingObligations = $derived(report?.replacement.summary.pendingCount ?? 0);
	const totalItemsOut     = $derived(report?.inventory.itemsCurrentlyOut.reduce((s, i) => s + i.quantityOut, 0) ?? 0);

	// live request groups
	const requestsPendingApproval = $derived(
		liveRequests.filter(r => r.status === 'approved_instructor')
	);
	const requestsReadyPickup = $derived(
		liveRequests.filter(r => r.status === 'ready_for_pickup')
	);
	const requestsActive = $derived(
		liveRequests.filter(r => r.status === 'borrowed' || r.status === 'pending_return')
	);
	const requestsOverdue = $derived(
		requestsActive.filter(r => new Date(r.returnDate) < new Date())
	);

	const inventoryVarianceItems = $derived(
		[...(report?.inventory.eomVariance ?? [])]
			.sort((a, b) => a.variance - b.variance)
			.slice(0, 5)
	);
	const negativeVarianceCount = $derived(
		report?.inventory.eomVariance.filter((item) => item.variance < 0).length ?? 0
	);
	const maxVarianceMagnitude = $derived(
		Math.max(1, ...(report?.inventory.eomVariance.map((item) => Math.abs(item.variance)) ?? [1]))
	);

	// bar chart max for most borrowed
	const maxBorrows = $derived(
		Math.max(...(report?.inventory.mostBorrowedItems.map(i => i.totalBorrows) ?? [1]), 1)
	);

	// ── helpers ───────────────────────────────────────────────────────────────
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	// ── lifecycle ─────────────────────────────────────────────────────────────
	async function loadRequests(force = false) {
		try {
			const res = await borrowRequestsAPI.list(
				{ statuses: ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return'], limit: 50 },
				{ forceRefresh: force }
			);
			liveRequests = res.requests;
		} catch {
			// non-fatal — dashboard still works without live requests
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

	function studentName(r: BorrowRequestRecord): string {
		return r.student?.fullName ?? `Student ${r.studentId.slice(-6).toUpperCase()}`;
	}

	function studentInitials(r: BorrowRequestRecord): string {
		return getInitials(studentName(r));
	}

	function daysOverdue(r: BorrowRequestRecord): number {
		return Math.ceil((Date.now() - new Date(r.returnDate).getTime()) / 86_400_000);
	}

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	async function confirmPickup(rawId: string): Promise<void> {
		const ok = await confirmStore.confirm({
			title: 'Confirm Pickup',
			message: 'Confirm that the student has successfully picked up all released items?',
			type: 'warning',
			confirmText: 'Confirm Pickup',
			cancelText: 'Cancel'
		});
		if (!ok) return;
		try {
			await borrowRequestsAPI.pickup(rawId);
			await loadRequests(true);
			toastStore.success('Pickup confirmed successfully.');
		} catch {
			toastStore.error('Failed to confirm pickup.');
		}
	}

	onMount(() => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}
		void Promise.all([load(true), loadRequests(true)]);
		const id = setInterval(() => { currentTime = new Date(); }, 60_000);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Dashboard - Custodian</title></svelte:head>

<div class="space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{greeting}, {$user?.firstName}</h1>
			<p class="mt-0.5 text-sm text-gray-500">Kitchen Laboratory — Operational Overview</p>
		</div>
	</div>

	{#if loading}
		<div class="space-y-6" aria-busy="true">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{#each Array(5) as _}
					<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-3">
						<Skeleton class="h-3 w-24" /><Skeleton class="h-8 w-14" /><Skeleton class="h-3 w-20" />
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div class="lg:col-span-2 rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-4">
					<Skeleton class="h-5 w-40" />
					{#each Array(4) as _}
						<div class="flex items-center gap-3">
							<Skeleton variant="circle" class="h-9 w-9" />
							<div class="flex-1 space-y-1.5"><Skeleton class="h-4 w-48" /><Skeleton class="h-3 w-32" /></div>
						</div>
					{/each}
				</div>
				<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-3">
					<Skeleton class="h-5 w-32" />
					{#each Array(5) as _}<Skeleton class="h-8 w-full rounded-lg" />{/each}
				</div>
			</div>
		</div>
	{:else}

		<!-- ── KPI strip ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">

			<div class="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
					<PackageOpen size={12} /> Active Loans
				</div>
				<p class="mt-2 text-3xl font-bold text-violet-700">{activeLoans}</p>
				<p class="mt-0.5 text-xs text-violet-500">{totalItemsOut} items currently out</p>
			</div>

			<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
					<Clock size={12} /> Pending
				</div>
				<p class="mt-2 text-3xl font-bold text-amber-700">{pendingCount}</p>
				<p class="mt-0.5 text-xs text-amber-500">Awaiting action</p>
			</div>

			<div class="rounded-xl border {overdueCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {overdueCount > 0 ? 'text-red-700' : 'text-gray-600'}">
					<TriangleAlert size={12} /> Overdue
				</div>
				<p class="mt-2 text-3xl font-bold {overdueCount > 0 ? 'text-red-700' : 'text-gray-700'}">{overdueCount}</p>
				<p class="mt-0.5 text-xs {overdueCount > 0 ? 'text-red-500' : 'text-gray-500'}">Past return date</p>
			</div>

			<div class="rounded-xl border {stockAlertCount > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {stockAlertCount > 0 ? 'text-orange-700' : 'text-gray-600'}">
					<ShieldAlert size={12} /> Stock Alerts
				</div>
				<p class="mt-2 text-3xl font-bold {stockAlertCount > 0 ? 'text-orange-700' : 'text-gray-700'}">{stockAlertCount}</p>
				<p class="mt-0.5 text-xs {stockAlertCount > 0 ? 'text-orange-500' : 'text-gray-500'}">Low / out of stock</p>
			</div>

			<div class="col-span-2 rounded-xl border sm:col-span-1 {pendingObligations > 0 ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-gray-50'} p-4 shadow-sm">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {pendingObligations > 0 ? 'text-rose-700' : 'text-gray-600'}">
					<AlertCircle size={12} /> Replacements
				</div>
				<p class="mt-2 text-3xl font-bold {pendingObligations > 0 ? 'text-rose-700' : 'text-gray-700'}">{pendingObligations}</p>
				<p class="mt-0.5 text-xs {pendingObligations > 0 ? 'text-rose-500' : 'text-gray-500'}">Pending cases</p>
			</div>
		</div>

		<!-- ── Requests Needing Action ────────────────────────────────────── -->
		<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div class="flex items-center gap-2">
					<ClipboardList size={16} class="text-pink-500" />
					<h2 class="text-sm font-semibold text-gray-900">Requests Needing Action</h2>
					{#if !requestsLoading}
						{@const total = requestsPendingApproval.length + requestsReadyPickup.length + requestsActive.length}
						{#if total > 0}
							<span class="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700">{total}</span>
						{/if}
					{/if}
				</div>
				<a href="/custodian/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
					View all <ArrowRight size={13} />
				</a>
			</div>

			{#if requestsLoading}
				<div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
					{#each Array(3) as _}
						<div class="space-y-3 rounded-xl border border-gray-100 p-4">
							<Skeleton class="h-4 w-32" />
							{#each Array(2) as _}
								<div class="flex items-center gap-3">
									<Skeleton variant="circle" class="h-8 w-8" />
									<div class="flex-1 space-y-1.5"><Skeleton class="h-3.5 w-28" /><Skeleton class="h-3 w-20" /></div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			{:else}
				<div class="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">

					<!-- Pending Approval (approved by instructor, waiting custodian release) -->
					<div class="p-4">
						<div class="mb-3 flex items-center justify-between">
							<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
								<Clock size={11} /> Pending — Mark Ready
							</span>
							<span class="text-xs font-bold text-amber-700">{requestsPendingApproval.length}</span>
						</div>
						{#if requestsPendingApproval.length === 0}
							<div class="flex min-h-[116px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<Clock size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No pending requests</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsPendingApproval.slice(0, 5) as req}
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
											<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {formatDate(req.borrowDate)}</p>
										</div>
										<a href="/custodian/requests" class="shrink-0 rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 transition-colors">
											Mark Ready
										</a>
									</li>
								{/each}
								{#if requestsPendingApproval.length > 5}
									<p class="pt-1 text-center text-xs text-gray-400">+{requestsPendingApproval.length - 5} more</p>
								{/if}
							</ul>
						{/if}
					</div>

					<!-- Ready for Pickup (items prepared, waiting for student to collect) -->
					<div class="p-4">
						<div class="mb-3 flex items-center justify-between">
							<span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
								<PackageOpen size={11} /> Ready for Pickup
							</span>
							<span class="text-xs font-bold text-indigo-700">{requestsReadyPickup.length}</span>
						</div>
						{#if requestsReadyPickup.length === 0}
							<div class="flex min-h-[116px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<PackageOpen size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No items ready for pickup</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsReadyPickup.slice(0, 5) as req}
									<li class="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 hover:bg-indigo-50 transition-colors">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-200 text-xs font-semibold text-indigo-800">
											{#if req.student?.profilePhotoUrl}
												<img src={req.student.profilePhotoUrl} alt={studentName(req)} class="h-full w-full object-cover" />
											{:else}
												{studentInitials(req)}
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-gray-900">{studentName(req)}</p>
											<p class="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {formatDate(req.borrowDate)}</p>
										</div>
										<button
											onclick={() => confirmPickup(req.id)}
											class="shrink-0 rounded-md bg-pink-600 px-2 py-1 text-xs font-semibold text-white hover:bg-pink-700 transition-colors">
											Confirm Pickup
										</button>
									</li>
								{/each}
								{#if requestsReadyPickup.length > 5}
									<p class="pt-1 text-center text-xs text-gray-400">+{requestsReadyPickup.length - 5} more</p>
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
							<div class="flex min-h-[116px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center">
								<Package size={18} class="text-pink-600" />
								<p class="mt-2 text-xs font-medium text-gray-500">No active loans</p>
							</div>
						{:else}
							<ul class="space-y-2 overflow-y-auto">
								{#each requestsActive.slice(0, 5) as req}
									{@const overdue = new Date(req.returnDate) < new Date()}
									{@const days = overdue ? daysOverdue(req) : null}
									<li class="flex items-center gap-3 rounded-lg border {overdue ? 'border-red-200 bg-red-50/50' : 'border-violet-100 bg-violet-50/50'} px-3 py-2.5 hover:{overdue ? 'bg-red-50' : 'bg-violet-50'} transition-colors">
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
												{overdue ? `${days}d overdue` : `Due ${formatDate(req.returnDate)}`}
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
			{/if}
		</div>

		<!-- ── Turnaround times ────────────────────────────────────────────── -->
		{#if report}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{#each [
					{ label: 'Avg Approval Time',  value: report.borrowRequests.turnaround.avgApprovalHours, color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100'   },
					{ label: 'Avg Release Time',   value: report.borrowRequests.turnaround.avgReleaseHours,  color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
					{ label: 'Avg Return Time',    value: report.borrowRequests.turnaround.avgReturnHours,   color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-100'   }
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

		<!-- ── 3-col: Requests breakdown + Inventory variance + Student risk -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">

			<!-- Borrow request status breakdown -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<ClipboardList size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">Request Breakdown</h2>
					</div>
					<a href="/custodian/requests" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Manage <ArrowRight size={13} />
					</a>
				</div>
				<div>
				{#if report}
					{@const total = report.borrowRequests.statusBreakdown.reduce((s, i) => s + i.count, 0)}
					{@const statusMeta: Record<string, string> = {
						pending_instructor: 'bg-yellow-100 text-yellow-800',
						approved_instructor: 'bg-blue-100 text-blue-800',
						ready_for_pickup: 'bg-indigo-100 text-indigo-800',
						borrowed: 'bg-violet-100 text-violet-800',
						pending_return: 'bg-orange-100 text-orange-800',
						returned: 'bg-emerald-100 text-emerald-800',
						missing: 'bg-red-100 text-red-800',
						resolved: 'bg-teal-100 text-teal-800',
						cancelled: 'bg-gray-100 text-gray-600',
						rejected: 'bg-rose-100 text-rose-800'
					}}
					{@const emptyRows = [
						{ key: 'pending_instructor', label: 'pending instructor' },
						{ key: 'approved_instructor', label: 'approved instructor' },
						{ key: 'ready_for_pickup', label: 'ready for pickup' },
						{ key: 'borrowed', label: 'borrowed' },
						{ key: 'pending_return', label: 'pending return' }
					]}
					{#if total > 0}
						<p class="mb-3 text-3xl font-bold leading-none text-gray-900">{total}</p>
						<div class="space-y-4">
							{#each report.borrowRequests.statusBreakdown.filter(s => s.count > 0) as item}
								<div class="flex items-center justify-between py-0.5">
									<span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium {statusMeta[item.status] ?? 'bg-gray-100 text-gray-600'}">
										{item.status.replace(/_/g, ' ')}
									</span>
									<span class="text-base font-semibold text-gray-700">{item.count}</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="mb-3 text-3xl font-bold leading-none text-gray-900">0</p>
						<div class="space-y-4">
							{#each emptyRows as row}
								<div class="flex items-center justify-between py-0.5">
									<span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium {statusMeta[row.key] ?? 'bg-gray-100 text-gray-600'}">
										{row.label}
									</span>
									<span class="text-base font-semibold text-gray-700">0</span>
								</div>
							{/each}
						</div>
						<p class="mt-3 text-sm text-gray-400">No requests recorded for this period.</p>
					{/if}
				{:else}
					<p class="mb-3 text-3xl font-bold leading-none text-gray-900">0</p>
					<div class="space-y-4">
						{#each ['pending instructor', 'approved instructor', 'ready for pickup', 'borrowed', 'pending return'] as label}
							<div class="flex items-center justify-between py-0.5">
								<span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-600">{label}</span>
								<span class="text-base font-semibold text-gray-700">0</span>
							</div>
						{/each}
					</div>
					<p class="mt-3 text-sm text-gray-400">No request data available.</p>
				{/if}
				</div>
			</div>

			<!-- Inventory variance -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Package size={16} class="text-violet-500" />
						<h2 class="text-sm font-semibold text-gray-900">Inventory Variance</h2>
					</div>
					<a href="/custodian/reports" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Details <ArrowRight size={13} />
					</a>
				</div>
				<div>
				{#if report && inventoryVarianceItems.length > 0}
					<div class="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Items below expected count</p>
						<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">{negativeVarianceCount}</span>
					</div>
					<div class="space-y-3">
						{#each inventoryVarianceItems as item}
							{@const magnitude = Math.abs(item.variance)}
							{@const pct = Math.round((magnitude / maxVarianceMagnitude) * 100)}
							<div class="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
										<p class="text-xs text-gray-400">{item.category}</p>
									</div>
									<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold {item.variance < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
										{item.variance > 0 ? '+' : ''}{item.variance}
									</span>
								</div>
								<div class="h-1.5 w-full rounded-full bg-gray-200">
									<div class="h-1.5 rounded-full {item.variance < 0 ? 'bg-rose-400' : 'bg-emerald-400'}" style="width:{pct}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="mb-3 h-3 w-full overflow-hidden rounded-full bg-gray-100"></div>
					<p class="mt-3 text-sm text-gray-400">No variance data available.</p>
				{/if}
				</div>
			</div>

			<!-- Student risk snapshot -->
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Users size={16} class="text-rose-500" />
						<h2 class="text-sm font-semibold text-gray-900">Student Risk</h2>
					</div>
					<a href="/custodian/reports" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Full report <ArrowRight size={13} />
					</a>
				</div>
				{#if report}
					<div class="space-y-3">
						<!-- Repeat offenders -->
						<div class="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
							<p class="text-xs font-medium text-rose-700">Active Obligations</p>
							<p class="mt-0.5 text-2xl font-bold text-rose-700">{report.studentRisk.repeatOffenders.length}</p>
							{#if report.studentRisk.repeatOffenders.length > 0}
								<p class="mt-1 text-xs text-rose-500 truncate">
									{report.studentRisk.repeatOffenders.slice(0, 2).map(s => s.studentName.split(' ')[0]).join(', ')}
									{report.studentRisk.repeatOffenders.length > 2 ? ` +${report.studentRisk.repeatOffenders.length - 2} more` : ''}
								</p>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div class="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2.5 text-center">
								<p class="text-xs font-medium text-orange-600">Overdue</p>
								<p class="text-xl font-bold text-orange-700">{report.studentRisk.overdueStudents.length}</p>
							</div>
							<div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-center">
								<p class="text-xs font-medium text-red-600">High Incidents</p>
								<p class="text-xl font-bold text-red-700">{report.studentRisk.highIncidentStudents.length}</p>
							</div>
						</div>
						<!-- Replacement cases -->
						<div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
							<p class="text-xs font-medium text-amber-700">Pending Replacements</p>
							<p class="mt-0.5 text-2xl font-bold text-amber-700">{report.replacement.summary.pendingCount}</p>
							<p class="mt-0.5 text-xs text-amber-500">Avg resolution: {report.replacement.avgResolutionDays > 0 ? `${report.replacement.avgResolutionDays}d` : '—'}</p>
						</div>
					</div>
				{:else}
					<p class="text-sm text-gray-400 italic">No data available.</p>
				{/if}
			</div>
		</div>

		<!-- ── Bottom 2-col: Most borrowed + Items currently out ──────────── -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

			<!-- Most borrowed items -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<TrendingUp size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">Most Borrowed This Month</h2>
					</div>
					<a href="/custodian/reports" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Full report <ArrowRight size={13} />
					</a>
				</div>
				{#if !report || report.inventory.mostBorrowedItems.length === 0}
					<div class="flex h-[18rem] items-center justify-center">
						<div class="text-center">
							<TrendingUp size={28} class="mx-auto text-pink-600" />
							<p class="mt-3 text-sm text-gray-500">No borrow data for this period.</p>
						</div>
					</div>
				{:else}
					<div class="h-[18rem] divide-y divide-gray-50 overflow-hidden px-5 py-2">
						{#each report.inventory.mostBorrowedItems.slice(0, 5) as item, idx}
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

			<!-- Items currently out -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<PackageOpen size={16} class="text-violet-500" />
						<h2 class="text-sm font-semibold text-gray-900">Items Currently Out</h2>
					</div>
					<a href="/custodian/inventory" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Inventory <ArrowRight size={13} />
					</a>
				</div>
				{#if !report || report.inventory.itemsCurrentlyOut.length === 0}
					<div class="flex h-[18rem] items-center justify-center">
						<div class="text-center">
							<PackageOpen size={28} class="mx-auto text-pink-600" />
							<p class="mt-3 text-sm text-gray-500">No items currently out.</p>
						</div>
					</div>
				{:else}
					<ul class="h-[18rem] divide-y divide-gray-50 overflow-hidden">
						{#each report.inventory.itemsCurrentlyOut.slice(0, 5) as item}
							{@const total = item.quantityOut + item.totalStock}
							{@const utilPct = total > 0 ? Math.round((item.quantityOut / total) * 100) : 0}
							<li class="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
								<div class="flex-1 min-w-0">
									<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
									<p class="text-xs text-gray-400">{item.category}</p>
								</div>
								<div class="flex shrink-0 items-center gap-3">
									<div class="flex items-center gap-1.5">
										<div class="h-1.5 w-16 rounded-full bg-gray-100">
											<div class="h-1.5 rounded-full bg-violet-400" style="width:{utilPct}%"></div>
										</div>
										<span class="text-xs text-gray-500">{utilPct}%</span>
									</div>
									<span class="text-xs font-semibold text-violet-700">{item.quantityOut} out</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<!-- ── High incident items ─────────────────────────────────────────── -->
		{#if report && report.inventory.damageRateItems.length > 0}
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<AlertCircle size={16} class="text-rose-500" />
						<h2 class="text-sm font-semibold text-gray-900">Items with Highest Incident Rate</h2>
					</div>
					<a href="/custodian/reports" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						View all <ArrowRight size={13} />
					</a>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-100">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
								<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Inspected</th>
								<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Damaged</th>
								<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Missing</th>
								<th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Incident Rate</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-50 bg-white">
							{#each report.inventory.damageRateItems.slice(0, 5) as item}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="px-5 py-3">
										<p class="text-sm font-medium text-gray-900">{item.name}</p>
										<p class="text-xs text-gray-400">{item.category}</p>
									</td>
									<td class="px-5 py-3 text-sm text-gray-600">{item.totalInspected}</td>
									<td class="px-5 py-3 text-sm font-medium text-rose-600">{item.damaged}</td>
									<td class="px-5 py-3 text-sm font-medium text-red-600">{item.missing}</td>
									<td class="px-5 py-3">
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {item.incidentRate >= 50 ? 'bg-red-100 text-red-800' : item.incidentRate >= 25 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}">
											{item.incidentRate}%
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

	{/if}
</div>
