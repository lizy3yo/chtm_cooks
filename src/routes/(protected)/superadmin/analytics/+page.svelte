<script lang="ts">
	import { TrendingUp, TrendingDown, Users, Activity, Package, FileText } from 'lucide-svelte';

	// Mock data
	let timeRange = $state('7d');
	
	let metrics = $state({
		totalUsers: { value: 1247, change: 12.5, trend: 'up' },
		activeUsers: { value: 892, change: 8.3, trend: 'up' },
		totalRequests: { value: 3456, change: -3.2, trend: 'down' },
		systemUptime: { value: 99.8, change: 0.2, trend: 'up' }
	});

	let chartData = $state([
		{ date: 'Mon', users: 120, requests: 450 },
		{ date: 'Tue', users: 145, requests: 520 },
		{ date: 'Wed', users: 132, requests: 480 },
		{ date: 'Thu', users: 158, requests: 590 },
		{ date: 'Fri', users: 175, requests: 620 },
		{ date: 'Sat', users: 95, requests: 320 },
		{ date: 'Sun', users: 87, requests: 290 }
	]);

	function getTrendIcon(trend: string) {
		return trend === 'up' ? TrendingUp : TrendingDown;
	}

	function getTrendColor(trend: string) {
		return trend === 'up' ? 'text-emerald-600' : 'text-red-600';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Analytics & Reports</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor system performance and user activity</p>
		</div>
		<select
			bind:value={timeRange}
			class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
		>
			<option value="24h">Last 24 Hours</option>
			<option value="7d">Last 7 Days</option>
			<option value="30d">Last 30 Days</option>
			<option value="90d">Last 90 Days</option>
		</select>
	</div>

	<!-- Key Metrics -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Total Users -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
					<Users size={20} class="text-purple-600" />
				</div>
				<span class="flex items-center gap-1 text-sm font-medium {getTrendColor(metrics.totalUsers.trend)}">
					<svelte:component this={getTrendIcon(metrics.totalUsers.trend)} size={16} />
					{Math.abs(metrics.totalUsers.change)}%
				</span>
			</div>
			<p class="mt-4 text-sm text-gray-500">Total Users</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{metrics.totalUsers.value.toLocaleString()}</p>
		</div>

		<!-- Active Users -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
					<Activity size={20} class="text-emerald-600" />
				</div>
				<span class="flex items-center gap-1 text-sm font-medium {getTrendColor(metrics.activeUsers.trend)}">
					<svelte:component this={getTrendIcon(metrics.activeUsers.trend)} size={16} />
					{Math.abs(metrics.activeUsers.change)}%
				</span>
			</div>
			<p class="mt-4 text-sm text-gray-500">Active Users</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{metrics.activeUsers.value.toLocaleString()}</p>
		</div>

		<!-- Total Requests -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
					<Package size={20} class="text-blue-600" />
				</div>
				<span class="flex items-center gap-1 text-sm font-medium {getTrendColor(metrics.totalRequests.trend)}">
					<svelte:component this={getTrendIcon(metrics.totalRequests.trend)} size={16} />
					{Math.abs(metrics.totalRequests.change)}%
				</span>
			</div>
			<p class="mt-4 text-sm text-gray-500">Total Requests</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{metrics.totalRequests.value.toLocaleString()}</p>
		</div>

		<!-- System Uptime -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
					<FileText size={20} class="text-indigo-600" />
				</div>
				<span class="flex items-center gap-1 text-sm font-medium {getTrendColor(metrics.systemUptime.trend)}">
					<svelte:component this={getTrendIcon(metrics.systemUptime.trend)} size={16} />
					{Math.abs(metrics.systemUptime.change)}%
				</span>
			</div>
			<p class="mt-4 text-sm text-gray-500">System Uptime</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{metrics.systemUptime.value}%</p>
		</div>
	</div>

	<!-- Charts -->
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- User Activity Chart -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="text-lg font-semibold text-gray-900">User Activity</h3>
			<p class="mt-1 text-sm text-gray-500">Daily active users over time</p>
			<div class="mt-6 h-64 flex items-end justify-between gap-2">
				{#each chartData as day}
					<div class="flex flex-1 flex-col items-center gap-2">
						<div class="w-full rounded-t-lg bg-purple-600 transition-all hover:bg-purple-700" style="height: {(day.users / 200) * 100}%"></div>
						<span class="text-xs text-gray-500">{day.date}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Request Volume Chart -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="text-lg font-semibold text-gray-900">Request Volume</h3>
			<p class="mt-1 text-sm text-gray-500">Daily requests over time</p>
			<div class="mt-6 h-64 flex items-end justify-between gap-2">
				{#each chartData as day}
					<div class="flex flex-1 flex-col items-center gap-2">
						<div class="w-full rounded-t-lg bg-blue-600 transition-all hover:bg-blue-700" style="height: {(day.requests / 700) * 100}%"></div>
						<span class="text-xs text-gray-500">{day.date}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- User Distribution -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h3 class="text-lg font-semibold text-gray-900">User Distribution by Role</h3>
		</div>
		<div class="p-6">
			<div class="space-y-4">
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-gray-700">Students</span>
						<span class="text-sm font-semibold text-gray-900">687 (55%)</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
						<div class="h-full rounded-full bg-blue-600" style="width: 55%"></div>
					</div>
				</div>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-gray-700">Instructors</span>
						<span class="text-sm font-semibold text-gray-900">312 (25%)</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
						<div class="h-full rounded-full bg-purple-600" style="width: 25%"></div>
					</div>
				</div>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-gray-700">Custodians</span>
						<span class="text-sm font-semibold text-gray-900">187 (15%)</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
						<div class="h-full rounded-full bg-pink-600" style="width: 15%"></div>
					</div>
				</div>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-gray-700">Admins</span>
						<span class="text-sm font-semibold text-gray-900">61 (5%)</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
						<div class="h-full rounded-full bg-indigo-600" style="width: 5%"></div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Export Options -->
	<div class="flex gap-3">
		<button class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
			Export as PDF
		</button>
		<button class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
			Export as CSV
		</button>
		<button class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
			Export as Excel
		</button>
	</div>
</div>
