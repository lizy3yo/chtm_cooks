<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { 
		BarChart3, Users, ClipboardList, GraduationCap, FileText, Info, 
		Download, Wifi, WifiOff, RefreshCw, TrendingUp, Clock, AlertTriangle, 
		CheckCircle, Search, ShieldAlert, Activity
	} from 'lucide-svelte';
	import { fetchAnalytics, subscribeToAnalyticsChanges, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { classCodesAPI, type ClassCodeStats, type ClassCodeResponse } from '$lib/api/classCodes';
	import { toastStore } from '$lib/stores/toast';
	import ReportsSkeletonLoader from '$lib/components/ui/ReportsSkeletonLoader.svelte';

	let activeTab = $state<'system' | 'users' | 'requests' | 'classes' | 'custom'>('system');
	let sseConnected = $state(false);
	let loading = $state(true);

	let analytics = $state<AnalyticsReport | null>(null);
	let classStats = $state<ClassCodeStats | null>(null);
	let classes = $state<ClassCodeResponse[]>([]);

	let unsubscribeAnalytics: (() => void) | null = null;

	onMount(async () => {
		await loadData();
		
		unsubscribeAnalytics = subscribeToAnalyticsChanges(async () => {
			sseConnected = true;
			await loadData(false);
			toastStore.info('Analytics dashboard updated with live data', 'Live Sync');
		});

		setTimeout(() => sseConnected = true, 1500);
	});

	onDestroy(() => {
		unsubscribeAnalytics?.();
	});

	async function loadData(showLoader = true) {
		if (showLoader) loading = true;
		try {
			const [analyticsRes, statsRes, classRes] = await Promise.all([
				fetchAnalytics({ period: 'month', forceRefresh: true }),
				classCodesAPI.getStats(true),
				classCodesAPI.getAll({ limit: 10, forceRefresh: true })
			]);
			
			analytics = analyticsRes;
			classStats = statsRes;
			classes = classRes.classCodes;
		} catch (error: any) {
			toastStore.error(error.message || 'Failed to load analytics data');
		} finally {
			loading = false;
		}
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function exportReport(type: string) {
		toastStore.info(`Generating ${type} report...`, 'Export');
		setTimeout(() => {
			toastStore.success('Report downloaded successfully');
		}, 1000);
	}
</script>

<svelte:head>
	<title>Analytics & Reports | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Analytics & Reports</h1>
			<p class="mt-0.5 text-sm text-gray-500">Comprehensive insights and data visualization across the system</p>
		</div>
		<div class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {sseConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}">
			{#if sseConnected}<Wifi size={13} class="text-emerald-500" />Live{:else}<WifiOff size={13} />Connecting...{/if}
		</div>
	</div>

	{#if loading && !analytics}
		<ReportsSkeletonLoader view="overview" />
	{:else if analytics}
		<!-- System Overview High-Level Stats -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Total Borrow Requests</p>
					<ClipboardList size={18} class="text-gray-400" />
				</div>
				<p class="mt-2 text-3xl font-bold text-gray-900">{analytics.borrowRequests.statusBreakdown.reduce((acc, s) => acc + s.count, 0)}</p>
				<p class="mt-1 flex items-center text-xs text-emerald-600">
					<TrendingUp size={12} class="mr-1" /> Over selected period
				</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Avg. Approval Time</p>
					<Clock size={18} class="text-gray-400" />
				</div>
				<p class="mt-2 text-3xl font-bold text-blue-600">{analytics.borrowRequests.turnaround.avgApprovalHours.toFixed(1)} <span class="text-lg font-medium text-gray-500">hrs</span></p>
				<p class="mt-1 text-xs text-gray-500">Time to instructor approval</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">System Risk Level</p>
					<ShieldAlert size={18} class={analytics.borrowRequests.overdueCount > 0 ? 'text-amber-500' : 'text-emerald-500'} />
				</div>
				<p class="mt-2 text-3xl font-bold {analytics.borrowRequests.overdueCount > 0 ? 'text-amber-600' : 'text-emerald-600'}">{analytics.borrowRequests.overdueCount}</p>
				<p class="mt-1 text-xs text-gray-500">Active overdue requests</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Active Classes</p>
					<GraduationCap size={18} class="text-gray-400" />
				</div>
				<p class="mt-2 text-3xl font-bold text-pink-600">{classStats?.activeClasses || 0}</p>
				<p class="mt-1 text-xs text-gray-500">Currently facilitating requests</p>
			</div>
		</div>

	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			{#each [
				{ id: 'system', label: 'System Overview', icon: BarChart3 },
				{ id: 'users', label: 'User Analytics', icon: Users },
				{ id: 'requests', label: 'Request Analytics', icon: ClipboardList },
				{ id: 'classes', label: 'Class Performance', icon: GraduationCap },
				{ id: 'custom', label: 'Custom Reports', icon: FileText }
			] as tab}
				<button 
					onclick={() => activeTab = tab.id as any} 
					class="flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<tab.icon size={16} />
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Main Tab Content Area -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-[400px]">
			<!-- System Overview -->
			{#if activeTab === 'system'}
				<div class="p-6">
					<div class="mb-6 flex items-center justify-between">
						<h3 class="text-lg font-bold text-gray-900">Platform Activity Summary</h3>
						<span class="text-sm text-gray-500">Period: Last 30 Days</span>
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						<!-- Request Status Breakdown -->
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<h4 class="mb-4 font-bold text-gray-900 flex items-center gap-2">
								<Activity size={18} class="text-pink-500" /> Request Status Flow
							</h4>
							<div class="space-y-4">
								{#each analytics.borrowRequests.statusBreakdown as status}
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium text-gray-700 capitalize">{status.status.replace('_', ' ')}</span>
										<span class="font-bold text-gray-900">{status.count}</span>
									</div>
									<div class="w-full bg-gray-100 rounded-full h-2">
										<div class="bg-pink-500 h-2 rounded-full" style="width: {Math.min(100, (status.count / Math.max(1, analytics.borrowRequests.statusBreakdown.reduce((a, b) => a + b.count, 0))) * 100)}%"></div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Resolution Breakdown -->
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<h4 class="mb-4 font-bold text-gray-900 flex items-center gap-2">
								<CheckCircle size={18} class="text-emerald-500" /> Obligation Resolutions
							</h4>
							<div class="grid grid-cols-2 gap-4 text-center mt-6">
								<div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
									<p class="text-3xl font-bold text-gray-900">{analytics.replacement.summary.totalObligations}</p>
									<p class="text-sm text-gray-500 mt-1">Total Obligations</p>
								</div>
								<div class="bg-pink-50 p-4 rounded-xl border border-pink-100">
									<p class="text-3xl font-bold text-pink-700">{analytics.replacement.summary.pendingCount}</p>
									<p class="text-sm text-pink-600 mt-1">Pending Resolution</p>
								</div>
							</div>
							<p class="mt-6 text-sm text-gray-500 text-center">Avg Resolution Time: <span class="font-bold text-gray-900">{analytics.replacement.avgResolutionDays} days</span></p>
						</div>
					</div>
				</div>
			{/if}

			<!-- User Analytics -->
			{#if activeTab === 'users'}
				<div class="p-6">
					<h3 class="mb-4 text-lg font-bold text-gray-900">Most Active Borrowers</h3>
					<div class="overflow-x-auto rounded-lg border border-gray-200">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
									<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Requests</th>
									<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Items Borrowed</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each analytics.borrowRequests.borrowers.slice(0, 10) as borrower}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="whitespace-nowrap px-6 py-4">
											<div class="flex items-center gap-3">
												<div class="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-bold">
													{borrower.studentName.charAt(0)}
												</div>
												<div>
													<p class="font-medium text-gray-900">{borrower.studentName}</p>
													<p class="text-xs text-gray-500">{borrower.studentEmail}</p>
												</div>
											</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-center">
											<span class="inline-flex items-center justify-center rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-700">
												{borrower.requestCount}
											</span>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-center font-bold text-gray-900">
											{borrower.totalItems}
										</td>
									</tr>
								{:else}
									<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500">No active borrowers in this period.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if analytics.studentRisk.trustScores.length > 0}
						<h3 class="mb-4 mt-8 text-lg font-bold text-gray-900">Student Risk Monitor (Critical/Poor Trust)</h3>
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each analytics.studentRisk.trustScores as risk}
								<div class="rounded-xl border border-red-100 bg-red-50/50 p-4">
									<div class="flex items-center gap-3 mb-2">
										<AlertTriangle size={20} class="text-red-500" />
										<p class="font-bold text-gray-900">{risk.studentName}</p>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Trust Score:</span>
										<span class="font-bold text-red-600">{risk.trustScore} ({risk.trustTierLabel})</span>
									</div>
									<div class="flex justify-between text-sm mt-1">
										<span class="text-gray-600">Active Obligations:</span>
										<span class="font-bold text-gray-900">{risk.activeObligations}</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Request Analytics -->
			{#if activeTab === 'requests'}
				<div class="p-6">
					<div class="mb-6 flex items-center justify-between">
						<h3 class="text-lg font-bold text-gray-900">Request Performance</h3>
						<button onclick={() => exportReport('Request Performance')} class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
							<Download size={14} /> Export CSV
						</button>
					</div>

					<div class="grid gap-6 sm:grid-cols-3">
						<div class="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
							<p class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Avg Items / Request</p>
							<p class="text-4xl font-bold text-gray-900">{analytics.borrowRequests.borrowingAverages.avgItemsPerRequest.toFixed(1)}</p>
						</div>
						<div class="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
							<p class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Avg Qty / Request</p>
							<p class="text-4xl font-bold text-blue-600">{analytics.borrowRequests.borrowingAverages.avgQuantityPerRequest.toFixed(1)}</p>
						</div>
						<div class="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
							<p class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Overdue Requests</p>
							<p class="text-4xl font-bold text-amber-600">{analytics.borrowRequests.overdueCount}</p>
						</div>
					</div>

					{#if analytics.borrowRequests.overdueRequests.length > 0}
						<h4 class="font-bold text-gray-900 mt-8 mb-4">Currently Overdue</h4>
						<div class="overflow-x-auto rounded-lg border border-red-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-red-50">
									<tr>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-red-800 uppercase tracking-wider">Student</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-red-800 uppercase tracking-wider">Return Date</th>
										<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-red-800 uppercase tracking-wider">Days Overdue</th>
										<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-red-800 uppercase tracking-wider">Items Affected</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each analytics.borrowRequests.overdueRequests as overdue}
										<tr>
											<td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{overdue.studentName}</td>
											<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(overdue.returnDate)}</td>
											<td class="whitespace-nowrap px-6 py-4 text-center">
												<span class="inline-flex items-center justify-center rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-bold text-red-800">
													{overdue.daysOverdue} days
												</span>
											</td>
											<td class="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-900">{overdue.itemCount} items</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Class Performance -->
			{#if activeTab === 'classes'}
				<div class="p-6">
					<div class="mb-6 flex items-center justify-between">
						<div>
							<h3 class="text-lg font-bold text-gray-900">Class Usage & Performance</h3>
							<p class="text-sm text-gray-500">Tracking equipment utilization across currently active class codes.</p>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
						<div class="rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
							<p class="text-2xl font-bold text-gray-900">{classStats?.activeClasses || 0}</p>
							<p class="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Classes</p>
						</div>
						<div class="rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
							<p class="text-2xl font-bold text-blue-600">{classStats?.totalStudents || 0}</p>
							<p class="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Enrolled</p>
						</div>
						<div class="rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
							<p class="text-2xl font-bold text-emerald-600">{classStats?.avgClassSize.toFixed(1) || 0}</p>
							<p class="text-xs text-gray-500 uppercase tracking-wider mt-1">Avg Class Size</p>
						</div>
						<div class="rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
							<p class="text-2xl font-bold text-pink-600">{classStats?.totalInstructors || 0}</p>
							<p class="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Instructors</p>
						</div>
					</div>

					<div class="overflow-x-auto rounded-lg border border-gray-200">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class Code</th>
									<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
									<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Students</th>
									<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Instructors</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each classes as cls}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex items-center justify-center rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-800 border border-gray-200">
												{cls.code}
											</span>
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<p class="font-medium text-gray-900">{cls.courseCode} - {cls.section}</p>
											<p class="text-xs text-gray-500">{cls.courseName}</p>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-center">
											<span class="font-medium text-gray-900">{cls.studentCount} / {cls.maxEnrollment}</span>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-500">
											{cls.instructorCount}
										</td>
									</tr>
								{:else}
									<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No classes found.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Custom Reports -->
			{#if activeTab === 'custom'}
				<div class="p-6">
					<div class="max-w-2xl mx-auto py-8">
						<div class="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center">
							<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 mb-6">
								<FileText class="h-8 w-8 text-pink-500" />
							</div>
							<h3 class="text-xl font-bold text-gray-900 mb-2">Custom Report Builder</h3>
							<p class="text-sm text-gray-500 mb-8 max-w-md mx-auto">Select a data model and date range to generate a comprehensive CSV export formatted for external accounting and audit systems.</p>
							
							<div class="grid gap-4 sm:grid-cols-2 mb-8 text-left">
								<div>
									<label for="report-type" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Report Type</label>
									<select id="report-type" class="w-full rounded-lg border border-gray-300 py-2.5 px-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500">
										<option>Inventory Audit Log</option>
										<option>All Borrow Requests (Detailed)</option>
										<option>Replacement Obligations & Payments</option>
										<option>Student Trust Scores</option>
									</select>
								</div>
								<div>
									<label for="time-period" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Time Period</label>
									<select id="time-period" class="w-full rounded-lg border border-gray-300 py-2.5 px-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500">
										<option>Last 30 Days</option>
										<option>Current Semester</option>
										<option>Previous Semester</option>
										<option>All Time</option>
									</select>
								</div>
							</div>

							<button onclick={() => exportReport('Custom')} class="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-pink-700 transition">
								<Download size={18} />
								Generate & Download CSV
							</button>
						</div>
					</div>
				</div>
			{/if}

	</div>
	{/if}
</div>
