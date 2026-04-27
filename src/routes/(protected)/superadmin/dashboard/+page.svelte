<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { fetchAnalytics, peekCachedAnalytics, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { classCodesAPI, type ClassCodeStats } from '$lib/api/classCodes';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { inventoryItemsAPI, type InventoryItem } from '$lib/api/inventory';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import DashboardSkeletonLoader from '$lib/components/ui/DashboardSkeletonLoader.svelte';
	import {
		Users, GraduationCap, ClipboardList, Package,
		TrendingUp, TrendingDown, Activity, AlertTriangle,
		CheckCircle2, Clock, ArrowRight, BarChart3,
		ShieldAlert, PackageOpen, Database, Eye, Wifi, WifiOff
	} from 'lucide-svelte';

	// ── State ─────────────────────────────────────────────────────────────────
	const initialReport = browser ? peekCachedAnalytics({ period: 'month' }) : null;
	let loading = $state(!initialReport);
	let sseConnected = $state(false);
	let report = $state<AnalyticsReport | null>(initialReport);
	let currentTime = $state(new Date());

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let _unsubscribeUsers: (() => void) | null = null;
	let _unsubscribeClass: (() => void) | null = null;
	let _unsubscribeBorrow: (() => void) | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadDashboardData(false, forceRefresh);
		}, 250);
	}

	// Dashboard data
	let totalUsers = $state(0);
	let usersByRole = $state<Record<string, number>>({});
	let recentUsers = $state<UserResponse[]>([]);
	
	let classStats = $state<ClassCodeStats | null>(null);
	let activeClasses = $state(0);
	
	let totalRequests = $state(0);
	let pendingRequests = $state(0);
	let activeLoans = $state(0);
	let overdueRequests = $state(0);
	let recentRequests = $state<BorrowRequestRecord[]>([]);
	
	let totalInventory = $state(0);
	let lowStockItems = $state(0);
	let outOfStockItems = $state(0);
	let totalCategories = $state(0);

	// ── Greeting ──────────────────────────────────────────────────────────────
	const greeting = $derived.by(() => {
		const h = currentTime.getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	}

	function formatDate(d: string | Date): string {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatTime(d: string | Date): string {
		return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function getRoleBadgeColor(role: string): string {
		switch (role) {
			case 'superadmin': return 'bg-purple-100 text-purple-700 border-purple-200';
			case 'custodian': return 'bg-blue-100 text-blue-700 border-blue-200';
			case 'instructor': return 'bg-pink-100 text-pink-700 border-pink-200';
			case 'student': return 'bg-gray-100 text-gray-700 border-gray-200';
			default: return 'bg-gray-100 text-gray-600 border-gray-200';
		}
	}

	function getStatusBadgeColor(status: string): string {
		switch (status) {
			case 'pending_instructor': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
			case 'approved_instructor': return 'bg-blue-100 text-blue-700 border-blue-200';
			case 'ready_for_pickup': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
			case 'borrowed': return 'bg-violet-100 text-violet-700 border-violet-200';
			case 'pending_return': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
			case 'returned': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
			case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
			default: return 'bg-gray-100 text-gray-600 border-gray-200';
		}
	}

	function formatStatus(status: string): string {
		return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
	}

	// ── Data Loading ──────────────────────────────────────────────────────────
	async function loadDashboardData(showLoader = true, forceRefresh = true) {
		if (showLoader) loading = true;
		try {
			// Load analytics report
			const analyticsPromise = fetchAnalytics({ period: 'month', forceRefresh });

			// Load users data
			const usersPromise = usersAPI.getAll({ limit: 5, forceRefresh });

			// Load class codes stats
			const classStatsPromise = classCodesAPI.getStats(forceRefresh);

			// Load requests data
			const requestsPromise = borrowRequestsAPI.list(
				{ limit: 10, sortBy: 'createdAt' },
				{ forceRefresh }
			);

			// Load inventory data
			const inventoryPromise = inventoryItemsAPI.getAll({ forceRefresh });

			// Execute all promises
			const [analyticsRes, usersRes, classStatsRes, requestsRes, inventoryRes] = await Promise.all([
				analyticsPromise,
				usersPromise,
				classStatsPromise,
				requestsPromise,
				inventoryPromise
			]);

			// Set analytics
			report = analyticsRes;

			// Set users data
			totalUsers = usersRes.pagination.total;
			recentUsers = usersRes.users;
			
			// Calculate users by role
			const roleCount: Record<string, number> = {};
			usersRes.users.forEach((u: UserResponse) => {
				roleCount[u.role] = (roleCount[u.role] || 0) + 1;
			});
			usersByRole = roleCount;

			// Set class stats
			classStats = classStatsRes;
			activeClasses = classStatsRes.activeClasses;

			// Set requests data
			totalRequests = requestsRes.total;
			recentRequests = requestsRes.requests;
			pendingRequests = requestsRes.requests.filter((r: BorrowRequestRecord) => r.status === 'pending_instructor').length;
			activeLoans = requestsRes.requests.filter((r: BorrowRequestRecord) => r.status === 'borrowed' || r.status === 'pending_return').length;
			overdueRequests = requestsRes.requests.filter((r: BorrowRequestRecord) => 
				(r.status === 'borrowed' || r.status === 'pending_return') && 
				new Date(r.returnDate) < new Date()
			).length;

			// Set inventory data - use total from API response, not items.length
			totalInventory = inventoryRes.total;
			totalCategories = new Set(inventoryRes.items.map((i: InventoryItem) => i.categoryId)).size;
			lowStockItems = inventoryRes.items.filter((i: InventoryItem) => i.quantity > 0 && i.quantity <= 5).length;
			outOfStockItems = inventoryRes.items.filter((i: InventoryItem) => i.quantity === 0).length;

		} catch (error: any) {
			toastStore.error(error.message || 'Failed to load dashboard data', 'Error');
		} finally {
			loading = false;
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			authStore.clearJustLoggedIn();
		}

		void loadDashboardData(loading, false);

		_unsubscribeUsers = usersAPI.subscribeToChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});
		_unsubscribeClass = classCodesAPI.subscribeToChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});
		_unsubscribeBorrow = borrowRequestsAPI.subscribeToChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});

		setTimeout(() => {
			sseConnected = true;
		}, 1500);

		const clockId = setInterval(() => {
			currentTime = new Date();
		}, 60_000);

		_pollInterval = setInterval(() => {
			void loadDashboardData(false, true);
		}, 30_000);

		const onFocus = () => { void loadDashboardData(false, true); };
		const onVisible = () => { if (document.visibilityState === 'visible') void loadDashboardData(false, true); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			clearInterval(clockId);
			_unsubscribeUsers?.();
			_unsubscribeClass?.();
			_unsubscribeBorrow?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<svelte:head><title>Dashboard - Superadmin</title></svelte:head>

<div class="space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">{greeting}, {$user?.firstName}</h1>
			<p class="mt-0.5 text-sm text-gray-500">Superadmin Control Center — System-Wide Overview</p>
		</div>
		<div class="hidden shrink-0 items-center gap-2 sm:flex">
			<div class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {sseConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}">
				{#if sseConnected}<Wifi size={13} class="text-emerald-500" />Live{:else}<WifiOff size={13} />Connecting...{/if}
			</div>
			<a
				href="/superadmin/analytics"
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
			>
				<BarChart3 size={15} /> Analytics
			</a>
		</div>
	</div>

	{#if loading}
		<!-- ── Skeleton ──────────────────────────────────────────────────── -->
		<DashboardSkeletonLoader />
	{:else}

		<!-- ── KPI Strip ───────────────────────────────────────────────────── -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">

			<div class="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-sm hover:shadow-md transition-shadow">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-800">
					<Users size={12} /> Total Users
				</div>
				<p class="mt-2 text-3xl font-bold text-purple-700">{totalUsers.toLocaleString()}</p>
				<a href="/superadmin/users" class="mt-1 flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
					Manage users <ArrowRight size={11} />
				</a>
			</div>

			<div class="rounded-xl border border-pink-200 bg-pink-50 p-4 shadow-sm hover:shadow-md transition-shadow">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-pink-800">
					<GraduationCap size={12} /> Active Classes
				</div>
				<p class="mt-2 text-3xl font-bold text-pink-700">{activeClasses}</p>
				<a href="/superadmin/class-codes" class="mt-1 flex items-center gap-1 text-xs text-pink-600 hover:text-pink-700 font-medium">
					View classes <ArrowRight size={11} />
				</a>
			</div>

			<div class="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm hover:shadow-md transition-shadow">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-800">
					<ClipboardList size={12} /> Total Requests
				</div>
				<p class="mt-2 text-3xl font-bold text-blue-700">{totalRequests.toLocaleString()}</p>
				<a href="/superadmin/requests" class="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
					View requests <ArrowRight size={11} />
				</a>
			</div>

			<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm hover:shadow-md transition-shadow">
				<div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
					<Package size={12} /> Inventory Items
				</div>
				<p class="mt-2 text-3xl font-bold text-emerald-700">{totalInventory.toLocaleString()}</p>
				<a href="/superadmin/inventory" class="mt-1 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
					View inventory <ArrowRight size={11} />
				</a>
			</div>
		</div>

		<!-- ── System Health & Alerts ────────────────────────────────────────── -->
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			
			<div class="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
				<div class="flex items-center justify-between mb-2">
					<Clock size={16} class="text-yellow-600" />
					<span class="text-xs font-semibold text-yellow-600">PENDING</span>
				</div>
				<p class="text-2xl font-bold text-yellow-700">{pendingRequests}</p>
				<p class="text-xs text-yellow-600 mt-1">Awaiting instructor approval</p>
			</div>

			<div class="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
				<div class="flex items-center justify-between mb-2">
					<PackageOpen size={16} class="text-violet-600" />
					<span class="text-xs font-semibold text-violet-600">ACTIVE</span>
				</div>
				<p class="text-2xl font-bold text-violet-700">{activeLoans}</p>
				<p class="text-xs text-violet-600 mt-1">Currently borrowed items</p>
			</div>

			<div class="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
				<div class="flex items-center justify-between mb-2">
					<AlertTriangle size={16} class="text-red-600" />
					<span class="text-xs font-semibold text-red-600">OVERDUE</span>
				</div>
				<p class="text-2xl font-bold text-red-700">{overdueRequests}</p>
				<p class="text-xs text-red-600 mt-1">Past return date</p>
			</div>

			<div class="rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
				<div class="flex items-center justify-between mb-2">
					<ShieldAlert size={16} class="text-orange-600" />
					<span class="text-xs font-semibold text-orange-600">LOW STOCK</span>
				</div>
				<p class="text-2xl font-bold text-orange-700">{lowStockItems + outOfStockItems}</p>
				<p class="text-xs text-orange-600 mt-1">{outOfStockItems} out of stock</p>
			</div>
		</div>

		<!-- ── Main Content Grid ──────────────────────────────────────────────── -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

			<!-- Recent Users -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<Users size={16} class="text-purple-500" />
						<h2 class="text-sm font-semibold text-gray-900">Recent Users</h2>
					</div>
					<a href="/superadmin/users" class="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700">
						View all <ArrowRight size={13} />
					</a>
				</div>
				{#if recentUsers.length === 0}
					<div class="flex h-64 items-center justify-center">
						<div class="text-center">
							<Users size={28} class="mx-auto text-purple-600" />
							<p class="mt-3 text-sm text-gray-500">No users found</p>
						</div>
					</div>
				{:else}
					<div class="divide-y divide-gray-50">
						{#each recentUsers as user}
							<div class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-purple-500 to-pink-500 text-sm font-semibold text-white">
									{#if user.profilePhotoUrl}
										<img src={user.profilePhotoUrl} alt="{user.firstName} {user.lastName}" class="h-full w-full object-cover" />
									{:else}
										{getInitials(`${user.firstName} ${user.lastName}`)}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
									<p class="truncate text-xs text-gray-500">{user.email}</p>
								</div>
								<span class="shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold {getRoleBadgeColor(user.role)}">
									{user.role}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Recent Requests -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<ClipboardList size={16} class="text-blue-500" />
						<h2 class="text-sm font-semibold text-gray-900">Recent Requests</h2>
					</div>
					<a href="/superadmin/requests" class="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
						View all <ArrowRight size={13} />
					</a>
				</div>
				{#if recentRequests.length === 0}
					<div class="flex h-64 items-center justify-center">
						<div class="text-center">
							<ClipboardList size={28} class="mx-auto text-blue-600" />
							<p class="mt-3 text-sm text-gray-500">No requests found</p>
						</div>
					</div>
				{:else}
					<div class="divide-y divide-gray-50">
						{#each recentRequests.slice(0, 5) as request}
							<div class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-blue-500 to-cyan-500 text-sm font-semibold text-white">
									{#if request.student?.profilePhotoUrl}
										<img src={request.student.profilePhotoUrl} alt={request.student.fullName} class="h-full w-full object-cover" />
									{:else}
										{getInitials(request.student?.fullName || 'Student')}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-gray-900">{request.student?.fullName || 'Unknown Student'}</p>
									<p class="text-xs text-gray-500">{request.items.length} item{request.items.length !== 1 ? 's' : ''} · {formatDate(request.createdAt)}</p>
								</div>
								<span class="shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold {getStatusBadgeColor(request.status)}">
									{formatStatus(request.status)}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Class Statistics -->
			{#if classStats}
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
					<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
						<div class="flex items-center gap-2">
							<GraduationCap size={16} class="text-pink-500" />
							<h2 class="text-sm font-semibold text-gray-900">Class Overview</h2>
						</div>
						<a href="/superadmin/class-codes" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
							Manage <ArrowRight size={13} />
						</a>
					</div>
					<div class="p-5">
						<div class="grid grid-cols-2 gap-4">
							<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
								<p class="text-2xl font-bold text-gray-900">{classStats.activeClasses}</p>
								<p class="text-xs text-gray-500 mt-1">Active Classes</p>
							</div>
							<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
								<p class="text-2xl font-bold text-pink-600">{classStats.totalStudents}</p>
								<p class="text-xs text-gray-500 mt-1">Total Students</p>
							</div>
							<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
								<p class="text-2xl font-bold text-blue-600">{classStats.avgClassSize.toFixed(1)}</p>
								<p class="text-xs text-gray-500 mt-1">Avg Class Size</p>
							</div>
							<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
								<p class="text-2xl font-bold text-purple-600">{classStats.totalInstructors}</p>
								<p class="text-xs text-gray-500 mt-1">Instructors</p>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Inventory Health -->
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
				<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
					<div class="flex items-center gap-2">
						<Package size={16} class="text-emerald-500" />
						<h2 class="text-sm font-semibold text-gray-900">Inventory Health</h2>
					</div>
					<a href="/superadmin/inventory" class="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700">
						View all <ArrowRight size={13} />
					</a>
				</div>
				<div class="p-5">
					<div class="grid grid-cols-2 gap-4">
						<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
							<p class="text-2xl font-bold text-gray-900">{totalInventory}</p>
							<p class="text-xs text-gray-500 mt-1">Total Items</p>
						</div>
						<div class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
							<p class="text-2xl font-bold text-emerald-600">{totalCategories}</p>
							<p class="text-xs text-gray-500 mt-1">Categories</p>
						</div>
						<div class="rounded-lg border border-orange-100 bg-orange-50 p-4 text-center">
							<p class="text-2xl font-bold text-orange-600">{lowStockItems}</p>
							<p class="text-xs text-orange-600 mt-1">Low Stock</p>
						</div>
						<div class="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
							<p class="text-2xl font-bold text-red-600">{outOfStockItems}</p>
							<p class="text-xs text-red-600 mt-1">Out of Stock</p>
						</div>
					</div>
				</div>
			</div>

		</div>

		<!-- ── Analytics Summary (if available) ───────────────────────────────── -->
		{#if report}
			<div class="overflow-hidden rounded-xl bg-linear-to-br from-pink-50 to-purple-50 shadow-sm ring-1 ring-pink-100">
				<div class="flex items-center justify-between border-b border-pink-100 bg-white/50 px-5 py-4">
					<div class="flex items-center gap-2">
						<Activity size={16} class="text-pink-500" />
						<h2 class="text-sm font-semibold text-gray-900">System Performance (Last 30 Days)</h2>
					</div>
					<a href="/superadmin/analytics" class="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700">
						Full analytics <ArrowRight size={13} />
					</a>
				</div>
				<div class="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
					<div class="rounded-lg border border-white bg-white/70 p-4 text-center backdrop-blur-sm">
						<div class="flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							<TrendingUp size={12} /> Approval Time
						</div>
						<p class="text-2xl font-bold text-pink-600">{report.borrowRequests.turnaround.avgApprovalHours.toFixed(1)}h</p>
					</div>
					<div class="rounded-lg border border-white bg-white/70 p-4 text-center backdrop-blur-sm">
						<div class="flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							<Clock size={12} /> Release Time
						</div>
						<p class="text-2xl font-bold text-blue-600">{report.borrowRequests.turnaround.avgReleaseHours.toFixed(1)}h</p>
					</div>
					<div class="rounded-lg border border-white bg-white/70 p-4 text-center backdrop-blur-sm">
						<div class="flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							<CheckCircle2 size={12} /> Return Time
						</div>
						<p class="text-2xl font-bold text-purple-600">{report.borrowRequests.turnaround.avgReturnHours.toFixed(1)}h</p>
					</div>
					<div class="rounded-lg border border-white bg-white/70 p-4 text-center backdrop-blur-sm">
						<div class="flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							<AlertTriangle size={12} /> Risk Level
						</div>
						<p class="text-2xl font-bold {report.borrowRequests.overdueCount > 0 ? 'text-red-600' : 'text-emerald-600'}">
							{report.borrowRequests.overdueCount > 0 ? 'Medium' : 'Low'}
						</p>
					</div>
				</div>
			</div>
		{/if}

	{/if}
</div>
